import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppRequest } from '../middleware/index';
import { requireRole } from '../middleware/auth';
import prisma from '../lib/prisma';
import { publicId } from '../lib/publicId';
import { teamInclude, serializeTeam, serializeMember } from '../lib/teamSerializer';
import {
  createTeamSchema,
  updateTeamSchema,
  teamQuerySchema,
  teamMemberAddSchema,
  teamStatusUpdateSchema,
} from '@drcip/contracts';
import { WebSocketService } from '../services/WebSocketService';

const router = Router();

// Read roles: Field Officer (own team only), Coordinator, Admin.
const READ_ROLES = ['FIELD_OFFICER', 'DISASTER_COORDINATOR', 'ADMINISTRATOR'];
// Team management: Coordinator and Admin only.
const WRITE_ROLES = ['DISASTER_COORDINATOR', 'ADMINISTRATOR'];

// WebSocket is optional at runtime (e.g. during tests). Publishing must never
// block a successful persistence.
function getWsService() {
  try {
    return WebSocketService.getInstance();
  } catch {
    return { publishTeamUpdated: () => {} };
  }
}

function notFound(res: Response, req: AppRequest) {
  return res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Team not found' },
    request_id: req.requestId,
  });
}

// GET /api/v1/teams — role-scoped list
router.get('/', requireRole(...READ_ROLES), async (req: AppRequest, res, next) => {
  try {
    const query = teamQuerySchema.parse(req.query);
    const offset = (query.page - 1) * query.limit;

    const where: Prisma.FieldTeamWhereInput = {};
    if (query.status) where.status = query.status;
    // A Field Officer only sees the team they lead.
    if (req.userRole === 'FIELD_OFFICER') {
      where.leaderUserId = req.userId;
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { leader: { fullName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [teams, total] = await Promise.all([
      prisma.fieldTeam.findMany({
        where,
        include: teamInclude,
        orderBy: { createdAt: query.sort === 'oldest' ? 'asc' : 'desc' },
        skip: offset,
        take: query.limit,
      }),
      prisma.fieldTeam.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        items: teams.map(serializeTeam),
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

// GET /api/v1/teams/:teamId
router.get('/:teamId', requireRole(...READ_ROLES), async (req: AppRequest, res, next) => {
  try {
    const team = await prisma.fieldTeam.findUnique({
      where: { publicId: req.params.teamId },
      include: teamInclude,
    });

    if (!team) return notFound(res, req);
    // Field Officers may only view their own team.
    if (req.userRole === 'FIELD_OFFICER' && team.leaderUserId !== req.userId) {
      return notFound(res, req);
    }

    res.json({ success: true, data: serializeTeam(team) });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/teams — Coordinator/Admin
router.post('/', requireRole(...WRITE_ROLES), async (req: AppRequest, res, next) => {
  try {
    const body = createTeamSchema.parse(req.body);

    const leader = await prisma.user.findUnique({ where: { publicId: body.leader_user_id } });
    if (!leader || !leader.isActive || leader.role !== 'FIELD_OFFICER') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_LEADER', message: 'Leader must be an active Field Officer' },
        request_id: req.requestId,
      });
    }

    const existing = await prisma.fieldTeam.findUnique({ where: { leaderUserId: leader.id } });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: { code: 'LEADER_CONFLICT', message: 'Field Officer already leads a team' },
        request_id: req.requestId,
      });
    }

    const ref = publicId('TEAM');

    const created = await prisma.$transaction(async (tx) => {
      const team = await tx.fieldTeam.create({
        data: {
          publicId: ref,
          name: body.name,
          leaderUserId: leader.id,
          status: 'ACTIVE',
          capabilityProfile: (body.capability_profile ?? {}) as Prisma.InputJsonValue,
        },
        include: teamInclude,
      });

      await tx.auditLog.create({
        data: {
          actorUserId: req.userId,
          action: 'TEAM_CREATE',
          entityType: 'TEAM',
          entityId: team.id,
          afterState: { public_id: ref, name: team.name, status: team.status, leader_user_id: leader.publicId },
          metadata: { team_public_id: ref },
        },
      });

      return team;
    });

    getWsService().publishTeamUpdated(created.id, created.publicId, created.status);

    res.status(201).json({ success: true, data: serializeTeam(created) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/teams/:teamId — Coordinator/Admin
router.patch('/:teamId', requireRole(...WRITE_ROLES), async (req: AppRequest, res, next) => {
  try {
    const body = updateTeamSchema.parse(req.body);

    const data: Prisma.FieldTeamUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.capability_profile !== undefined) {
      data.capabilityProfile = body.capability_profile as Prisma.InputJsonValue;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'No updatable fields provided' },
        request_id: req.requestId,
      });
    }

    const existing = await prisma.fieldTeam.findUnique({ where: { publicId: req.params.teamId } });
    if (!existing) return notFound(res, req);

    const updated = await prisma.$transaction(async (tx) => {
      const team = await tx.fieldTeam.update({
        where: { id: existing.id },
        data,
        include: teamInclude,
      });

      await tx.auditLog.create({
        data: {
          actorUserId: req.userId,
          action: 'TEAM_UPDATE',
          entityType: 'TEAM',
          entityId: existing.id,
          beforeState: { name: existing.name, status: existing.status },
          afterState: { name: team.name, status: team.status },
          metadata: { team_public_id: existing.publicId },
        },
      });

      return team;
    });

    getWsService().publishTeamUpdated(updated.id, updated.publicId, updated.status);

    res.json({ success: true, data: serializeTeam(updated) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/teams/:teamId/status — Coordinator/Admin, or the leading Field Officer
router.patch('/:teamId/status', requireRole(...READ_ROLES), async (req: AppRequest, res, next) => {
  try {
    const body = teamStatusUpdateSchema.parse(req.body);

    const team = await prisma.fieldTeam.findUnique({ where: { publicId: req.params.teamId } });
    if (!team) return notFound(res, req);

    if (req.userRole === 'FIELD_OFFICER' && team.leaderUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You may only update your own team status' },
        request_id: req.requestId,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.fieldTeam.update({
        where: { id: team.id },
        data: { status: body.status },
        include: teamInclude,
      });

      await tx.auditLog.create({
        data: {
          actorUserId: req.userId,
          action: 'TEAM_STATUS_UPDATE',
          entityType: 'TEAM',
          entityId: team.id,
          beforeState: { status: team.status },
          afterState: { status: next.status },
          metadata: { team_public_id: team.publicId, notes: body.notes },
        },
      });

      return next;
    });

    getWsService().publishTeamUpdated(updated.id, updated.publicId, updated.status);

    res.json({ success: true, data: serializeTeam(updated) });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/teams/:teamId/members — Coordinator/Admin
router.post('/:teamId/members', requireRole(...WRITE_ROLES), async (req: AppRequest, res, next) => {
  try {
    const body = teamMemberAddSchema.parse(req.body);

    const team = await prisma.fieldTeam.findUnique({ where: { publicId: req.params.teamId } });
    if (!team) return notFound(res, req);

    const member = await prisma.$transaction(async (tx) => {
      const created = await tx.fieldTeamMember.create({
        data: {
          teamId: team.id,
          memberName: body.member_name,
          memberRole: body.member_role,
          contactReference: body.contact_reference ?? null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: req.userId,
          action: 'TEAM_MEMBER_ADD',
          entityType: 'TEAM',
          entityId: team.id,
          afterState: { member_name: created.memberName, member_role: created.memberRole },
          metadata: { team_public_id: team.publicId },
        },
      });

      return created;
    });

    res.status(201).json({ success: true, data: serializeMember(member) });
  } catch (err) {
    next(err);
  }
});

export default router;
