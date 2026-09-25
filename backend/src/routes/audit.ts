import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { requireRole } from '../middleware/auth';
import { AppRequest } from '../middleware/index';
import prisma from '../lib/prisma';
import { auditLogQuerySchema } from '@drcip/contracts';

const router = Router();

// GET /api/v1/audit-logs
router.get('/', requireRole('DISASTER_COORDINATOR', 'ADMINISTRATOR'), async (req: AppRequest, res, next) => {
  try {
    const query = auditLogQuerySchema.parse(req.query);
    const offset = (query.page - 1) * query.limit;

    const where: Prisma.AuditLogWhereInput = {};

    if (query.action) where.action = query.action;
    if (query.entity_type) where.entityType = query.entity_type;
    if (query.entity_id) where.entityId = query.entity_id;

    // Resolve actor_user_id (public ID → internal ID)
    if (query.actor_user_id) {
      const actor = await prisma.user.findUnique({
        where: { publicId: query.actor_user_id },
        select: { id: true },
      });
      if (!actor) {
        // No user found → empty result
        return res.json({
          success: true,
          data: {
            items: [],
            pagination: { page: query.page, limit: query.limit, total: 0, total_pages: 0 },
          },
        });
      }
      where.actorUserId = actor.id;
    }

    if (query.from || query.to) {
      where.occurredAt = {};
      if (query.from) where.occurredAt.gte = new Date(query.from);
      if (query.to) where.occurredAt.lte = new Date(query.to);
    }

    if (query.search) {
      const s = query.search;
      where.OR = [
        { action: { contains: s, mode: 'insensitive' } },
        { entityType: { contains: s, mode: 'insensitive' } },
      ];
    }

    const order = query.sort === 'oldest' ? 'asc' : 'desc';

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: offset,
        take: query.limit,
        orderBy: { occurredAt: order },
        select: {
          id: true,
          actorUserId: true,
          action: true,
          entityType: true,
          entityId: true,
          metadata: true,
          occurredAt: true,
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Batch-resolve actor names
    const actorIds = [...new Set(logs.map((l) => l.actorUserId).filter(Boolean))] as string[];
    const actors = actorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, a.fullName]));

    res.json({
      success: true,
      data: {
        items: logs.map((l) => ({
          id: l.id,
          actor_user_id: l.actorUserId,
          actor_name: l.actorUserId ? actorMap.get(l.actorUserId) ?? null : null,
          action: l.action,
          entity_type: l.entityType,
          entity_id: l.entityId,
          metadata: l.metadata,
          occurred_at: l.occurredAt,
        })),
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

// GET /api/v1/audit-logs/:logId
router.get('/:logId', requireRole('DISASTER_COORDINATOR', 'ADMINISTRATOR'), async (req: AppRequest, res, next) => {
  try {
    const log = await prisma.auditLog.findFirst({
      where: { id: req.params.logId },
      select: {
        id: true,
        actorUserId: true,
        action: true,
        entityType: true,
        entityId: true,
        beforeState: true,
        afterState: true,
        metadata: true,
        occurredAt: true,
      },
    });

    if (!log) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Audit log not found' },
        request_id: req.requestId,
      });
    }

    // Resolve actor
    let actorName: string | null = null;
    let actorEmail: string | null = null;
    if (log.actorUserId) {
      const actor = await prisma.user.findUnique({
        where: { id: log.actorUserId },
        select: { fullName: true, email: true },
      });
      actorName = actor?.fullName ?? null;
      actorEmail = actor?.email ?? null;
    }

    res.json({
      success: true,
      data: {
        id: log.id,
        actor_user_id: log.actorUserId,
        actor_name: actorName,
        actor_email: actorEmail,
        action: log.action,
        entity_type: log.entityType,
        entity_id: log.entityId,
        before_state: log.beforeState,
        after_state: log.afterState,
        metadata: log.metadata,
        occurred_at: log.occurredAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
