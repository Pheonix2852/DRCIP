import api from './api';

function unwrap<T>(res: { data?: { success?: boolean; data?: unknown; error?: { message?: string } } }): T {
  if (!res.data || !res.data.success) {
    throw new Error(res.data?.error?.message || 'Request failed')
  }
  return res.data.data as T
}

export const capacity = {
  get: () => api.get('/api/v1/capacity').then(res => unwrap<{ available_resources: number, active_teams: number, available_shelter_capacity: number }>(res))
}
