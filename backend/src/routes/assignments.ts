import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { AppRequest } from '../middleware/index';
import { AppError } from '../middleware/errorHandler';
import { requireRole } from '../middleware/auth';
import prisma from '../lib/prisma';
import { publicId } from '../lib/publicId';
import {
  assignmentInclude,
  serializeAssignment,
  queryAssignments,
  type AssignmentWithRelations,
} from '../lib/assignmentSerializer';
import {
  createAssignmentSchema,
  assignmentQuerySchema,
  assignmentStatusUpdateSchema,
  assignmentEventSchema,
  fieldUpdateSchema,
  type ResourceAssignmentItemInput,
  type TeamAssignmentItemInput,
  type ShelterAssignmentItemInput,
} from '@drcip/contracts';
import { WebSocketService } from '../services/WebSocketService';

// Assignment reads: Field Officer (own team only), Coordinator, Administrator.
const READ_ROLES = ['FIELD_OFFICER', 'DISASTER_COORDINATOR', 'ADMINISTRATOR'];
// Assignment creation and lifecycle: Coordinator and Administrator only.
const WRITE_ROLES = ['DISASTER_COORDINATOR', 'ADMINISTRATOR'];

// WebSocket is optional at runtime (e.g. during tests). Publishing happens only
// after a successful transaction and must never block a committed write.
function getWsService() {
  try {
    return WebSocketService.getInstance();
  } catch {
    return {
      publishAssignmentCreated: () => {},
      publishAssignmentUpdated: () => {},
      publishIncidentUpdated: () => {},
      publishResourceUpdated: () => {},
      publishTeamUpdated: () => {},
    };
  }
}

function notFound() {
  return new AppError(404, 'NOT_FOUND', 'Assignment not found');
}

// The assignments router is mounted at /api/v1/assignments. The creation route
// is incident-scoped per the API contract, so it lives on a second router
// mounted at /api/v1/incidents (same pattern as the media router).
export const assignmentsRouter = Router();
export const incidentAssignmentsRouter = Router();

