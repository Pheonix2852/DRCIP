import { unwrap } from './utils'
import api from './api'


export interface ResponseZone {
  public_id: string
  name: string
  is_active: boolean
}

export const responseZones = {
  list: () => api.get('/api/v1/response-zones').then(res => unwrap<{ items: ResponseZone[] }>(res)),
}
