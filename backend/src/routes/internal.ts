import { Router } from 'express';
import { AppRequest } from '../middleware/index';
import { IntelligenceClient } from '../services/IntelligenceClient';

const router = Router();
const intelligence = new IntelligenceClient();

// POST /internal/v1/predict/severity
router.post('/predict/severity', async (req: AppRequest, res, next) => {
  try {
    const result = await intelligence.predictSeverity(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /internal/v1/forecast/demand
router.post('/forecast/demand', async (req: AppRequest, res, next) => {
  try {
    const result = await intelligence.forecastDemand(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /internal/v1/optimize/allocation
router.post('/optimize/allocation', async (req: AppRequest, res, next) => {
  try {
    const result = await intelligence.optimizeAllocation(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /internal/v1/rag/query
router.post('/rag/query', async (req: AppRequest, res, next) => {
  try {
    const result = await intelligence.queryRag(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export function initializeInternalRoutes() {
  return router;
}