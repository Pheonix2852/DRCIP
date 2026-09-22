import { Response, NextFunction } from 'express';
import { AppRequest } from './index';

// Structural check: zod can load as more than one runtime instance (CJS/ESM),
// so `instanceof ZodError` is unreliable across module boundaries.
export function isZodError(err: unknown): err is {
  issues: { message: string; path: (string | number)[] }[];
} {
  return (
    typeof err === 'object' &&
    err !== null &&
    Array.isArray((err as { issues?: unknown }).issues)
  );
}

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: Error | AppError,
  req: AppRequest,
  res: Response,
  _next: NextFunction
) {
  console.error('Error:', err);

  if (isZodError(err)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: err.issues[0]?.message ?? 'Validation failed',
        details: { issues: err.issues },
      },
      request_id: req.requestId,
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
      request_id: req.requestId,
    });
  }

  // Default to 500
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    },
    request_id: req.requestId,
  });
}

export function notFoundHandler(req: AppRequest, res: Response) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
    request_id: req.requestId,
  });
}