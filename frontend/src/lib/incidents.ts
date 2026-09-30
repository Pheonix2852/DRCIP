import { unwrap } from './utils'
import api from './api'
import type { LatestPrediction, SeverityLevel, DisasterType, IncidentStatus } from '@drcip/contracts'

export interface CreateIncidentRequest {
  disaster_type: DisasterType
  description: string
  latitude: number
  longitude: number
  people_affected: number
  emergency_contact_number: string
}

export interface CreateIncidentResponse {
  incident_id: string
  status: string
  created_at: string
}

export interface TriageRequest {
  confirmed_severity: SeverityLevel
  notes?: string
}

export interface IncidentSummary {
  id: string
  disaster_type: DisasterType
  description: string
  people_affected: number
  emergency_contact_number: string
  status: IncidentStatus
  predicted_severity?: SeverityLevel
  confirmed_severity?: SeverityLevel
  created_at: string
  updated_at: string
  latitude?: number
  longitude?: number
  address_text?: string
  state?: string
  district?: string
  response_zone?: string
}

export interface IncidentDetails {
  id: string
  reporter_user_id: string
  disaster_type: DisasterType
  description: string
  people_affected: number
  emergency_contact_number: string
  latitude: number | null
  longitude: number | null
  address_text?: string
  state?: string
  district?: string
  response_zone?: string
  predicted_severity?: SeverityLevel
  confirmed_severity?: SeverityLevel
  latest_prediction?: LatestPrediction
  status: IncidentStatus
  resolved_at?: string
  created_at: string
  updated_at: string
  media?: { id: string; media_type: string; secure_url: string; mime_type: string }[]
}

export interface MediaUploadResponse {
  id: string
  media_type: string
  mime_type: string
  secure_url: string
}

export const incidents = {
  create: (data: CreateIncidentRequest) =>
    api.post('/api/v1/incidents', data).then((res) => unwrap<CreateIncidentResponse>(res)),
  list: (params?: Record<string, unknown>) =>
    api
      .get('/api/v1/incidents', { params })
      .then((res) =>
        unwrap<{ items: IncidentSummary[]; pagination: { page: number; limit: number; total: number; total_pages: number } }>(res)
      ),
  detail: (id: string) => api.get(`/api/v1/incidents/${id}`).then((res) => unwrap<IncidentDetails>(res)),
  triage: (id: string, data: TriageRequest) =>
    api.patch(`/api/v1/incidents/${id}/triage`, data).then((res) => unwrap(res)),
  resolve: (id: string, data: { notes: string }) =>
    api.patch(`/api/v1/incidents/${id}/resolve`, data).then((res) => unwrap<{ incident_id: string; status: string; resolved_at: string }>(res)),
  uploadMedia: (id: string, formData: FormData) =>
    // Do NOT set Content-Type manually — the browser must add the multipart
    // boundary itself when passing a FormData body.
    api.post(`/api/v1/incidents/${id}/media`, formData).then((res) => unwrap<MediaUploadResponse>(res)),
}

export default incidents