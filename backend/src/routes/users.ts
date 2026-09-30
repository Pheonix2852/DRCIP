import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { requireRole } from '../middleware/auth';
import { AppRequest } from '../middleware/index';
import prisma from '../lib/prisma';
import { hashPassword } from '../lib/auth';
import { userQuerySchema, createUserSchema, updateUserSchema } from '@drcip/contracts';

const router = Router();

function serializeUser(u: {
  publicId: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: u.publicId,
    name: u.fullName,
    email: u.email,
    role: u.role,
    is_active: u.isActive,
    created_at: u.createdAt,
  };
}

function serializeUserDetail(u: {
  publicId: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  createdBy: string | null;
}) {
  return {
    ...serializeUser(u),
    updated_at: u.updatedAt,
    last_login_at: u.lastLoginAt,
    created_by: u.createdBy,
  };
}

// GET /api/v1/users
router.get('/', requireRole('ADMINISTRATOR'), async (req: AppRequest, res, next) => {
  try {
    const query = userQuerySchema.parse(req.query);
    const offset = (query.page - 1) * query.limit;

    const where: Prisma.UserWhereInput = {};
    if (query.role) where.role = query.role;
    if (query.active !== undefined) where.isActive = query.active === 'true';
    if (query.search) {
      const s = query.search;
      where.OR = [
        { fullName: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: offset,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          publicId: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        items: users.map(serializeUser),
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

// GET /api/v1/users/:userId
router.get('/:userId', requireRole('ADMINISTRATOR'), async (req: AppRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { publicId: req.params.userId },
      select: {
        publicId: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
        createdBy: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
        request_id: req.requestId,
      });
    }

    res.json({ success: true, data: serializeUserDetail(user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/users
router.post('/', requireRole('ADMINISTRATOR'), async (req: AppRequest, res, next) => {
  try {
    const input = createUserSchema.parse(req.body);

    const exists = await prisma.user.findUnique({ where: { email: input.email } });
    if (exists) {
      return res.status(409).json({
        success: false,
        error: { code: 'ALREADY_EXISTS', message: 'Email already registered' },
        request_id: req.requestId,
      });
    }

    const defaultPassword = 'TempPassword123!';
    const hashedPassword = await hashPassword(defaultPassword);
    const ref = `USR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          publicId: ref,
          fullName: input.name,
          email: input.email,
          passwordHash: hashedPassword,
          role: input.role,
          createdBy: req.userId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: req.userId,
          action: 'USER_CREATE',
          entityType: 'USER',
          entityId: user.id,
          afterState: {
            public_id: user.publicId,
            name: user.fullName,
            email: user.email,
            role: user.role,
          },
        },
      });

      return user;
    });

    res.status(201).json({ success: true, data: serializeUser(result) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/users/:userId
router.patch('/:userId', requireRole('ADMINISTRATOR'), async (req: AppRequest, res, next) => {
  try {
    const input = updateUserSchema.parse(req.body);
    const target = await prisma.user.findUnique({ where: { publicId: req.params.userId } });

    if (!target) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
        request_id: req.requestId,
      });
    }

    // Self role change guard
    if (input.role && target.id === req.userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'SELF_ROLE_CHANGE', message: 'Cannot change your own role' },
        request_id: req.requestId,
      });
    }

    // Last admin demotion guard
    if (input.role && target.role === 'ADMINISTRATOR' && input.role !== 'ADMINISTRATOR') {
      const activeAdminCount = await prisma.user.count({
        where: { role: 'ADMINISTRATOR', isActive: true },
      });
      if (activeAdminCount <= 1) {
        return res.status(409).json({
          success: false,
          error: { code: 'LAST_ADMINISTRATOR', message: 'Cannot demote the last active Administrator' },
          request_id: req.requestId,
        });
      }
    }

    // Team-leader role conflict guard
    if (input.role && input.role !== 'FIELD_OFFICER' && target.role === 'FIELD_OFFICER') {
      const leadsTeam = await prisma.fieldTeam.findUnique({ where: { leaderUserId: target.id } });
      if (leadsTeam) {
        return res.status(409).json({
          success: false,
          error: { code: 'TEAM_LEADER_ROLE_CONFLICT', message: 'User leads a Field Team and cannot be moved away from FIELD_OFFICER' },
          request_id: req.requestId,
        });
      }
    }

    const beforeState = {
      name: target.fullName,
      email: target.email,
      role: target.role,
    };

    const updateData: Prisma.UserUpdateInput = {};
    if (input.name) updateData.fullName = input.name;
    if (input.role) updateData.role = input.role;

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: target.id },
        data: updateData,
      });

      await tx.auditLog.create({
        data: {
          actorUserId: req.userId,
          action: 'USER_UPDATE',
          entityType: 'USER',
          entityId: target.id,
          beforeState,
          afterState: {
            name: updated.fullName,
            email: updated.email,
            role: updated.role,
          },
        },
      });

      return updated;
    });

    res.json({ success: true, data: serializeUser(result) });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/users/:userId/deactivate
router.post('/:userId/deactivate', requireRole('ADMINISTRATOR'), async (req: AppRequest, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { publicId: req.params.userId } });

    if (!target) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
        request_id: req.requestId,
      });
    }

    // Already inactive → idempotent
    if (!target.isActive) {
      return res.json({ success: true, data: serializeUser(target) });
    }

    // Self deactivation guard
    if (target.id === req.userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'SELF_DEACTIVATION', message: 'Cannot deactivate your own account' },
        request_id: req.requestId,
      });
    }

    // Last active admin guard
    if (target.role === 'ADMINISTRATOR') {
      const activeAdminCount = await prisma.user.count({
        where: { role: 'ADMINISTRATOR', isActive: true },
      });
      if (activeAdminCount <= 1) {
        return res.status(409).json({
          success: false,
          error: { code: 'LAST_ADMINISTRATOR', message: 'Cannot deactivate the last active Administrator' },
          request_id: req.requestId,
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: target.id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: req.userId,
          action: 'USER_DEACTIVATE',
          entityType: 'USER',
          entityId: target.id,
          beforeState: { is_active: true },
          afterState: { is_active: false },
        },
      });

      return updated;
    });

    res.json({ success: true, data: serializeUser(result) });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/users/:userId/activate
router.post('/:userId/activate', requireRole('ADMINISTRATOR'), async (req: AppRequest, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { publicId: req.params.userId } });

    if (!target) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
        request_id: req.requestId,
      });
    }

    // Already active → idempotent
    if (target.isActive) {
      return res.json({ success: true, data: serializeUser(target) });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: target.id },
        data: { isActive: true },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: req.userId,
          action: 'USER_ACTIVATE',
          entityType: 'USER',
          entityId: target.id,
          beforeState: { is_active: false },
          afterState: { is_active: true },
        },
      });

      return updated;
    });

    res.json({ success: true, data: serializeUser(result) });
  } catch (err) {
    next(err);
  }
});

export default router;
