import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { assignments, type AssignmentSummary } from '../lib/assignments'
import { incidents } from '../lib/incidents'
import { useAuth } from '../contexts/AuthContext'
import { useRealtime } from '../hooks/useRealtime'
import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'

export function AssignmentsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  useRealtime()
  const canManage = user?.role === 'DISASTER_COORDINATOR' || user?.role === 'ADMINISTRATOR'

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => assignments.list(),
  })

  const [actionError, setActionError] = useState('')

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'IN_PROGRESS' | 'CANCELLED' | 'COMPLETED' }) =>
      assignments.updateStatus(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assignments'] }),
    onError: (err: Error) => setActionError(err.message),
  })

  const items: AssignmentSummary[] = data?.items ?? []

  const [resolveIncidentId, setResolveIncidentId] = useState('')
  const [resolveNotes, setResolveNotes] = useState('')
  const [resolveFeedback, setResolveFeedback] = useState<string | null>(null)

  const resolveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => incidents.resolve(id, { notes }),
    onSuccess: () => {
      setResolveFeedback('Incident resolved.')
      setResolveIncidentId('')
      setResolveNotes('')
    },
    onError: (err: Error) => setResolveFeedback(`Error: ${err.message}`),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title="Assignments" className="mb-0" />
        <Button variant="outline" size="sm" onClick={() => refetch()}>Refresh</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assignments ({data?.pagination?.total ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState label="Loading assignments…" className="justify-center py-12" />
          ) : error ? (
            <ErrorState
              title="Failed to load assignments"
              description={(error as Error).message}
              retry={() => refetch()}
            />
          ) : items.length === 0 ? (
            <EmptyState title="No assignments." description="Assignments created by a coordinator will appear here." />
          ) : (
            <ul className="divide-y" role="list">
              {items.map((a) => (
                <li key={a.id} className="py-3" data-testid={`assignment-${a.id}`}>
                  <div className="drcip-dense-row">
                    <div className="drcip-dense-row-content">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm break-all">{a.id}</span>
                        <StatusBadge status={a.status} />
                        <Link className="text-xs text-primary hover:underline break-all" to={`/incidents/${a.incident_id}`}>
                          {a.incident_id}
                        </Link>
                        {a.field_team_id && (
                          <span className="px-2 py-0.5 rounded-drcip-md bg-surface-cool font-mono text-xs break-all">{a.field_team_id}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 break-words">
                        {a.items.length} item(s) &middot; assigned {new Date(a.assigned_at).toLocaleString()}
                        {a.started_at && <> &middot; started {new Date(a.started_at).toLocaleString()}</>}
                        {a.completed_at && <> &middot; completed {new Date(a.completed_at).toLocaleString()}</>}
                      </p>
                      {a.notes && <p className="text-xs text-muted-foreground mt-0.5 break-words">{a.notes}</p>}
                    </div>
                    {canManage && (a.status === 'ASSIGNED' || a.status === 'IN_PROGRESS') && (
                      <div className="drcip-dense-row-actions">
                        {a.status === 'ASSIGNED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={statusMutation.isPending}
                            onClick={() => statusMutation.mutate({ id: a.id, status: 'IN_PROGRESS' })}
                          >
                            Start
                          </Button>
                        )}
                        {a.status === 'IN_PROGRESS' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={statusMutation.isPending}
                            onClick={() => statusMutation.mutate({ id: a.id, status: 'COMPLETED' })}
                          >
                            Complete
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={statusMutation.isPending}
                          onClick={() => statusMutation.mutate({ id: a.id, status: 'CANCELLED' })}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resolve Incident</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {resolveFeedback && (
              <div className={`text-sm p-2 rounded ${resolveFeedback.startsWith('Error') ? 'bg-status-error/10 text-status-error' : 'bg-status-success/10 text-status-success'}`} role="status">
                {resolveFeedback}
                <Button variant="link" size="sm" className="ml-1 h-auto p-0 text-xs underline" onClick={() => setResolveFeedback(null)}>dismiss</Button>
              </div>
            )}
            {actionError && <p className="text-sm text-status-error" role="alert">Failed to update assignment: {actionError}</p>}
            <div>
              <label className="text-sm font-medium" htmlFor="resolve-incident-id">Incident ID</label>
              <Input id="resolve-incident-id" placeholder="INC-XXXXXXXX" value={resolveIncidentId} onChange={(e) => setResolveIncidentId(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="resolve-notes">Resolution Notes (required)</label>
              <Textarea id="resolve-notes" value={resolveNotes} onChange={(e) => setResolveNotes(e.target.value)} maxLength={2000} rows={3} />
            </div>
            <Button
              disabled={resolveMutation.isPending || !resolveIncidentId.trim() || !resolveNotes.trim()}
              onClick={() => resolveMutation.mutate({ id: resolveIncidentId.trim(), notes: resolveNotes.trim() })}
            >
              {resolveMutation.isPending ? 'Resolving...' : 'Resolve Incident'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default AssignmentsPage