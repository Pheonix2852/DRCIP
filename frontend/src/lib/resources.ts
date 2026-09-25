import api from './api'

export interface ResourceSummary {
  id: string
  resource_type: string
  name: string
  status: string
  quantity: number
  unit: string | null
  capacity: number | null
  capability_profile: Record<string, unknown>
  latitude: number | null
  longitude: number | null
  contact_reference: string | null
  team_id: string | null
  is_own_team: boolean
  created_at: string
  updated_at: string
}

export interface Pagination {
  page: number
  limit: number
  total: number
  total_pages: number
}

export interface ResourceListResponse {
  items: ResourceSummary[]
  pagination: Pagination
}

export interface CreateResourceRequest {
  resource_type: string
  name: string
  status: string
  quantity: number
  unit?: string
  capacity?: number
  capability_profile?: Record<string, unknown>
  latitude?: number
  longitude?: number
  contact_reference?: string
}

export interface CreateResourceResponse {
  resource_id: string
  status: string
  created_at: string
}

export interface UpdateResourceRequest {
  name?: string
  status?: string
  quantity?: number
  unit?: string
  capacity?: number
  capability_profile?: Record<string, unknown>
  latitude?: number
  longitude?: number
  contact_reference?: string
}

function unwrap<T>(res: { data?: { success?: boolean; data?: unknown; error?: { message?: string } } }): T {
  if (!res.data || !res.data.success) {
    throw new Error(res.data?.error?.message || 'Request failed')
  }
  return res.data.data as T
}

export const resources = {
  list: (params?: Record<string, unknown>) =>
    api
      .get('/api/v1/resources', { params })
      .then((res) => unwrap<ResourceListResponse>(res)),

  detail: (id: string) =>
    api.get(`/api/v1/resources/${id}`).then((res) => unwrap<ResourceSummary>(res)),

  create: (data: CreateResourceRequest) =>
    api.post('/api/v1/resources', data).then((res) => unwrap<CreateResourceResponse>(res)),

  update: (id: string, data: UpdateResourceRequest) =>
    api.patch(`/api/v1/resources/${id}`, data).then((res) => unwrap<ResourceSummary>(res)),
}

export default resources
