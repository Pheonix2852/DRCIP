// Intelligence service contract types
// Re-exports intelligence contracts from api.ts for Node/Frontend consumption
// Also defines health/version types specific to intelligence service

import {
  PredictionStatus,
  SeverityPredictionRequest,
  SeverityPredictionResponse,
  DemandForecastRequest,
  DemandForecastResponse,
  OptimizationRequest,
  OptimizationResponse,
  RagQueryRequest,
  RagQueryResponse,
} from './api';

// Re-export intelligence contracts from api.ts (single source of truth)
export {
  PredictionStatus,
  SeverityPredictionRequest,
  SeverityPredictionResponse,
  DemandForecastRequest,
  DemandForecastResponse,
  OptimizationRequest,
  OptimizationResponse,
  RagQueryRequest,
  RagQueryResponse,
};

// Health / Version - specific to intelligence service
export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  checks?: Record<string, string>;
}

export interface VersionResponse {
  service: string;
  version: string;
  modules: Record<string, string>;
  models: Record<string, string>;
  rag_config_version?: string;
}