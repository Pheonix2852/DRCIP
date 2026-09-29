import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Select } from './ui/select'
import { Textarea } from './ui/textarea'
import { assignments } from '../lib/assignments'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'

const FIELD_EVENT_TYPES = ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']

export function FieldUpdatePage() {
  const queryClient = useQueryClient()
  const [assignmentId, setAssignmentId] = useState('')
  const [eventType, setEventType] = useState('EN_ROUTE')
  const [notes, setNotes] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => assignments.myAssignments(),
  })

  const fieldUpdateMutation = useMutation({
    mutationFn: ({ id, event_type, notes }: { id: string; event_type: string; notes?: string }) =>
      assignments.fieldUpdate(id, { event_type, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] })
      setFeedback('Field update recorded.')
      setNotes('')
    },
    onError: (err: Error) => setFeedback(`Error: ${err.message}`),
  })

  const items = data?.items ?? []

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <PageHeader title="Field Update" />

      {feedback && (
        <div className={`text-sm p-2 rounded ${feedback.startsWith('Error') ? 'bg-status-error/10 text-status-error' : 'bg-status-success/10 text-status-success'}`} role="status">
          {feedback}
          <Button variant="link" size="sm" className="ml-1 h-auto p-0 text-xs underline" onClick={() => setFeedback(null)}>dismiss</Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Active Assignments</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState label="Loading assignments…" className="justify-center py-8" />
          ) : error ? (
            <ErrorState title="Failed to load assignments" description={(error as Error).message} />
          ) : items.length === 0 ? (
            <EmptyState title="No active assignments." description="Assignments dispatched to your team will appear here." />
          ) : (
            <ul className="divide-y" role="list">
              {items.map((a) => (
                <li key={a.id} className="py-3">
                  <div className="drcip-dense-row">
                    <div className="drcip-dense-row-content">
                      <p className="font-medium text-sm break-all">{a.id}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground break-words">
                        {a.status} · Incident {a.incident_id}
                      </p>
                    </div>
                    <div className="drcip-dense-row-actions">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto"
                        disabled={assignmentId === a.id && fieldUpdateMutation.isPending}
                        onClick={() => setAssignmentId(a.id)}
                      >
                        Select
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {assignmentId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base break-all">Submit Update for {assignmentId}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-sm font-medium" htmlFor="field-event-type">Event Type</label>
              <Select id="field-event-type" value={eventType} onChange={(e) => setEventType(e.target.value)}>
                {FIELD_EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="field-notes">Notes (optional)</label>
              <Textarea id="field-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} />
            </div>
            <Button
              disabled={fieldUpdateMutation.isPending}
              onClick={() => fieldUpdateMutation.mutate({ id: assignmentId, event_type: eventType, notes: notes || undefined })}
            >
              {fieldUpdateMutation.isPending ? 'Submitting...' : 'Submit Field Update'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default FieldUpdatePage
