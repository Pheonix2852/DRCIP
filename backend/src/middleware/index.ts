import { Request, Response, NextFunction } from 'express';
import { RequestIdService } from '../lib/RequestIdService';

export interface AppRequest extends Request {
  requestId?: string;
  userId?: string;
  userRole?: string;
  userName?: string;
}

export function requestIdMiddleware(req: AppRequest, res: Response, next: NextFunction) {
  req.requestId = RequestIdService.generate();
  res.set('X-Request-Id', req.requestId);
  next();
}

export function authMiddleware(req: AppRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      request_id: req.requestId,
    });
  }
  // Token verification handled in verifyAuth middleware
  next();
}

export function corsMiddleware(req: AppRequest, res: Response, next: NextFunction) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
}