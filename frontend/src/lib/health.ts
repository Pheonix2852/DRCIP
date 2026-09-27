import api from './api'

export interface HealthResponse {
  status: string
  database: string
  timestamp: string
}

export interface VersionResponse {
  service: string
  version: string
}

export const health = {
  check: () => api.get('/health').then((res) => res.data as HealthResponse),
  version: () => api.get('/health/version').then((res) => res.data as VersionResponse),
}