import { Router } from 'express';
import { AppRequest } from '../middleware/index';
import { AppError } from '../middleware/errorHandler';
import { requireRole } from '../middleware/auth';
import prisma from '../lib/prisma';
import {
  notificationQuerySchema,
  broadcastNotificationSchema,
  type NotificationSummary,
} from '@drcip/contracts';
import { NotificationService } from '../services/NotificationService';

const router = Router();

// A stable per-recipient grouping key for the same logical event across channels.
// The persisted dedupeKey is {type}:{channel}:{userId}:{logicalRef}; dropping the
// channel segment makes IN_APP + EMAIL siblings of one event share a logical_key.
// Fallback covers rows without a dedupeKey using event-derived fields (also
// identical between a channel sibling pair).
function logicalKeyFor(n: {
  dedupeKey: string | null;
  notificationType: string;
  payload: unknown;
  incident: { publicId: string } | null;
  assignment: { publicId: string } | null;
}): string {
  if (n.dedupeKey) {
    const parts = n.dedupeKey.split(':');
    return `${parts[0]}:${parts.slice(2).join(':')}`;
  }
  const payload = (n.payload ?? {}) as Record<string, unknown>;
  return `${n.notificationType}:${n.incident?.publicId ?? ''}:${n.assignment?.publicId ?? ''}:${JSON.stringify(payload)}`;
}

function serializeNotification(n: {
  publicId: string;
  channel: string;
  notificationType: string;
  priority: string;
  payload: unknown;
  deliveryStatus: string;
  sentAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
  dedupeKey: string | null;
  incident: { publicId: string } | null;
  assignment: { publicId: string } | null;
}): NotificationSummary {
  const payload = (n.payload ?? {}) as Record<string, unknown>;
  return {
    id: n.publicId,
    public_id: n.publicId,
    logical_key: logicalKeyFor(n),
    channel: n.channel as NotificationSummary['channel'],
    notification_type: n.notificationType as NotificationSummary['notification_type'],
    priority: n.priority as NotificationSummary['priority'],
    message: typeof payload.message === 'string' ? payload.message : '',
    payload,
    delivery_status: n.deliveryStatus as NotificationSummary['delivery_status'],
    sent_at: n.sentAt ? n.sentAt.toISOString() : null,
    read_at: n.readAt ? n.readAt.toISOString() : null,
    incident_public_id: n.incident?.publicId ?? null,
    assignment_public_id: n.assignment?.publicId ?? null,
    created_at: n.createdAt.toISOString(),
  };
}

const related = { incident: { select: { publicId: true } }, assignment: { select: { publicId: true } } };

const notificationWhere = (req: AppRequest, params: { unreadOnly?: boolean; notification_type?: string }) => {
  const where: Record<string, unknown> = { recipientUserId: req.userId };
  // Unread state lives only on IN_APP rows (read_at is null forever on EMAIL/SMS),
  // so an unread query must exclude those rows or the bell badge overcounts.
  if (params.unreadOnly) {
    where.channel = 'IN_APP';
    where.readAt = null;
  }
  if (params.notification_type) where.notificationType = params.notification_type;
  return where;
};

// GET /api/v1/notifications — the authenticated user's own notifications
router.get('/', async (req: AppRequest, res, next) => {
  try {
    const query = notificationQuerySchema.parse(req.query);
    const unreadOnly = query.unread_only === 'true';
    const offset = (query.page - 1) * query.limit;

    const where = notificationWhere(req, { unreadOnly, notification_type: query.notification_type });

    const [rows, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: related,
        orderBy: { createdAt: query.sort === 'oldest' ? 'asc' : 'desc' },
        skip: offset,
        take: query.limit,
      }),
      prisma.notification.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        items: rows.map(serializeNotification),
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          total_pages: Math.ceil(total / query.limit),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/notifications/:notificationId/read — owner only, idempotent.
// Applies to IN_APP rows; EMAIL/SMS rows are read-state-free (read_at stays null).
router.post('/:notificationId/read', async (req: AppRequest, res, next) => {
  try {
    const notification = await prisma.notification.findFirst({
      where: { publicId: req.params.notificationId },
      include: related,
    });
    if (!notification) throw new AppError(404, 'NOT_FOUND', 'Notification not found');
    if (notification.recipientUserId !== req.userId) {
      throw new AppError(404, 'NOT_FOUND', 'Notification not found');
    }

    if (notification.channel === 'IN_APP' && !notification.readAt) {
      notification.readAt = new Date();
      await prisma.notification.update({ where: { id: notification.id }, data: { readAt: notification.readAt } });
    }

    res.json({ success: true, data: serializeNotification(notification) });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/notifications/broadcast — Coordinator/Admin emergency broadcast.
router.post('/broadcast', requireRole('DISASTER_COORDINATOR', 'ADMINISTRATOR'), async (req: AppRequest, res, next) => {
  try {
    const body = broadcastNotificationSchema.parse(req.body);
    const broadcastId = crypto.randomUUID();

    const result = await prisma.$transaction(async (tx) => {
      const { recipients, rows } = await NotificationService.notifyBroadcast(tx, {
        broadcastId,
        message: body.message,
        severity: body.severity,
        scope: body.recipient_scope,
      });

      await tx.auditLog.create({
        data: {
          actorUserId: req.userId,
          action: 'NOTIFICATION_BROADCAST',
          entityType: 'NOTIFICATION',
          entityId: null,
          afterState: {
            message: body.message,
            severity: body.severity,
            recipient_scope: body.recipient_scope,
            recipient_count: recipients.length,
            channels: ['IN_APP', 'EMAIL'],
          },
          metadata: { broadcast_id: broadcastId, recipient_scope: body.recipient_scope },
        },
      });

      return { rows, recipientCount: recipients.length };
    });

    await NotificationService.afterCommit(result.rows);

    res.status(201).json({
      success: true,
      data: {
        recipient_count: result.recipientCount,
        severity: body.severity,
        recipient_scope: body.recipient_scope,
        notification_ids: result.rows.map((r) => r.publicId),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;