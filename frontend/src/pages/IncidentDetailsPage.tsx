import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Label } from './ui/label'
import { Select } from './ui/select'
import { Textarea } from './ui/textarea'
import { incidents } from '../lib/incidents'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MapPanel } from '../components/MapPanel'
import { useRealtime } from '../hooks/useRealtime'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { SeverityBadge } from '../components/SeverityBadge'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import type { SeverityLevel } from '@drcip/contracts'

export function IncidentDetailsPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  useRealtime()
  const [triageError, setTriageError] = useState<string | null>(null)
  const [showTriage, setShowTriage] = useState(false)

  const isCoordinator = user?.role === 'DISASTER_COORDINATOR' || user?.role === 'ADMINISTRATOR'

  const { data, isLoading, error } = useQuery({
    queryKey: ['incident', id],
    queryFn: () => incidents.detail(id!),
    enabled: !!id,
  })

  const triageMutation = useMutation({
    mutationFn: (payload: { confirmed_severity: SeverityLevel; notes?: string }) =>
      incidents.triage(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] })
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      setTriageError(null)
      setShowTriage(false)
    },
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) => {
      setTriageError(err.response?.data?.error?.message || 'Triage failed')
    },
  })

  const handleTriageSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const data = new FormData(form)
    const payload = {
      confirmed_severity: data.get('confirmed_severity') as SeverityLevel,
      notes: data.get('notes') as string | undefined,
    }
    if (!payload.confirmed_severity) {
      setTriageError('Please select a severity level.')
      return
    }
    triageMutation.mutate(payload)
  }

  if (isLoading) {
    return <LoadingState label="Loading incident…" className="justify-center py-16" />
  }

  if (error) {
    return <ErrorState title="Failed to load incident" description={(error as Error).message} />
  }

  if (!data) {
    return <ErrorState title="Incident not found" description={`No incident matches ${id}. It may have been removed or the link is invalid.`} />
  }

  const incident = data
  const prediction = incident.latest_prediction
  const predictionSuccess = prediction?.status === 'SUCCESS' && prediction.severity
  const hasLocation = incident.latitude != null && incident.longitude != null

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <PageHeader
        title={incident.id}
        description={incident.disaster_type}
        actions={<StatusBadge status={incident.status} />}
      />

      {isCoordinator && (
        predictionSuccess ? (
          <div className="flex items-center gap-2 bg-status-success/10 text-status-success rounded-drcip-md px-3 py-2 text-sm" role="status">
            AI severity prediction: <strong data-testid="predicted-severity">{prediction.severity}</strong>
            {prediction.confidence && <span> ({(parseFloat(prediction.confidence) * 100).toFixed(0)}% confidence)</span>}
            <span> — review and confirm via manual triage.</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-status-warning/10 text-status-warning rounded-drcip-md px-3 py-2 text-sm" role="status">
            Severity prediction is temporarily unavailable. You can manually triage this incident.
          </div>
        )
      )}

      <Card>
        <CardContent className="space-y-4 pt-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Description</p>
            <p>{incident.description}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">People Affected</p>
              <p>{incident.people_affected}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Reported</p>
              <p>{new Date(incident.created_at).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Emergency Contact</p>
              <p>{incident.emergency_contact_number || '—'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Severity</p>
              <div className="space-y-1">
                <p>
                  <span className="text-xs text-muted-foreground mr-1">Confirmed:</span>
                  {incident.confirmed_severity ? (
                    <SeverityBadge severity={incident.confirmed_severity} />
                  ) : (
                    <span className="text-muted-foreground text-xs">Not triaged</span>
                  )}
                </p>
                <p>
                  <span className="text-xs text-muted-foreground mr-1">Predicted:</span>
                  {predictionSuccess ? (
                    <SeverityBadge severity={prediction.severity!} />
                  ) : (
                    <span className="text-muted-foreground text-xs">N/A</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {hasLocation && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Location</p>
              <MapPanel
                center={[incident.latitude as number, incident.longitude as number]}
                zoom={13}
                markers={[{ id: incident.id, lat: incident.latitude as number, lng: incident.longitude as number, label: incident.id, severity: incident.confirmed_severity || prediction?.severity, status: incident.status }]}
                height="h-64"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {incident.latitude?.toFixed(5)}, {incident.longitude?.toFixed(5)}
                {incident.district ? ` \u00B7 ${incident.district}, ${incident.state ?? ''}` : ''}
              </p>
            </div>
          )}

          {incident.media && incident.media.length > 0 && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Media</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {incident.media.map((m) => (
                  <a key={m.id} href={m.secure_url} target="_blank" rel="noopener noreferrer" className="rounded-md overflow-hidden border block">
                    {m.media_type === 'VIDEO' ? (
                      <video src={m.secure_url} className="w-full h-28 object-cover bg-black" controls />
                    ) : (
                      <img src={m.secure_url} alt={`Incident media ${m.id}`} className="w-full h-28 object-cover" />
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}

          {isCoordinator && (
            <div className="pt-2 border-t">
              <div className="flex flex-wrap gap-2 mb-2">
                <Link to={`/incidents/${incident.id}/review`}>
                  <Button>Manual Assignment</Button>
                </Link>
              </div>
              {!showTriage ? (
                <Button onClick={() => setShowTriage(true)}>Triage Incident</Button>
              ) : (
                <form onSubmit={handleTriageSubmit} className="space-y-3">
                  {triageError && <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm" role="alert">{triageError}</div>}
                  <div className="space-y-2">
                    <Label htmlFor="confirmed_severity">Confirmed Severity</Label>
                    <Select id="confirmed_severity" name="confirmed_severity" required>
                      <option value="">Select severity</option>
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="CRITICAL">CRITICAL</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes (optional)</Label>
                    <Textarea id="notes" name="notes" rows={2} placeholder="Triage notes..." />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={triageMutation.isPending}>{triageMutation.isPending ? 'Submitting...' : 'Save Triage'}</Button>
                    <Button type="button" variant="outline" onClick={() => setShowTriage(false)}>Cancel</Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
