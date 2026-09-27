import { Prisma, UserRole } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { WebSocketService } from './WebSocketService';
import { getEmailProvider } from './EmailProvider';
import type {
  NotificationPriority,
  NotificationRecipientScope,
  NotificationType,
} from '@drcip/contracts';

const OPERATIONAL_ROLES = ['FIELD_OFFICER', 'DISASTER_COORDINATOR', 'ADMINISTRATOR'];

export type NotificationChannelValue = 'IN_APP' | 'EMAIL' | 'SMS';

// Minimal shape of a persisted notification row that callers need after their
// originating transaction commits (WebSocket publish + external dispatch).
export interface CreatedNotification {
  id: string;
  publicId: string;
  recipientUserId: string;
  channel: NotificationChannelValue;
  notificationType: NotificationType;
  priority: NotificationPriority;
  message: string;
  deliveryStatus: 'PENDING' | 'SENT' | 'FAILED';
}

export interface NotificationRecipient {
  userId: string;
  role: string;
  email: string | null;
  isActive: boolean;
}

// Channel policy: citizens get IN_APP only; operational roles also get EMAIL.
// SMS is behind the SmsProvider adapter boundary and is only used for emergency
// broadcasts; without a configured SMS_PROVIDER no SMS rows are created.
function channelsFor(role: string): NotificationChannelValue[] {
  return OPERATIONAL_ROLES.includes(role) ? ['IN_APP', 'EMAIL'] : ['IN_APP'];
}

function newPublicId(): string {
  return `NTF-${uuidv4().slice(0, 8).toUpperCase()}`;
}

export class NotificationService {
  // -------------------------------------------------------------------------
  // Recipient resolution and durable row creation (runs inside the caller's tx)
  // -------------------------------------------------------------------------

  static async roleRecipients(tx: Prisma.TransactionClient, roles: string[]): Promise<NotificationRecipient[]> {
    const users = await tx.user.findMany({
      where: { role: { in: roles as UserRole[] }, isActive: true },
      select: { id: true, role: true, email: true, isActive: true },
    });
    return users.map((u) => ({ userId: u.id, role: u.role, email: u.email, isActive: u.isActive }));
  }

