import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Select } from './ui/select'
import { Textarea } from './ui/textarea'
import { assignments } from '../lib/assignments'

const FIELD_EVENT_TYPES = ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']

export function FieldUpdatePage() {
  const queryClient = useQueryClient()
  const [assignmentId, setAssignmentId] = useState('')
  const [eventType, setEventType] = useState('EN_ROUTE')
  const [notes, setNotes] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
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
      <h1 className="text-xl font-semibold">Field Update</h1>

      {feedback && (
        <div className={`text-sm p-2 rounded ${feedback.startsWith('Error') ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`} role="status">
          {feedback}
          <button className="ml-2 underline text-xs" onClick={() => setFeedback(null)}>dismiss</button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Active Assignments</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground" role="status">Loading...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No active assignments.</div>
          ) : (
            <ul className="divide-y" role="list">
              {items.map((a) => (
                <li key={a.id} className="py-3 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-sm">{a.id}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{a.status}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{a.incident_id}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={assignmentId === a.id && fieldUpdateMutation.isPending}
                    onClick={() => setAssignmentId(a.id)}
                  >
                    Select
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {assignmentId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Submit Update for {assignmentId}</CardTitle>
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
