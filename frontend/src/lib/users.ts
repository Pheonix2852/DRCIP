import api from './api'

export interface User {
  id: string
  name: string
  email: string
  role: string
  is_active: boolean
  created_at: string
}

export interface UserDetail {
  id: string
  name: string
  email: string
  role: string
  is_active: boolean
  created_at: string
  updated_at: string
  last_login_at: string | null
  created_by: string | null
}

export interface UserListResponse {
  items: User[]
  pagination: { page: number; limit: number; total: number; total_pages: number }
}

export interface CreateUserRequest {
  name: string
  email: string
  role: string
}

export interface UpdateUserRequest {
  name?: string
  role?: string
}

function unwrap<T>(res: { data?: { success?: boolean; data?: unknown; error?: { message?: string } } }): T {
  if (!res.data || !res.data.success) {
    throw new Error(res.data?.error?.message || 'Request failed')
  }
  return res.data.data as T
}

export function canManageUsers(role?: string): boolean {
  return role === 'ADMINISTRATOR'
}

export const users = {
  list: (params?: Record<string, unknown>) =>
    api.get('/api/v1/users', { params }).then((res) => unwrap<UserListResponse>(res)),

  detail: (id: string) => api.get(`/api/v1/users/${id}`).then((res) => unwrap<UserDetail>(res)),

  create: (data: CreateUserRequest) =>
    api.post('/api/v1/users', data).then((res) => unwrap<User>(res)),

  update: (id: string, data: UpdateUserRequest) =>
    api.patch(`/api/v1/users/${id}`, data).then((res) => unwrap<User>(res)),

  activate: (id: string) => api.post(`/api/v1/users/${id}/activate`).then((res) => unwrap<User>(res)),

  deactivate: (id: string) => api.post(`/api/v1/users/${id}/deactivate`).then((res) => unwrap<User>(res)),
}

export default users