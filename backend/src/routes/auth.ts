import { Router } from 'express';
import { randomBytes, createHash } from 'crypto';
import { AppRequest } from '../middleware/index';
import prisma from '../lib/prisma';
import { signToken, hashPassword, verifyPassword, isPasswordValid } from '../lib/auth';
import { publicId } from '../lib/publicId';
import { getEmailProvider } from '../services/EmailProvider';

const router = Router();

const RESET_TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

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
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        request_id: req.requestId,
      });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        request_id: req.requestId,
      });
    }

    // Create a session
    const sessionRef = publicId('SES');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    const session = await prisma.session.create({
      data: {
        publicId: sessionRef,
        userId: user.id,
        expiresAt,
      },
    });

    const token = await signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.fullName,
      jti: session.publicId,
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
router.post('/logout', async (req: AppRequest, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const { verifyToken } = await import('../lib/auth');
      const payload = await verifyToken(authHeader.slice(7));
      if (payload?.jti) {
        await prisma.session.updateMany({
          where: { publicId: payload.jti, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    }
    res.json({ success: true, data: { message: 'Logged out' } });
  } catch {
    // Logout must never fail
    res.json({ success: true, data: { message: 'Logged out' } });
  }
});

// POST /api/v1/auth/password-reset/request
router.post('/password-reset/request', async (req: AppRequest, res) => {
  try {
    const { email } = req.body ?? {};
    // Always return the same response to prevent email enumeration
    const generic = { success: true, data: { message: 'If the email exists, a reset link will be sent' } };

    if (!email || typeof email !== 'string') {
      return res.json(generic);
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      return res.json(generic);
    }

    // Generate a cryptographically random token
    const rawToken = randomBytes(32).toString('hex');
    const tokenHashed = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: tokenHashed,
        expiresAt,
      },
    });

    // Send reset email (mock provider in dev/test)
    const provider = getEmailProvider();
    const resetUrlBase = process.env.RESET_URL_BASE || 'http://localhost:5173';
    await provider.send({
      recipientEmail: user.email,
      recipientUserId: user.id,
      subject: 'DRCIP Password Reset',
      body: `Reset your DRCIP password using this link:\n\n${resetUrlBase}/#/reset-password?token=${rawToken}\n\nThis link expires in 15 minutes and can only be used once. If you did not request a password reset, you can ignore this email.`,
    }).catch(() => {
      // Email failure must not reveal whether the email exists
    });

    return res.json(generic);
  } catch {
    return res.json({ success: true, data: { message: 'If the email exists, a reset link will be sent' } });
  }
});

// POST /api/v1/auth/password-reset/confirm
router.post('/password-reset/confirm', async (req: AppRequest, res, next) => {
  try {
    const { token, password } = req.body ?? {};

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Token and new password are required' },
        request_id: req.requestId,
      });
    }

    const passwordCheck = isPasswordValid(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: passwordCheck.reason },
        request_id: req.requestId,
      });
    }

    const tokenHashed = hashToken(token);
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: tokenHashed },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Reset token is invalid, expired, or already used' },
        request_id: req.requestId,
      });
    }

    const newHash = await hashPassword(password);

    await prisma.$transaction(async (tx) => {
      // Update password
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash: newHash },
      });

      // Mark token as used
      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      });

      // Invalidate all sessions for this user
      await tx.session.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    res.json({ success: true, data: { message: 'Password has been reset' } });
  } catch (err) {
    next(err);
  }
});

export default router;
