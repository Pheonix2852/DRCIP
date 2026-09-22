import { Router } from 'express';
import { requireRole } from '../middleware/auth';
import { AppRequest } from '../middleware/index';
import prisma from '../lib/prisma';
import { hashPassword } from '../lib/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// GET /api/v1/users
router.get('/', requireRole('ADMINISTRATOR'), async (req: AppRequest, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip: offset,
        take: limit,
        select: {
          id: true,
          publicId: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      }),
      prisma.user.count(),
    ]);

    res.json({
      success: true,
      data: {
        items: users.map((u: typeof users[0]) => ({
          id: u.publicId,
          name: u.fullName,
          email: u.email,
          role: u.role,
          is_active: u.isActive,
          created_at: u.createdAt,
        })),
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/users
router.post('/', requireRole('ADMINISTRATOR'), async (req: AppRequest, res, next) => {
  try {
    const { name, email, role } = req.body;
    if (!name || !email || !role) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name, email, and role are required' },
        request_id: req.requestId,
      });
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return res.status(409).json({
        success: false,
        error: { code: 'ALREADY_EXISTS', message: 'Email already registered' },
        request_id: req.requestId,
      });
    }

    // Default password for provisioned accounts
    const defaultPassword = 'TempPassword123!';
    const hashedPassword = await hashPassword(defaultPassword);
    const publicId = `USR-${uuidv4().slice(0, 8).toUpperCase()}`;

    const user = await prisma.user.create({
      data: {
        publicId,
        fullName: name,
        email,
        passwordHash: hashedPassword,
        role,
        createdBy: req.userId,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: user.publicId,
        name: user.fullName,
        email: user.email,
        role: user.role,
        is_active: user.isActive,
        created_at: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;