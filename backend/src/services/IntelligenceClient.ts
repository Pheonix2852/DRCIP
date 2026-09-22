import axios from 'axios';
import { SeverityPredictionRequest, SeverityPredictionResponse } from '@drcip/contracts';
import { DemandForecastRequest, DemandForecastResponse } from '@drcip/contracts';
import { OptimizationRequest, OptimizationResponse } from '@drcip/contracts';
import { RagQueryRequest, RagQueryResponse } from '@drcip/contracts';

export class IntelligenceClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.INTELLIGENCE_SERVICE_URL || 'http://localhost:8000';
  }

  async predictSeverity(request: SeverityPredictionRequest): Promise<SeverityPredictionResponse> {
    try {
      const response = await axios.post(`${this.baseUrl}/internal/v1/predict/severity`, request, {
        timeout: 10000,
      });
      return response.data;
    } catch (err: unknown) {
      const axiosError = err as { code?: string; response?: { status?: number } };
      if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ECONNABORTED' || (axiosError.response?.status && axiosError.response.status >= 500)) {
        return {
          status: 'UNAVAILABLE',
          incident_id: request.incident_id,
          error_code: 'SEVERITY_SERVICE_UNAVAILABLE',
          message: 'Severity prediction service is currently unavailable',
        };
      }
      throw err;
    }
  }

  async forecastDemand(request: DemandForecastRequest): Promise<DemandForecastResponse> {
    try {
      const response = await axios.post(`${this.baseUrl}/internal/v1/forecast/demand`, request, {
        timeout: 10000,
      });
      return response.data;
    } catch (err: unknown) {
      const axiosError = err as { code?: string; response?: { status?: number } };
      if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ECONNABORTED' || (axiosError.response?.status && axiosError.response.status >= 500)) {
        return {
          status: 'UNAVAILABLE',
          forecast_id: `FORE-${Date.now()}`,
          items: [],
          forecast_horizon_start: new Date().toISOString(),
          forecast_horizon_end: new Date(Date.now() + 3600000).toISOString(),
          generated_at: new Date().toISOString(),
          error_code: 'DEMAND_SERVICE_UNAVAILABLE',
          message: 'Demand forecasting service is currently unavailable',
        };
      }
      throw err;
    }
  }

  async optimizeAllocation(request: OptimizationRequest): Promise<OptimizationResponse> {
    try {
      const response = await axios.post(`${this.baseUrl}/internal/v1/optimize/allocation`, request, {
        timeout: 10000,
      });
      return response.data;
    } catch (err: unknown) {
      const axiosError = err as { code?: string; response?: { status?: number } };
      if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ECONNABORTED' || (axiosError.response?.status && axiosError.response.status >= 500)) {
        return {
          status: 'UNAVAILABLE',
          recommendation_id: `REC-${Date.now()}`,
          incident_id: request.incident_id,
          items: [],
          objective_summary: {},
          solver_version: 'unavailable',
          generated_at: new Date().toISOString(),
          error_code: 'OPTIMIZATION_SERVICE_UNAVAILABLE',
          message: 'Optimization service is currently unavailable',
        };
      }
      throw err;
    }
  }

  async queryRag(request: RagQueryRequest): Promise<RagQueryResponse> {
    try {
      const response = await axios.post(`${this.baseUrl}/internal/v1/rag/query`, request, {
        timeout: 15000,
      });
      return response.data;
    } catch (err: unknown) {
      const axiosError = err as { code?: string; response?: { status?: number } };
      if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ECONNABORTED' || (axiosError.response?.status && axiosError.response.status >= 500)) {
        return {
          status: 'UNAVAILABLE',
          answer: 'RAG service is temporarily unavailable. Please try again later.',
          citations: [],
          tool_calls: [],
          rag_version: 'unavailable',
        };
      }
      throw err;
    }
  }
}