// POST /api/v1/incidents/:incidentId/assignments — Coordinator/Admin
incidentAssignmentsRouter.post(
  '/:incidentId/assignments',
  requireRole(...WRITE_ROLES),
  async (req: AppRequest, res, next) => {
    try {
      const body = createAssignmentSchema.parse(req.body);

      const incident = await prisma.incident.findUnique({
        where: { publicId: req.params.incidentId },
        select: { id: true, publicId: true, status: true },
      });
      if (!incident) {
        throw new AppError(404, 'NOT_FOUND', 'Incident not found');
      }
      if (incident.status === 'RESOLVED') {
        throw new AppError(422, 'INCIDENT_RESOLVED', 'Cannot assign resources to a resolved incident');
      }

      let recommendationId: string | null = null;
      if (body.recommendation_id) {
        const rec = await prisma.allocationRecommendation.findUnique({
          where: { publicId: body.recommendation_id },
          select: { id: true, incidentId: true },
        });
        if (!rec || rec.incidentId !== incident.id) {
          throw new AppError(422, 'INVALID_REFERENCE', 'Recommendation does not belong to this incident');
        }
        recommendationId = rec.id;
      }

      const teamItems = body.items.filter((i): i is TeamAssignmentItemInput => 'team_id' in i);
      if (teamItems.length > 1) {
        throw new AppError(
          422,
          'MULTIPLE_TEAMS',
          'An assignment may include at most one Field Team; create separate assignments for additional teams',
        );
      }

      const resourceItems = body.items.filter((i): i is ResourceAssignmentItemInput => 'resource_id' in i);
      const shelterItems = body.items.filter((i): i is ShelterAssignmentItemInput => 'shelter_id' in i);
      const resourceRefs = resourceItems.map((i) => i.resource_id);
      const shelterRefs = shelterItems.map((i) => i.shelter_id);

      const [resources, teams, shelters] = await Promise.all([
        resourceRefs.length
          ? prisma.resource.findMany({
              where: { publicId: { in: resourceRefs } },
              select: { id: true, publicId: true, quantity: true },
            })
          : Promise.resolve([]),
        teamItems.length
          ? prisma.fieldTeam.findMany({ where: { publicId: { in: teamItems.map((i) => i.team_id) } }, select: { id: true, publicId: true } })
          : Promise.resolve([]),
        shelterRefs.length
          ? prisma.shelter.findMany({ where: { publicId: { in: shelterRefs } }, select: { id: true, publicId: true } })
          : Promise.resolve([]),
      ]);

      const resourceMap = new Map(resources.map((r) => [r.publicId, r.id]));
      const teamMap = new Map(teams.map((t) => [t.publicId, t.id]));
      const shelterMap = new Map(shelters.map((s) => [s.publicId, s.id]));
      const resourceQuantity = new Map(resources.map((r) => [r.publicId, Number(r.quantity)]));

      for (const item of body.items) {
        if ('resource_id' in item) {
          if (!resourceMap.has(item.resource_id)) {
            throw new AppError(422, 'INVALID_REFERENCE', `Unknown resource ${item.resource_id}`);
          }
          // Allocated quantity may not exceed the resource's recorded stock.
          if (item.quantity > resourceQuantity.get(item.resource_id)!) {
            throw new AppError(422, 'INSUFFICIENT_QUANTITY', `Resource ${item.resource_id} does not have enough quantity`);
          }
        } else if ('team_id' in item) {
          if (!teamMap.has(item.team_id)) {
            throw new AppError(422, 'INVALID_REFERENCE', `Unknown field team ${item.team_id}`);
          }
        } else {
          if (!shelterMap.has(item.shelter_id)) {
            throw new AppError(422, 'INVALID_REFERENCE', `Unknown shelter ${item.shelter_id}`);
          }
        }
      }

      const fieldTeamId = teamItems.length ? teamMap.get(teamItems[0].team_id)! : null;

      const created = await prisma.$transaction(async (tx) => {
        // Atomic availability/capacity transitions. Conditional UPDATEs make the
        // check-and-set safe against concurrent assignments; a zero row count
        // means the precondition no longer holds and the whole transaction rolls
        // back.
        for (const item of body.items) {
          if ('resource_id' in item) {
            const affected = await tx.$executeRaw`
              UPDATE "Resource" SET "status" = 'ASSIGNED', "updatedAt" = NOW()
              WHERE "id" = ${resourceMap.get(item.resource_id)!} AND "status" = 'AVAILABLE' AND "quantity" >= ${item.quantity}
            `;
            if (affected === 0) {
              throw new AppError(422, 'RESOURCE_UNAVAILABLE', `Resource ${item.resource_id} is not available`);
            }
          } else if ('team_id' in item) {
            const affected = await tx.$executeRaw`
              UPDATE "FieldTeam" SET "status" = 'DEPLOYED', "updatedAt" = NOW()
              WHERE "id" = ${teamMap.get(item.team_id)!} AND "status" = 'ACTIVE'
            `;
            if (affected === 0) {
              throw new AppError(422, 'TEAM_UNAVAILABLE', `Field Team ${item.team_id} is not active`);
            }
          } else {
            const affected = await tx.$executeRaw`
              UPDATE "Shelter"
              SET "currentOccupancy" = "currentOccupancy" + ${item.quantity},
                  "status" = CASE
                    WHEN "currentOccupancy" + ${item.quantity} >= "totalCapacity" THEN 'FULL'::"ShelterStatus"
                    ELSE "status"
                  END,
                  "updatedAt" = NOW()
              WHERE "id" = ${shelterMap.get(item.shelter_id)!}
                AND "status" = 'AVAILABLE'
                AND "currentOccupancy" + ${item.quantity} <= "totalCapacity"
            `;
            if (affected === 0) {
              throw new AppError(422, 'SHELTER_CAPACITY_EXCEEDED', `Shelter ${item.shelter_id} does not have enough capacity`);
            }
          }
        }

        const assignment = await tx.assignment.create({
          data: {
            publicId: publicId('ASN'),
            incidentId: incident.id,
            recommendationId,
            assignedBy: req.userId!,
            status: 'ASSIGNED',
            assignedAt: new Date(),
            notes: body.notes ?? null,
            fieldTeamId,
          },
        });

        await tx.assignmentItem.createMany({
          data: body.items.map((item) => ({
            assignmentId: assignment.id,
            resourceType: 'resource_id' in item ? item.resource_type : null,
            resourceId: 'resource_id' in item ? resourceMap.get(item.resource_id)! : null,
            teamId: 'team_id' in item ? teamMap.get(item.team_id)! : null,
            shelterId: 'shelter_id' in item ? shelterMap.get(item.shelter_id)! : null,
            quantity: item.quantity,
          })),
        });

        // First assignment moves the incident into active response.
        const incidentUpdate = await tx.incident.updateMany({
          where: { id: incident.id, status: { in: ['REPORTED', 'TRIAGE_PENDING'] } },
          data: { status: 'IN_RESPONSE' },
        });
        const incidentStatus = incidentUpdate.count > 0 ? 'IN_RESPONSE' : incident.status;

        await tx.assignmentEvent.create({
          data: {
            assignmentId: assignment.id,
            eventType: 'CREATED',
            actorUserId: req.userId!,
            notes: body.notes ?? null,
          },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: req.userId,
            action: 'ASSIGNMENT_CREATE',
            entityType: 'ASSIGNMENT',
            entityId: assignment.id,
            afterState: {
              public_id: assignment.publicId,
              incident_public_id: incident.publicId,
              status: 'ASSIGNED',
              item_count: body.items.length,
            },
            metadata: { assignment_public_id: assignment.publicId, incident_public_id: incident.publicId },
          },
        });

        const full = await tx.assignment.findUniqueOrThrow({
          where: { id: assignment.id },
          include: assignmentInclude,
        });
        return { full, incidentStatus };
      });

      const ws = getWsService();
      ws.publishAssignmentCreated(created.full.publicId, incident.publicId);
      if (created.incidentStatus !== incident.status) {
        ws.publishIncidentUpdated(incident.id, incident.publicId, created.incidentStatus);
      }
      for (const item of body.items) {
        if ('resource_id' in item) {
          ws.publishResourceUpdated(resourceMap.get(item.resource_id)!, item.resource_id, 'ASSIGNED');
        } else if ('team_id' in item) {
          ws.publishTeamUpdated(teamMap.get(item.team_id)!, item.team_id, 'DEPLOYED');
        }
      }

      res.status(201).json({ success: true, data: serializeAssignment(created.full) });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/assignments — role-scoped list
assignmentsRouter.get('/', requireRole(...READ_ROLES), async (req: AppRequest, res, next) => {
  try {
    const query = assignmentQuerySchema.parse(req.query);
    const data = await queryAssignments({ userId: req.userId!, role: req.userRole!, query });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/assignments/:assignmentId — role-scoped detail
assignmentsRouter.get('/:assignmentId', requireRole(...READ_ROLES), async (req: AppRequest, res, next) => {
  try {
    const assignment = await prisma.assignment.findUnique({
      where: { publicId: req.params.assignmentId },
      include: assignmentInclude,
    });

    if (!assignment) throw notFound();
    // A Field Officer may only view assignments for the team they lead.
    if (req.userRole === 'FIELD_OFFICER' && assignment.FieldTeam?.leaderUserId !== req.userId) {
      throw notFound();
    }

    res.json({ success: true, data: serializeAssignment(assignment) });
  } catch (err) {
    next(err);
  }
});

// Atomically release resources/team/shelter state for a completed assignment.
// Used by both the Coordinator PATCH /status path and the Field Officer
// COMPLETED field update.
async function completeAssignment(tx: Prisma.TransactionClient, assignmentId: string) {
  const current = await tx.assignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: assignmentInclude,
  });
  for (const item of current.items) {
    if (item.resourceId) {
      await tx.$executeRaw`
        UPDATE "Resource" SET "status" = 'AVAILABLE', "updatedAt" = NOW()
        WHERE "id" = ${item.resourceId} AND "status" = 'ASSIGNED'
      `;
    }
    if (item.teamId) {
      await tx.$executeRaw`
        UPDATE "FieldTeam" SET "status" = 'ACTIVE', "updatedAt" = NOW()
        WHERE "id" = ${item.teamId} AND "status" = 'DEPLOYED'
      `;
    }
    if (item.shelterId) {
      await tx.$executeRaw`
        UPDATE "Shelter"
        SET "currentOccupancy" = GREATEST("currentOccupancy" - ${item.quantity}, 0),
            "status" = CASE
              WHEN "status" = 'FULL' AND "currentOccupancy" - ${item.quantity} < "totalCapacity"
                THEN 'AVAILABLE'::"ShelterStatus"
              ELSE "status"
            END,
            "updatedAt" = NOW()
        WHERE "id" = ${item.shelterId}
      `;
    }
  }
  return tx.assignment.update({
    where: { id: current.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
    include: assignmentInclude,
  });
}

// PATCH /api/v1/assignments/:assignmentId/status — Coordinator/Admin
assignmentsRouter.patch('/:assignmentId/status', requireRole(...WRITE_ROLES), async (req: AppRequest, res, next) => {
  try {
    const body = assignmentStatusUpdateSchema.parse(req.body);

    const existing = await prisma.assignment.findUnique({
      where: { publicId: req.params.assignmentId },
      include: assignmentInclude,
    });
    if (!existing) throw notFound();

    if (!['ASSIGNED', 'IN_PROGRESS'].includes(existing.status)) {
      throw new AppError(422, 'INVALID_TRANSITION', `Cannot change assignment from ${existing.status} to ${body.status}`);
    }
    // COMPLETED is allowed from IN_PROGRESS only in this phase.
    if (body.status === 'COMPLETED' && existing.status !== 'IN_PROGRESS') {
      throw new AppError(422, 'INVALID_TRANSITION', `Cannot complete assignment from ${existing.status}`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (body.status === 'COMPLETED') {
        return await completeAssignment(tx, existing.id);
      }
      if (body.status === 'CANCELLED') {
        // Atomically reverse operational state. Conditional updates avoid
        // clobbering state changed by another actor after assignment.
        for (const item of existing.items) {
          if (item.resourceId) {
            await tx.$executeRaw`
              UPDATE "Resource" SET "status" = 'AVAILABLE', "updatedAt" = NOW()
              WHERE "id" = ${item.resourceId} AND "status" = 'ASSIGNED'
            `;
          }
          if (item.teamId) {
            await tx.$executeRaw`
              UPDATE "FieldTeam" SET "status" = 'ACTIVE', "updatedAt" = NOW()
              WHERE "id" = ${item.teamId} AND "status" = 'DEPLOYED'
            `;
          }
          if (item.shelterId) {
            await tx.$executeRaw`
              UPDATE "Shelter"
              SET "currentOccupancy" = GREATEST("currentOccupancy" - ${item.quantity}, 0),
                  "status" = CASE
                    WHEN "status" = 'FULL' AND "currentOccupancy" - ${item.quantity} < "totalCapacity"
                      THEN 'AVAILABLE'::"ShelterStatus"
                    ELSE "status"
                  END,
                  "updatedAt" = NOW()
              WHERE "id" = ${item.shelterId}
            `;
          }
        }

        await tx.assignment.update({
          where: { id: existing.id },
          data: { status: 'CANCELLED' },
        });
      } else {
        await tx.assignment.update({
          where: { id: existing.id },
          data: { status: 'IN_PROGRESS', startedAt: new Date() },
        });
      }

      await tx.assignmentEvent.create({
        data: {
          assignmentId: existing.id,
          eventType: body.status,
          actorUserId: req.userId!,
          notes: body.notes ?? null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: req.userId,
          action: 'ASSIGNMENT_STATUS_UPDATE',
          entityType: 'ASSIGNMENT',
          entityId: existing.id,
          beforeState: { status: existing.status },
          afterState: { status: body.status },
          metadata: { assignment_public_id: existing.publicId, notes: body.notes },
        },
      });

      return tx.assignment.findUniqueOrThrow({ where: { id: existing.id }, include: assignmentInclude });
    });

    const ws = getWsService();
    ws.publishAssignmentUpdated(updated.publicId, updated.incident.publicId, updated.status);
    if (body.status === 'CANCELLED' || body.status === 'COMPLETED') {
      for (const item of updated.items) {
        if (item.resource?.publicId) ws.publishResourceUpdated(item.resourceId!, item.resource.publicId, 'AVAILABLE');
        if (item.teamId && updated.FieldTeam) ws.publishTeamUpdated(item.teamId, updated.FieldTeam.publicId, 'ACTIVE');
      }
    }

    res.json({ success: true, data: serializeAssignment(updated) });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/assignments/:assignmentId/field-updates — Field Officer, own team only
assignmentsRouter.post('/:assignmentId/field-updates', requireRole('FIELD_OFFICER'), async (req: AppRequest, res, next) => {
  try {
    const body = fieldUpdateSchema.parse(req.body);

    const existing = await prisma.assignment.findUnique({
      where: { publicId: req.params.assignmentId },
      include: assignmentInclude,
    });
    if (!existing) throw notFound();
    // A Field Officer may only update assignments for the team they lead.
    if (existing.FieldTeam?.leaderUserId !== req.userId) {
      throw notFound();
    }

    const eventType = body.event_type;
    if (!['ASSIGNED', 'IN_PROGRESS'].includes(existing.status)) {
      throw new AppError(422, 'INVALID_TRANSITION', `Cannot submit a field update for a ${existing.status} assignment`);
    }
    if (eventType === 'COMPLETED' && existing.status !== 'IN_PROGRESS') {
      throw new AppError(422, 'INVALID_TRANSITION', 'Cannot complete an assignment that is not IN_PROGRESS');
    }

    let updated: AssignmentWithRelations;
    if (eventType === 'COMPLETED') {
      updated = await prisma.$transaction(async (tx) => {
        await tx.assignmentEvent.create({
          data: {
            assignmentId: existing.id,
            eventType: 'COMPLETED',
            actorUserId: req.userId!,
            notes: body.notes ?? null,
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: req.userId,
            action: 'ASSIGNMENT_FIELD_COMPLETE',
            entityType: 'ASSIGNMENT',
            entityId: existing.id,
            beforeState: { status: existing.status },
            afterState: { status: 'COMPLETED' },
            metadata: { assignment_public_id: existing.publicId, notes: body.notes },
          },
        });
        return await completeAssignment(tx, existing.id);
      });
      const ws = getWsService();
      ws.publishAssignmentUpdated(updated.publicId, updated.incident.publicId, updated.status);
      for (const item of updated.items) {
        if (item.resource?.publicId) ws.publishResourceUpdated(item.resourceId!, item.resource.publicId, 'AVAILABLE');
        if (item.teamId && updated.FieldTeam) ws.publishTeamUpdated(item.teamId, updated.FieldTeam.publicId, 'ACTIVE');
      }
      return res.json({ success: true, data: serializeAssignment(updated) });
    }

    // Event-only field updates (EN_ROUTE / ARRIVED / IN_PROGRESS / BLOCKED).
    // The IN_PROGRESS event transitions ASSIGNED -> IN_PROGRESS.
    await prisma.$transaction(async (tx) => {
      if (eventType === 'IN_PROGRESS' && existing.status === 'ASSIGNED') {
        await tx.assignment.update({
          where: { id: existing.id },
          data: { status: 'IN_PROGRESS', startedAt: new Date() },
        });
      }
      await tx.assignmentEvent.create({
        data: {
          assignmentId: existing.id,
          eventType,
          actorUserId: req.userId!,
          notes: body.notes ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: req.userId,
          action: 'ASSIGNMENT_FIELD_UPDATE',
          entityType: 'ASSIGNMENT',
          entityId: existing.id,
          beforeState: { status: existing.status },
          afterState: {
            event_type: eventType,
            status: eventType === 'IN_PROGRESS' && existing.status === 'ASSIGNED' ? 'IN_PROGRESS' : existing.status,
          },
          metadata: { assignment_public_id: existing.publicId, notes: body.notes },
        },
      });
    });

    const after = await prisma.assignment.findUniqueOrThrow({
      where: { id: existing.id },
      include: assignmentInclude,
    });
    const ws = getWsService();
    if (after.status !== existing.status) {
      ws.publishAssignmentUpdated(after.publicId, after.incident.publicId, after.status);
    }

    res.status(201).json({
      success: true,
      data: {
        event_type: eventType,
        actor_user_id: after.assigner.publicId,
        notes: body.notes ?? null,
        occurred_at: new Date(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/assignments/:assignmentId/events — Coordinator/Admin operational event
assignmentsRouter.post('/:assignmentId/events', requireRole(...WRITE_ROLES), async (req: AppRequest, res, next) => {
  try {
    const body = assignmentEventSchema.parse(req.body);

    const existing = await prisma.assignment.findUnique({
      where: { publicId: req.params.assignmentId },
      select: { id: true, publicId: true },
    });
    if (!existing) throw notFound();

    const event = await prisma.$transaction(async (tx) => {
      const created = await tx.assignmentEvent.create({
        data: {
          assignmentId: existing.id,
          eventType: body.event_type,
          actorUserId: req.userId!,
          notes: body.notes ?? null,
        },
        include: { actor: { select: { publicId: true } } },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: req.userId,
          action: 'ASSIGNMENT_EVENT_RECORD',
          entityType: 'ASSIGNMENT',
          entityId: existing.id,
          afterState: { event_type: body.event_type },
          metadata: { assignment_public_id: existing.publicId, notes: body.notes },
        },
      });

      return created;
    });

    res.status(201).json({
      success: true,
      data: {
        event_type: event.eventType,
        actor_user_id: event.actor.publicId,
        notes: event.notes,
        occurred_at: event.occurredAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default assignmentsRouter;
