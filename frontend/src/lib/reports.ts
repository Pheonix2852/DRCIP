import api from './api'
import type { ReportAnalyticsResponse } from '@drcip/contracts'

function unwrap<T>(res: { data?: { success?: boolean; data?: unknown; error?: { message?: string } } }): T {
  if (!res.data || !res.data.success) {
    throw new Error(res.data?.error?.message || 'Request failed')
  }
  return res.data.data as T
}

export interface AnalyticsParams {
  date_from?: string
  date_to?: string
  disaster_type?: string
  response_zone_id?: string
}

export const reports = {
  getAnalytics: (params: AnalyticsParams = {}) =>
    api.get('/api/v1/reports/analytics', { params }).then(res => unwrap<ReportAnalyticsResponse>(res)),

  exportCsv: (params: AnalyticsParams = {}) =>
    api.get('/api/v1/reports/export.csv', { params, responseType: 'blob' }),

  exportXlsx: (params: AnalyticsParams = {}) =>
    api.get('/api/v1/reports/export.xlsx', { params, responseType: 'blob' }),

  exportPdf: (params: AnalyticsParams = {}) =>
    api.get('/api/v1/reports/export.pdf', { params, responseType: 'blob' }),
}
