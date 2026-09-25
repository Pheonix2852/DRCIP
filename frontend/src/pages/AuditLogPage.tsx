import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { AUDIT_ACTIONS } from '@drcip/contracts'
import { auditLogs, canViewAuditLogs, type AuditLogDetail } from '../lib/audit'
import { useAuth } from '../contexts/AuthContext'

const PAGE_SIZE = 20
const AUDIT_ACTION_VALUES = Object.keys(AUDIT_ACTIONS)

export function AuditLogPage() {
  const { user } = useAuth()

  const [actionFilter, setActionFilter] = useState('')
  const [entityType, setEntityType] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  const [detail, setDetail] = useState<AuditLogDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const params = useMemo(() => ({
    page,
    limit: PAGE_SIZE,
    ...(actionFilter && { action: actionFilter }),
    ...(entityType.trim() && { entity_type: entityType.trim() }),
    ...(search.trim() && { search: search.trim() }),
    ...(from && { from: from }),
    ...(to && { to: to }),
  }), [page, actionFilter, entityType, search, from, to])

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => auditLogs.list(params),
    placeholderData: (prev) => prev,
  })

  useEffect(() => {
    const onFocus = () => { refetch() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refetch])

  const openDetail = async (id: string) => {
    setDetailLoading(true)
    setDetailError('')
    setDetail(null)
    try {
      const log = await auditLogs.detail(id)
      setDetail(log)
    } catch (err) {
      setDetailError((err as Error).message || 'Failed to load audit log')
    } finally {
      setDetailLoading(false)
    }
  }

  if (!canViewAuditLogs(user?.role)) {
    return <div className="text-sm text-muted-foreground">Cannot view audit logs.</div>
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Audit Log Viewer</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Search action / entity" className="w-56" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} data-testid="audit-search" />
            <Select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1) }} className="w-56" data-testid="audit-action-filter">
              <option value="">All actions</option>
              {AUDIT_ACTION_VALUES.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
            <Input placeholder="Entity type" className="w-40" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1) }} data-testid="audit-entity-filter" />
            <Input type="datetime-local" className="w-52" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} data-testid="audit-from" />
            <Input type="datetime-local" className="w-52" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} data-testid="audit-to" />
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setActionFilter(''); setEntityType(''); setFrom(''); setTo(''); setPage(1) }}>Clear filters</Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground" role="status">Loading audit logs...</div>
      ) : error ? (
        <div className="text-center py-16 text-destructive text-sm">{(error as Error).message || 'Failed to load audit logs'}</div>
      ) : !data?.items.length ? (
        <div className="text-center py-16 text-muted-foreground">No audit records found.</div>
      ) : (
        <Card>
          <CardContent className="space-y-2">
            {data.items.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-3 border-b pb-2 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{l.action}</span>
                    <span className="text-xs text-muted-foreground">{l.entity_type}{l.entity_id ? ` · ${String(l.entity_id).slice(0, 12)}` : ''}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {l.actor_name ?? 'System'} · {new Date(l.occurred_at).toLocaleString()}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => openDetail(l.id)} data-testid="audit-detail">View</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data && data.pagination.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Page {data.pagination.page} of {data.pagination.total_pages}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
            <Button variant="outline" size="sm" disabled={page >= data.pagination.total_pages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}

      {(detail || detailLoading || detailError) && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => { setDetail(null); setDetailError('') }}>
          <div className="bg-white rounded-lg p-6 w-full max-w-lg shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">Audit Detail</h2>
            {detailLoading && <div className="text-sm text-muted-foreground" role="status">Loading...</div>}
            {detailError && <div className="mb-3 p-2 rounded bg-red-50 text-red-700 text-sm" role="alert">{detailError}</div>}
            {detail && (
              <div className="space-y-2 text-sm">
                <p><span className="font-medium">Action:</span> {detail.action}</p>
                <p><span className="font-medium">Entity:</span> {detail.entity_type}{detail.entity_id ? ` (${detail.entity_id})` : ''}</p>
                <p><span className="font-medium">Actor:</span> {detail.actor_name ?? 'System'}{detail.actor_email ? ` (${detail.actor_email})` : ''}</p>
                <p><span className="font-medium">Occurred:</span> {new Date(detail.occurred_at).toLocaleString()}</p>
                {detail.before_state && Object.keys(detail.before_state).length > 0 && (
                  <div>
                    <p className="font-medium">Before:</p>
                    <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto">{JSON.stringify(detail.before_state, null, 2)}</pre>
                  </div>
                )}
                {detail.after_state && Object.keys(detail.after_state).length > 0 && (
                  <div>
                    <p className="font-medium">After:</p>
                    <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto">{JSON.stringify(detail.after_state, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end pt-4">
              <Button variant="ghost" onClick={() => { setDetail(null); setDetailError('') }}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AuditLogPage