import { Response, NextFunction } from 'express';
import { verifyToken } from '../lib/auth';
import prisma from '../lib/prisma';
import { AppRequest } from './index';

export async function verifyAuth(req: AppRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      request_id: req.requestId,
    });
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token);
  if (!payload) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired token' },
      request_id: req.requestId,
    });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Account not found or inactive' },
      request_id: req.requestId,
    });
  }

  req.userId = user.id;
  req.userRole = user.role;
  req.userName = user.fullName;

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  }).catch(() => {});

  next();
}

export function requireRole(...allowedRoles: string[]) {
  return (req: AppRequest, res: Response, next: NextFunction) => {
    if (!req.userRole || !allowedRoles.includes(req.userRole)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied for this role' },
        request_id: req.requestId,
      });
    }
    next();
  };
}