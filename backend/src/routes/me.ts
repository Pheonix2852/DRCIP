import { Router } from 'express';
import { AppRequest } from '../middleware/index';
import { requireRole } from '../middleware/auth';
import prisma from '../lib/prisma';
import { teamInclude, serializeTeam } from '../lib/teamSerializer';

const router = Router();

// GET /api/v1/me/team — the Field Team represented by the authenticated Field Officer.
router.get('/team', requireRole('FIELD_OFFICER'), async (req: AppRequest, res, next) => {
  try {
    const team = await prisma.fieldTeam.findUnique({
      where: { leaderUserId: req.userId },
      include: teamInclude,
    });

    if (!team) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No team is assigned to this Field Officer' },
        request_id: req.requestId,
      });
    }

    res.json({ success: true, data: serializeTeam(team) });
  } catch (err) {
    next(err);
  }
});

export default router;
