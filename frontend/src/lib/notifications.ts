import { unwrap } from './utils'
import api from './api'

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS'
export type NotificationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type NotificationDeliveryStatus = 'PENDING' | 'SENT' | 'FAILED'

export interface NotificationSummary {
  id: string
  public_id: string
  logical_key: string
  channel: NotificationChannel
  notification_type: string
  priority: NotificationPriority
  message: string
  payload: Record<string, unknown>
  delivery_status: NotificationDeliveryStatus
  sent_at: string | null
  read_at: string | null
  incident_public_id: string | null
  assignment_public_id: string | null
  created_at: string
}

export interface NotificationListResponse {
  items: NotificationSummary[]
  pagination: { page: number; limit: number; total: number; total_pages: number }
}


export const notifications = {
  list: (params?: Record<string, unknown>) =>
    api.get('/api/v1/notifications', { params }).then((res) => unwrap<NotificationListResponse>(res)),

  markRead: (id: string) =>
    api.post(`/api/v1/notifications/${id}/read`).then((res) => unwrap<NotificationSummary>(res)),
}

export default notifications