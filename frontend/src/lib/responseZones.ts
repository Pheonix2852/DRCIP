import api from './api'

function unwrap<T>(res: { data?: { success?: boolean; data?: unknown; error?: { message?: string } } }): T {
  if (!res.data || !res.data.success) {
    throw new Error(res.data?.error?.message || 'Request failed')
  }
  return res.data.data as T
}

export interface ResponseZone {
  public_id: string
  name: string
  is_active: boolean
}

export const responseZones = {
  list: () => api.get('/api/v1/response-zones').then(res => unwrap<{ items: ResponseZone[] }>(res)),
}
