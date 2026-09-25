import api from './api'

export interface AuditLogSummary {
  id: string
  actor_user_id: string | null
  actor_name: string | null
  action: string
  entity_type: string
  entity_id: string | null
  metadata: Record<string, unknown> | null
  occurred_at: string
}

export interface AuditLogDetail {
  id: string
  actor_user_id: string | null
  actor_name: string | null
  actor_email: string | null
  action: string
  entity_type: string
  entity_id: string | null
  before_state: Record<string, unknown> | null
  after_state: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  occurred_at: string
}

export interface AuditLogListResponse {
  items: AuditLogSummary[]
  pagination: { page: number; limit: number; total: number; total_pages: number }
}

function unwrap<T>(res: { data?: { success?: boolean; data?: unknown; error?: { message?: string } } }): T {
  if (!res.data || !res.data.success) {
    throw new Error(res.data?.error?.message || 'Request failed')
  }
  return res.data.data as T
}

export function canViewAuditLogs(role?: string): boolean {
  return role === 'DISASTER_COORDINATOR' || role === 'ADMINISTRATOR'
}

export const auditLogs = {
  list: (params?: Record<string, unknown>) =>
    api.get('/api/v1/audit-logs', { params }).then((res) => unwrap<AuditLogListResponse>(res)),

  detail: (id: string) => api.get(`/api/v1/audit-logs/${id}`).then((res) => unwrap<AuditLogDetail>(res)),
}

export default auditLogs