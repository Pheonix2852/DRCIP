import api from './api'

export interface AssignmentItem {
  resource_type: string | null
  resource_id: string | null
  team_id: string | null
  shelter_id: string | null
  quantity: number
}

export interface AssignmentEvent {
  event_type: string
  actor_user_id: string
  notes: string | null
  occurred_at: string
}

export interface AssignmentSummary {
  id: string
  incident_id: string
  status: string
  assigned_by: string
  field_team_id: string | null
  recommendation_id: string | null
  notes: string | null
  assigned_at: string
  started_at: string | null
  completed_at: string | null
  created_at: string
  items: AssignmentItem[]
  events: AssignmentEvent[]
}

export interface Pagination {
  page: number
  limit: number
  total: number
  total_pages: number
}

export interface AssignmentListResponse {
  items: AssignmentSummary[]
  pagination: Pagination
}

export type CreateResourceItem = { resource_type: string; resource_id: string; quantity: number }
export type CreateTeamItem = { team_id: string; quantity: 1 }
export type CreateShelterItem = { shelter_id: string; quantity: number }

export type CreateAssignmentItem = CreateResourceItem | CreateTeamItem | CreateShelterItem

export interface CreateAssignmentRequest {
  recommendation_id?: string
  items: CreateAssignmentItem[]
  notes?: string
}

function unwrap<T>(res: { data?: { success?: boolean; data?: unknown; error?: { message?: string } } }): T {
  if (!res.data || !res.data.success) {
    throw new Error(res.data?.error?.message || 'Request failed')
  }
  return res.data.data as T
}

export const assignments = {
  list: (params?: Record<string, unknown>) =>
    api.get('/api/v1/assignments', { params }).then((res) => unwrap<AssignmentListResponse>(res)),

  detail: (id: string) =>
    api.get(`/api/v1/assignments/${id}`).then((res) => unwrap<AssignmentSummary>(res)),

  create: (incidentId: string, data: CreateAssignmentRequest) =>
    api
      .post(`/api/v1/incidents/${incidentId}/assignments`, data)
      .then((res) => unwrap<AssignmentSummary>(res)),

  updateStatus: (id: string, data: { status: 'IN_PROGRESS' | 'CANCELLED' | 'COMPLETED'; notes?: string }) =>
    api.patch(`/api/v1/assignments/${id}/status`, data).then((res) => unwrap<AssignmentSummary>(res)),

  fieldUpdate: (id: string, data: { event_type: string; notes?: string }) =>
    api.post(`/api/v1/assignments/${id}/field-updates`, data).then((res) => unwrap<{ event_type: string; notes: string | null; occurred_at: string }>(res)),

  addEvent: (id: string, data: { event_type: string; notes?: string }) =>
    api.post(`/api/v1/assignments/${id}/events`, data).then((res) => unwrap<AssignmentEvent>(res)),

  myAssignments: (params?: Record<string, unknown>) =>
    api.get('/api/v1/me/assignments', { params }).then((res) => unwrap<AssignmentListResponse>(res)),
}

export default assignments
