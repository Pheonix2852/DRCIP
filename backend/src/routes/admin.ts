import { Router } from 'express';
import { requireRole } from '../middleware/auth';
import { AppRequest } from '../middleware/index';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/v1/admin/overview — Administrator-only dashboard data
router.get('/overview', requireRole('ADMINISTRATOR'), async (req: AppRequest, res, next) => {
  try {
    const [
      totalUsers,
      activeUsers,
      roleCounts,
      recentAudit,
      totalIncidents,
      totalResources,
      totalTeams,
      activeTeams,
      totalShelters,
      knowledgeDocCount,
      pendingDocCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.groupBy({ by: ['role'], _count: true, where: { isActive: true } }),
      prisma.auditLog.findMany({
        orderBy: { occurredAt: 'desc' },
        take: 10,
        include: { actor: { select: { fullName: true } } },
      }),
      prisma.incident.count(),
      prisma.resource.count(),
      prisma.fieldTeam.count(),
      prisma.fieldTeam.count({ where: { status: 'ACTIVE' } }),
      prisma.shelter.count(),
      prisma.knowledgeBaseDocument.count(),
      prisma.knowledgeBaseDocument.count({ where: { approvedForRag: false } }),
    ]);

    const roles: Record<string, number> = {};
    for (const r of roleCounts) {
      roles[r.role] = r._count;
    }

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          active: activeUsers,
          by_role: roles,
        },
        incidents: { total: totalIncidents },
        resources: { total: totalResources },
        teams: { total: totalTeams, active: activeTeams },
        shelters: { total: totalShelters },
        health: {
          status: 'ok',
          timestamp: new Date().toISOString(),
        },
        rag: {
          status: 'deferred',
          documents_total: knowledgeDocCount,
          documents_pending_approval: pendingDocCount,
          message: 'RAG implementation is deferred.',
        },
        configuration: {
          status: 'ok',
          message: 'Core services operational.',
        },
        recent_audit: recentAudit.map((a) => ({
          id: a.id,
          actor_name: a.actor?.fullName ?? 'System',
          action: a.action,
          entity_type: a.entityType,
          occurred_at: a.occurredAt,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/leader-candidates — eligible Field Officers for team leadership
router.get('/leader-candidates', requireRole('DISASTER_COORDINATOR', 'ADMINISTRATOR'), async (req: AppRequest, res, next) => {
  try {
    const excludeTeamId = req.query.exclude_team_id as string | undefined;

    // Get IDs of officers who already lead a team
    const teamLeaders = await prisma.fieldTeam.findMany({
      select: { leaderUserId: true, id: true },
    });

    const leadingUserIds = new Set(
      teamLeaders
        .filter((t) => !excludeTeamId || t.id !== excludeTeamId)
        .map((t) => t.leaderUserId),
    );

    const officers = await prisma.user.findMany({
      where: {
        role: 'FIELD_OFFICER',
        isActive: true,
        id: { notIn: [...leadingUserIds] },
      },
      select: {
        publicId: true,
        fullName: true,
        email: true,
      },
      orderBy: { fullName: 'asc' },
    });

    res.json({
      success: true,
      data: officers.map((o) => ({
        id: o.publicId,
        name: o.fullName,
        email: o.email,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