  static async userRecipient(tx: Prisma.TransactionClient, userId: string): Promise<NotificationRecipient | null> {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true, isActive: true },
    });
    if (!user) return null;
    return { userId: user.id, role: user.role, email: user.email, isActive: user.isActive };
  }

  // DedupeKey = {type}:{channel}:{recipientUserId}:{logicalRef}. Two identical
  // produces (e.g. same state re-transition) collapse to one notification.
  static async createRows(
    tx: Prisma.TransactionClient,
    input: {
      recipients: NotificationRecipient[];
      notificationType: NotificationType;
      priority: NotificationPriority;
      message: string;
      payload: Record<string, unknown>;
      incidentId?: string | null;
      assignmentId?: string | null;
      dedupeRef: string;
    },
  ): Promise<CreatedNotification[]> {
    const recipients = input.recipients.filter((r) => r.isActive);
    if (recipients.length === 0) return [];

    const keys = recipients.flatMap((r) => channelsFor(r.role).map((c) => `${input.notificationType}:${c}:${r.userId}:${input.dedupeRef}`));
    const existing = await tx.notification.findMany({
      where: { dedupeKey: { in: keys } },
      select: { dedupeKey: true },
    });
    const existingKeys = new Set(existing.map((n) => n.dedupeKey).filter((k): k is string => Boolean(k)));

    const created: CreatedNotification[] = [];
    for (const r of recipients) {
      for (const channel of channelsFor(r.role)) {
        const dedupeKey = `${input.notificationType}:${channel}:${r.userId}:${input.dedupeRef}`;
        if (existingKeys.has(dedupeKey)) continue;
        const payload = { ...input.payload, message: input.message };
        const row = await tx.notification.create({
          data: {
            publicId: newPublicId(),
            recipientUserId: r.userId,
            incidentId: input.incidentId ?? null,
            assignmentId: input.assignmentId ?? null,
            channel,
            notificationType: input.notificationType,
            payload: payload as Prisma.InputJsonValue,
            priority: input.priority,
            deliveryStatus: channel === 'IN_APP' ? 'SENT' : 'PENDING',
            sentAt: channel === 'IN_APP' ? new Date() : null,
            dedupeKey,
          },
        });
        created.push({
          id: row.id,
          publicId: row.publicId,
          recipientUserId: row.recipientUserId,
          channel: row.channel as NotificationChannelValue,
          notificationType: row.notificationType as NotificationType,
          priority: row.priority as NotificationPriority,
          message: input.message,
          deliveryStatus: row.deliveryStatus as 'PENDING' | 'SENT' | 'FAILED',
        });
      }
    }
    return created;
  }

  // -------------------------------------------------------------------------
  // Trigger-specific creators. Priority is always an explicit per-trigger value.
  // -------------------------------------------------------------------------

  // Escalation: confirmed severity HIGH/CRITICAL -> all active coordinators +
  // administrators. Priority follows the incident severity.
  static notifyEscalation(
    tx: Prisma.TransactionClient,
    input: { incidentId: string; incidentPublicId: string; severity: NotificationPriority },
  ): Promise<CreatedNotification[]> {
    return NotificationService.roleRecipients(tx, ['DISASTER_COORDINATOR', 'ADMINISTRATOR']).then((recipients) =>
      NotificationService.createRows(tx, {
        recipients,
        notificationType: 'INCIDENT_ESCALATION',
        priority: input.severity,
        message: `Incident ${input.incidentPublicId} escalated to ${input.severity} severity.`,
        payload: { incident_public_id: input.incidentPublicId, severity: input.severity },
        incidentId: input.incidentId,
        dedupeRef: `${input.incidentId}:ESCALATION:${input.severity}`,
      }),
    );
  }

  // Assignment created -> the leading Field Officer only.
  static async notifyAssignmentCreated(
    tx: Prisma.TransactionClient,
    input: {
      incidentId: string;
      incidentPublicId: string;
      assignmentId: string;
      assignmentPublicId: string;
      teamLeaderUserId: string | null;
    },
  ): Promise<CreatedNotification[]> {
    if (!input.teamLeaderUserId) return [];
    const leader = await NotificationService.userRecipient(tx, input.teamLeaderUserId);
    if (!leader) return [];
    return NotificationService.createRows(tx, {
      recipients: [leader],
      notificationType: 'ASSIGNMENT_CREATED',
      priority: 'MEDIUM',
      message: `New assignment ${input.assignmentPublicId} issued for incident ${input.incidentPublicId}.`,
      payload: { assignment_public_id: input.assignmentPublicId, incident_public_id: input.incidentPublicId },
      incidentId: input.incidentId,
      assignmentId: input.assignmentId,
      dedupeRef: `${input.assignmentId}:CREATED`,
    });
  }

  // Assignment status transition -> reporter citizen + assigned team leader.
  static async notifyAssignmentStatus(
    tx: Prisma.TransactionClient,
    input: {
      incidentId: string;
      incidentPublicId: string;
      assignmentId: string;
      assignmentPublicId: string;
      reporterUserId: string;
      teamLeaderUserIds: string[];
      status: string;
    },
  ): Promise<CreatedNotification[]> {
    const priority: NotificationPriority =
      input.status === 'CANCELLED' ? 'HIGH' : input.status === 'IN_PROGRESS' ? 'MEDIUM' : 'LOW';
    return NotificationService.resolveExplicitRecipients(tx, [
      input.reporterUserId,
      ...input.teamLeaderUserIds,
    ]).then((recipients) =>
      NotificationService.createRows(tx, {
        recipients,
        notificationType: 'ASSIGNMENT_STATUS_UPDATE',
        priority,
        message: `Assignment ${input.assignmentPublicId} for incident ${input.incidentPublicId} is now ${input.status}.`,
        payload: {
          assignment_public_id: input.assignmentPublicId,
          incident_public_id: input.incidentPublicId,
          status: input.status,
        },
        incidentId: input.incidentId,
        assignmentId: input.assignmentId,
        dedupeRef: `${input.assignmentId}:STATUS:${input.status}`,
      }),
    );
  }

  // Incident status transition -> reporter citizen + assigned team leaders.
  static async notifyIncidentStatus(
    tx: Prisma.TransactionClient,
    input: {
      incidentId: string;
      incidentPublicId: string;
      reporterUserId: string;
      teamLeaderUserIds: string[];
      status: string;
    },
  ): Promise<CreatedNotification[]> {
    const priority: NotificationPriority =
      input.status === 'IN_RESPONSE' ? 'HIGH' : input.status === 'RESOLVED' ? 'MEDIUM' : input.status === 'TRIAGE_PENDING' ? 'MEDIUM' : 'LOW';
    return NotificationService.resolveExplicitRecipients(tx, [
      input.reporterUserId,
      ...input.teamLeaderUserIds,
    ]).then((recipients) =>
      NotificationService.createRows(tx, {
        recipients,
        notificationType: 'INCIDENT_STATUS_UPDATE',
        priority,
        message: `Incident ${input.incidentPublicId} status changed to ${input.status}.`,
        payload: { incident_public_id: input.incidentPublicId, status: input.status },
        incidentId: input.incidentId,
        dedupeRef: `${input.incidentId}:STATUS:${input.status}`,
      }),
    );
  }

  // Field team status change -> active coordinators + administrators.
  static notifyTeamStatus(
    tx: Prisma.TransactionClient,
    input: { teamId: string; teamPublicId: string; teamName: string; status: string },
  ): Promise<CreatedNotification[]> {
    const priority: NotificationPriority =
      input.status === 'DEPLOYED' ? 'HIGH' : input.status === 'MAINTENANCE' ? 'LOW' : 'MEDIUM';
    return NotificationService.roleRecipients(tx, ['DISASTER_COORDINATOR', 'ADMINISTRATOR']).then((recipients) =>
      NotificationService.createRows(tx, {
        recipients,
        notificationType: 'SYSTEM',
        priority,
        message: `Field team ${input.teamPublicId} (${input.teamName}) is now ${input.status}.`,
        payload: { event: 'TEAM_STATUS_UPDATE', team_public_id: input.teamPublicId, team_name: input.teamName, status: input.status },
        incidentId: null,
        assignmentId: null,
        dedupeRef: `${input.teamId}:STATUS:${input.status}`,
      }),
    );
  }

  // Emergency broadcast -> recipients scoped by role. Severity doubles as the
  // priority (explicitly requested by the caller). broadcastId keys dedupe so a
  // single broadcast targets each recipient once across channels.
  static async notifyBroadcast(
    tx: Prisma.TransactionClient,
    input: {
      broadcastId: string;
      message: string;
      severity: NotificationPriority;
      scope: NotificationRecipientScope;
    },
  ): Promise<{ recipients: NotificationRecipient[]; rows: CreatedNotification[] }> {
    const roleMap: Record<NotificationRecipientScope, string[]> = {
      ALL: ['CITIZEN', 'FIELD_OFFICER', 'DISASTER_COORDINATOR', 'ADMINISTRATOR'],
      FIELD_OFFICERS: ['FIELD_OFFICER'],
      COORDINATORS: ['DISASTER_COORDINATOR', 'ADMINISTRATOR'],
      CITIZENS: ['CITIZEN'],
    };
    const recipients = await NotificationService.roleRecipients(tx, roleMap[input.scope]);
    const rows = await NotificationService.createRows(tx, {
      recipients,
      notificationType: 'EMERGENCY_BROADCAST',
      priority: input.severity,
      message: input.message,
      payload: { recipient_scope: input.scope },
      incidentId: null,
      assignmentId: null,
      dedupeRef: `BROADCAST:${input.broadcastId}`,
    });
    return { recipients, rows };
  }

  private static async resolveExplicitRecipients(
    tx: Prisma.TransactionClient,
    userIds: string[],
  ): Promise<NotificationRecipient[]> {
    const seen = new Set<string>();
    const out: NotificationRecipient[] = [];
    for (const id of userIds) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const r = await NotificationService.userRecipient(tx, id);
      if (r) out.push(r);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Post-commit: WebSocket publish then external dispatch. Provider failure
  // must never roll back the originating domain transaction (it already ran).
  // -------------------------------------------------------------------------

  static async afterCommit(rows: CreatedNotification[]) {
    NotificationService.publishCreated(rows);
    await NotificationService.dispatchExternal(rows);
  }

  static publishCreated(rows: CreatedNotification[]) {
    try {
      const ws = WebSocketService.getInstance();
      const seen = new Set<string>();
      for (const row of rows) {
        if (row.channel !== 'IN_APP' || seen.has(row.recipientUserId)) continue;
        seen.add(row.recipientUserId);
        ws.publishNotificationCreated(row.recipientUserId, row.publicId, row.notificationType);
      }
    } catch {
      // WebSocket publishing is best-effort; REST is authoritative.
    }
  }

  static async dispatchExternal(rows: CreatedNotification[]) {
    const external = rows.filter((r) => r.channel === 'EMAIL' && r.deliveryStatus === 'PENDING');
    if (external.length === 0) return;
    const provider = getEmailProvider();
    for (const row of external) {
      let outcome: 'SENT' | 'FAILED' = 'SENT';
      let sentAt: Date | null = new Date();
      try {
        const user = await prisma.user.findUnique({
          where: { id: row.recipientUserId },
          select: { email: true, fullName: true },
        });
        if (!user?.email) throw new Error(`Recipient ${row.recipientUserId} has no email address`);
        await provider.send({
          recipientEmail: user.email,
          recipientUserId: row.recipientUserId,
          subject: `DRCIP · ${row.notificationType.replace(/_/g, ' ')}`,
          body: row.message,
        });
      } catch (err) {
        outcome = 'FAILED';
        sentAt = null;
        console.error(`[NotificationService] ${row.publicId} dispatch failed:`, (err as Error).message);
      }
      try {
        await prisma.$transaction(async (tx) => {
          await tx.notification.update({
            where: { id: row.id },
            data: { deliveryStatus: outcome, sentAt },
          });
          await tx.auditLog.create({
            data: {
              actorUserId: null,
              action: 'NOTIFICATION_DISPATCH',
              entityType: 'NOTIFICATION',
              entityId: row.id,
              afterState: { public_id: row.publicId, channel: row.channel, delivery_status: outcome },
              metadata: { notification_public_id: row.publicId, channel: row.channel, outcome },
            },
          });
        });
      } catch (err) {
        // The row stays PENDING; the failure is surfaced in logs, not silent.
        console.error(`[NotificationService] ${row.publicId} dispatch record failed:`, (err as Error).message);
      }
    }
  }
}