import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { AUDIT_ACTIONS } from '@drcip/contracts'
import { auditLogs, canViewAuditLogs, type AuditLogDetail } from '../lib/audit'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'

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
    return (
      <div>
        <PageHeader title="Audit Log Viewer" />
        <p className="text-sm text-muted-foreground" role="alert">Cannot view audit logs.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Audit Log Viewer" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="drcip-filter-group">
            <Input aria-label="Search audit log" placeholder="Search action / entity" className="sm:w-56" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} data-testid="audit-search" />
            <Select aria-label="Filter by action" value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1) }} className="sm:w-56" data-testid="audit-action-filter">
              <option value="">All actions</option>
              {AUDIT_ACTION_VALUES.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
            <Input aria-label="Filter by entity type" placeholder="Entity type" className="sm:w-40" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1) }} data-testid="audit-entity-filter" />
            <Input aria-label="From date" type="datetime-local" className="sm:w-52" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} data-testid="audit-from" />
            <Input aria-label="To date" type="datetime-local" className="sm:w-52" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} data-testid="audit-to" />
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setActionFilter(''); setEntityType(''); setFrom(''); setTo(''); setPage(1) }}>Clear filters</Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState label="Loading audit logs…" className="justify-center py-16" />
      ) : error ? (
        <ErrorState
          title="Failed to load audit logs"
          description={(error as Error).message}
          retry={() => refetch()}
        />
      ) : !data?.items.length ? (
        <EmptyState title="No audit records found." description="No entries match the current filters." />
      ) : (
        <Card>
          <CardContent className="space-y-2">
            {data.items.map((l) => (
              <div key={l.id} className="drcip-dense-row border-b pb-2 last:border-b-0">
                <div className="drcip-dense-row-content">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-drcip-md bg-status-info/10 text-status-info font-medium">{l.action}</span>
                    <span className="text-xs text-muted-foreground">{l.entity_type}{l.entity_id ? ` · ${String(l.entity_id).slice(0, 12)}` : ''}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 break-words">
                    {l.actor_name ?? 'System'} · {new Date(l.occurred_at).toLocaleString()}
                  </div>
                </div>
                <div className="drcip-dense-row-actions">
                  <Button variant="outline" size="sm" onClick={() => openDetail(l.id)} data-testid="audit-detail">View</Button>
                </div>
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

      <Dialog open={!!detail || detailLoading || !!detailError} onOpenChange={(open) => { if (!open) { setDetail(null); setDetailError('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Audit Detail</DialogTitle>
          </DialogHeader>
          {detailLoading && <div className="text-sm text-muted-foreground" role="status">Loading…</div>}
          {detailError && <div className="p-2 rounded bg-destructive/10 text-destructive text-sm" role="alert">{detailError}</div>}
          {detail && (
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Action:</span> {detail.action}</p>
              <p><span className="font-medium">Entity:</span> {detail.entity_type}{detail.entity_id ? ` (${detail.entity_id})` : ''}</p>
              <p><span className="font-medium">Actor:</span> {detail.actor_name ?? 'System'}{detail.actor_email ? ` (${detail.actor_email})` : ''}</p>
              <p><span className="font-medium">Occurred:</span> {new Date(detail.occurred_at).toLocaleString()}</p>
              {detail.before_state && Object.keys(detail.before_state).length > 0 && (
                <div>
                  <p className="font-medium">Before:</p>
                  <pre className="text-xs bg-surface-cool p-2 rounded overflow-x-auto">{JSON.stringify(detail.before_state, null, 2)}</pre>
                </div>
              )}
              {detail.after_state && Object.keys(detail.after_state).length > 0 && (
                <div>
                  <p className="font-medium">After:</p>
                  <pre className="text-xs bg-surface-cool p-2 rounded overflow-x-auto">{JSON.stringify(detail.after_state, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end pt-4">
            <Button variant="ghost" onClick={() => { setDetail(null); setDetailError('') }}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default AuditLogPage