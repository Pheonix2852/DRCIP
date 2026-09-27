import { Router } from 'express';
import { AppRequest } from '../middleware/index';
import { requireRole } from '../middleware/auth';
import prisma from '../lib/prisma';
import { hashPassword, verifyPassword, isPasswordValid } from '../lib/auth';
import { teamInclude, serializeTeam } from '../lib/teamSerializer';
import { queryAssignments } from '../lib/assignmentSerializer';
import { assignmentQuerySchema } from '@drcip/contracts';

const router = Router();

// GET /api/v1/me — own profile
router.get('/', async (req: AppRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        publicId: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
        request_id: req.requestId,
      });
    }

    res.json({
      success: true,
      data: {
        id: user.publicId,
        name: user.fullName,
        email: user.email,
        role: user.role,
        is_active: user.isActive,
        created_at: user.createdAt,
        last_login_at: user.lastLoginAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/me/password — change own password
router.post('/password', async (req: AppRequest, res, next) => {
  try {
    const { current_password, new_password } = req.body ?? {};

    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'current_password and new_password are required' },
        request_id: req.requestId,
      });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
        request_id: req.requestId,
      });
    }

    const valid = await verifyPassword(current_password, user.passwordHash);
    if (!valid) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' },
        request_id: req.requestId,
      });
    }

    const passwordCheck = isPasswordValid(new_password);
    if (!passwordCheck.valid) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: passwordCheck.reason },
        request_id: req.requestId,
      });
    }

    const newHash = await hashPassword(new_password);

    // Update password and invalidate other sessions (keep current session alive)
    const authHeader = req.headers.authorization;
    let currentSessionId: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const { verifyToken } = await import('../lib/auth');
      const payload = await verifyToken(authHeader.slice(7));
      currentSessionId = payload?.jti ?? null;
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: req.userId },
        data: { passwordHash: newHash },
      });

      // Revoke all other sessions
      await tx.session.updateMany({
        where: {
          userId: req.userId,
          revokedAt: null,
          ...(currentSessionId ? { publicId: { not: currentSessionId } } : {}),
        },
        data: { revokedAt: new Date() },
      });
    });

    res.json({ success: true, data: { message: 'Password changed successfully' } });
  } catch (err) {
    next(err);
  }
});

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

// GET /api/v1/me/assignments — assignments visible to the Field Officer's team.
router.get('/assignments', requireRole('FIELD_OFFICER'), async (req: AppRequest, res, next) => {
  try {
    const query = assignmentQuerySchema.parse(req.query);
    const data = await queryAssignments({ userId: req.userId!, role: req.userRole!, query });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
