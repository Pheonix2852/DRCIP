import api from './api'

export interface TeamMember {
  id: string
  member_name: string
  member_role: string
  contact_reference: string | null
  is_active: boolean
  joined_at: string
}

export interface TeamSummary {
  id: string
  name: string
  status: string
  capability_profile: Record<string, unknown>
  leader: { id: string; name: string }
  members: TeamMember[]
  created_at: string
  updated_at: string
}

export interface TeamListResponse {
  items: TeamSummary[]
  pagination: { page: number; limit: number; total: number; total_pages: number }
}

export interface CreateTeamRequest {
  name: string
  leader_user_id: string
  capability_profile?: Record<string, unknown>
}

export interface UpdateTeamRequest {
  name?: string
  capability_profile?: Record<string, unknown>
}

export interface AddMemberRequest {
  member_name: string
  member_role: string
  contact_reference?: string
}

function unwrap<T>(res: { data?: { success?: boolean; data?: unknown; error?: { message?: string } } }): T {
  if (!res.data || !res.data.success) {
    throw new Error(res.data?.error?.message || 'Request failed')
  }
  return res.data.data as T
}

// Role-scoped UI capability helper. The backend remains authoritative.
export function canManageTeams(role?: string): boolean {
  return role === 'DISASTER_COORDINATOR' || role === 'ADMINISTRATOR'
}

export const teams = {
  list: (params?: Record<string, unknown>) =>
    api.get('/api/v1/teams', { params }).then((res) => unwrap<TeamListResponse>(res)),

  detail: (id: string) => api.get(`/api/v1/teams/${id}`).then((res) => unwrap<TeamSummary>(res)),

  create: (data: CreateTeamRequest) => api.post('/api/v1/teams', data).then((res) => unwrap<TeamSummary>(res)),

  update: (id: string, data: UpdateTeamRequest) =>
    api.patch(`/api/v1/teams/${id}`, data).then((res) => unwrap<TeamSummary>(res)),

  updateStatus: (id: string, status: string) =>
    api.patch(`/api/v1/teams/${id}/status`, { status }).then((res) => unwrap<TeamSummary>(res)),

  addMember: (id: string, data: AddMemberRequest) =>
    api.post(`/api/v1/teams/${id}/members`, data).then((res) => unwrap<TeamMember>(res)),

  myTeam: () => api.get('/api/v1/me/team').then((res) => unwrap<TeamSummary>(res)),
}

export default teams
