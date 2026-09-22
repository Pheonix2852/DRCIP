import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

router.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'healthy', database: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected', timestamp: new Date().toISOString() });
  }
});

router.get('/version', (req, res) => {
  res.json({ service: 'drcip-backend', version: '1.0.0' });
});

export { router as healthRouter };