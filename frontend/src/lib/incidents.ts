import api from './api'

export interface CreateIncidentRequest {
  disaster_type: string
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
  confirmed_severity: string
  notes?: string
}

export interface IncidentSummary {
  id: string
  disaster_type: string
  description: string
  people_affected: number
  emergency_contact_number: string
  status: string
  predicted_severity?: string
  confirmed_severity?: string
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
  disaster_type: string
  description: string
  people_affected: number
  emergency_contact_number: string
  latitude: number | null
  longitude: number | null
  address_text?: string
  state?: string
  district?: string
  response_zone?: string
  predicted_severity?: string
  confirmed_severity?: string
  status: string
  resolved_at?: string
  created_at: string
  updated_at: string
  media?: { id: string; media_type: string; secure_url: string; mime_type: string }[]
  latest_prediction?: {
    severity?: string
    confidence?: string
    model_version?: string
    status?: string
    generated_at?: string
  }
}

export interface MediaUploadResponse {
  id: string
  media_type: string
  mime_type: string
  secure_url: string
}

// Unwrap the {success, data} envelope from an axios response so callers
// work with the inner payload directly. Throws on error envelopes.
function unwrap<T>(res: { data?: { success?: boolean; data?: unknown; error?: { message?: string } } }): T {
  if (!res.data || !res.data.success) {
    throw new Error(res.data?.error?.message || 'Request failed')
  }
  return res.data.data as T
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
  uploadMedia: (id: string, formData: FormData) =>
    // Do NOT set Content-Type manually — the browser must add the multipart
    // boundary itself when passing a FormData body.
    api.post(`/api/v1/incidents/${id}/media`, formData).then((res) => unwrap<MediaUploadResponse>(res)),
}

export default incidents