import { Router } from 'express';
import { AppRequest } from '../middleware/index';
import prisma from '../lib/prisma';

const router = Router();

// POST /api/v1/auth/login
router.post('/login', async (req: AppRequest, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' },
        request_id: req.requestId,
      });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        request_id: req.requestId,
      });
    }

    const { verifyPassword, signToken } = await import('../lib/auth');
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        request_id: req.requestId,
      });
    }

    const token = await signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.fullName,
    });

    res.json({
      success: true,
      data: {
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        user: {
          id: user.publicId,
          name: user.fullName,
          role: user.role,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/logout
router.post('/logout', (req, res) => {
  res.json({ success: true, data: { message: 'Logged out' } });
});

// POST /api/v1/auth/password-reset/request
router.post('/password-reset/request', async (req: AppRequest, res, next) => {
  try {
    req.body; // consume body
    res.json({
      success: true,
      data: { message: 'If the email exists, a reset link will be sent' },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/password-reset/confirm
router.post('/password-reset/confirm', async (req: AppRequest, res, next) => {
  try {
    res.json({ success: true, data: { message: 'Password reset confirmed' } });
  } catch (err) {
    next(err);
  }
});

export default router;