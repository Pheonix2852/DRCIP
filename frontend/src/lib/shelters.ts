import { unwrap } from './utils'
import api from './api'

export interface Shelter {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  total_capacity: number
  current_occupancy: number
  status: string
  capabilities: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ShelterListResponse {
  items: Shelter[]
  pagination: { page: number; limit: number; total: number; total_pages: number }
}

export interface CreateShelterRequest {
  name: string
  latitude: number
  longitude: number
  total_capacity: number
  current_occupancy?: number
  status?: string
  capabilities?: Record<string, unknown>
}

export interface UpdateShelterRequest {
  name?: string
  latitude?: number
  longitude?: number
  total_capacity?: number
  current_occupancy?: number
  status?: string
  capabilities?: Record<string, unknown>
}


export function canManageShelters(role?: string): boolean {
  return role === 'DISASTER_COORDINATOR' || role === 'ADMINISTRATOR'
}

export const shelters = {
  list: (params?: Record<string, unknown>) =>
    api.get('/api/v1/shelters', { params }).then((res) => unwrap<ShelterListResponse>(res)),

  detail: (id: string) => api.get(`/api/v1/shelters/${id}`).then((res) => unwrap<Shelter>(res)),

  create: (data: CreateShelterRequest) =>
    api.post('/api/v1/shelters', data).then((res) => unwrap<{ shelter_id: string; created_at: string }>(res)),

  update: (id: string, data: UpdateShelterRequest) =>
    api.patch(`/api/v1/shelters/${id}`, data).then((res) => unwrap<Shelter>(res)),
}

export default shelters
