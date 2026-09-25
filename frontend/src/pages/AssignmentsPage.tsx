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

export function AssignmentsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  useRealtime()
  const canManage = user?.role === 'DISASTER_COORDINATOR' || user?.role === 'ADMINISTRATOR'

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => assignments.list(),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'IN_PROGRESS' | 'CANCELLED' | 'COMPLETED' }) =>
      assignments.updateStatus(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assignments'] }),
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
        <h1 className="text-xl font-semibold">Assignments</h1>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Refresh</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assignments ({data?.pagination?.total ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground" role="status">Loading assignments...</div>
          ) : error ? (
            <div className="text-center py-12 text-destructive text-sm" role="alert">
              {(error as Error).message || 'Failed to load assignments'}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No assignments.</div>
          ) : (
            <ul className="divide-y" role="list">
              {items.map((a) => (
                <li key={a.id} className="py-3" data-testid={`assignment-${a.id}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{a.id}</span>
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs">{a.status}</span>
                        <Link className="text-xs text-blue-700 underline" to={`/incidents/${a.incident_id}`}>
                          {a.incident_id}
                        </Link>
                        {a.field_team_id && (
                          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs">{a.field_team_id}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {a.items.length} item(s) &middot; assigned {new Date(a.assigned_at).toLocaleString()}
                        {a.started_at && <> &middot; started {new Date(a.started_at).toLocaleString()}</>}
                        {a.completed_at && <> &middot; completed {new Date(a.completed_at).toLocaleString()}</>}
                      </p>
                      {a.notes && <p className="text-xs text-muted-foreground mt-0.5">{a.notes}</p>}
                    </div>
                    {canManage && (a.status === 'ASSIGNED' || a.status === 'IN_PROGRESS') && (
                      <div className="flex gap-2">
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
              <div className={`text-sm p-2 rounded ${resolveFeedback.startsWith('Error') ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`} role="status">
                {resolveFeedback}
                <button className="ml-2 underline text-xs" onClick={() => setResolveFeedback(null)}>dismiss</button>
              </div>
            )}
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
