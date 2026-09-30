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