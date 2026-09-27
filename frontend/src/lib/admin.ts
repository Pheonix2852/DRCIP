import api from './api'

export interface AdminOverview {
  users: {
    total: number
    active: number
    by_role: Record<string, number>
  }
  incidents: { total: number }
  resources: { total: number }
  teams: { total: number; active: number }
  shelters: { total: number }
  health: { status: string; timestamp: string }
  rag: {
    status: string
    documents_total: number
    documents_pending_approval: number
    message: string
  }
  configuration: { status: string; message: string }
  recent_audit: {
    id: string
    actor_name: string
    action: string
    entity_type: string
    occurred_at: string
  }[]
}

function unwrap<T>(res: { data?: { success?: boolean; data?: unknown; error?: { message?: string } } }): T {
  if (!res.data || !res.data.success) {
    throw new Error(res.data?.error?.message || 'Request failed')
  }
  return res.data.data as T
}

export const admin = {
  overview: () =>
    api.get('/api/v1/admin/overview').then((res) => unwrap<AdminOverview>(res)),
  leaderCandidates: (excludeTeamId?: string) =>
    api.get('/api/v1/admin/leader-candidates', { params: { exclude_team_id: excludeTeamId } })
      .then((res) => unwrap<{ id: string; name: string; email: string }[]>(res)),
}