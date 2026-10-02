import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestIdMiddleware } from './middleware/index';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import incidentsRouter from './routes/incidents';
import resourcesRouter from './routes/resources';
import teamsRouter from './routes/teams';
import sheltersRouter from './routes/shelters';
import assignmentsRouter, { incidentAssignmentsRouter } from './routes/assignments';
import notificationsRouter from './routes/notifications';
import meRouter from './routes/me';
import { verifyAuth } from './middleware/auth';
import mediaRouter from './routes/media';
import capacityRouter from './routes/capacity';
import auditRouter from './routes/audit';
import responseZonesRouter from './routes/responseZones';
import reportsRouter from './routes/reports';
import { healthRouter } from './routes/health';
import weatherRouter from './routes/weather';
import adminRouter from './routes/admin';

export function createApp() {
  const app = express();

  // CORS production fail-safe: the configured origin(s) are required in
  // production. Missing/empty CORS_ORIGIN refuses to boot rather than
  // silently allowing '*'. Non-production keeps the historical '*' default
  // so local development and the existing test suite are unaffected.
  const isProduction = process.env.NODE_ENV === 'production';
  const corsOriginRaw = (process.env.CORS_ORIGIN ?? '').trim();
  let corsOrigin: string | string[];
  if (isProduction) {
    const origins = corsOriginRaw
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
    if (origins.length === 0) {
      throw new Error(
        'FATAL: CORS_ORIGIN must be set in production. ' +
          'Configure the allowed frontend origin(s), e.g. ' +
          'CORS_ORIGIN=https://app.example.com (comma-separated for multiple). ' +
          'Refusing to fall back to "*".'
      );
    }
    // Array form enforces strict membership: an unlisted Origin gets no
    // Access-Control-Allow-Origin header. A bare string is reflected on
    // every response regardless of the requesting origin.
    corsOrigin = origins;
  } else {
    corsOrigin = corsOriginRaw !== '' ? corsOriginRaw : '*';
  }

  // Middleware
  app.use(requestIdMiddleware);
  app.use(cors({
    origin: corsOrigin,
    credentials: true,
  }));
  app.use(helmet());
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));

  // Health / Version (unauthenticated)
  app.use('/health', healthRouter);

  // Routes
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/users', verifyAuth, usersRouter);
  app.use('/api/v1/incidents', verifyAuth, incidentsRouter);
  app.use('/api/v1/incidents', verifyAuth, mediaRouter);
  app.use('/api/v1/incidents', verifyAuth, incidentAssignmentsRouter);
  app.use('/api/v1/resources', verifyAuth, resourcesRouter);
  app.use('/api/v1/teams', verifyAuth, teamsRouter);
  app.use('/api/v1/shelters', verifyAuth, sheltersRouter);
  app.use('/api/v1/capacity', verifyAuth, capacityRouter);
  app.use('/api/v1/response-zones', verifyAuth, responseZonesRouter);
  app.use('/api/v1/reports', verifyAuth, reportsRouter);

  app.use('/api/v1/assignments', verifyAuth, assignmentsRouter);
  app.use('/api/v1/notifications', verifyAuth, notificationsRouter);
  app.use('/api/v1/me', verifyAuth, meRouter);
  app.use('/api/v1/audit-logs', verifyAuth, auditRouter);
  app.use('/api/v1/weather', verifyAuth, weatherRouter);
  app.use('/api/v1/admin', verifyAuth, adminRouter);

  // 404 handler
  app.use(notFoundHandler);

  // Error handler
  app.use(errorHandler);

  return app;
}
