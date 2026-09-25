import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card'
import { Label } from './ui/label'
import { Select } from './ui/select'
import { Textarea } from './ui/textarea'
import { incidents } from '../lib/incidents'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MapPanel } from '../components/MapPanel'
import { useRealtime } from '../hooks/useRealtime'

function severityColor(severity?: string): string {
  switch (severity) {
    case 'CRITICAL': return '#dc2626'
    case 'HIGH': return '#ea580c'
    case 'MEDIUM': return '#ca8a04'
    case 'LOW': return '#2563eb'
    default: return '#6b7280'
  }
}

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
    mutationFn: (payload: { confirmed_severity: string; notes?: string }) =>
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
      confirmed_severity: data.get('confirmed_severity') as string,
      notes: data.get('notes') as string | undefined,
    }
    if (!payload.confirmed_severity) {
      setTriageError('Please select a severity level.')
      return
    }
    triageMutation.mutate(payload)
  }

  if (isLoading) {
    return <div className="text-center py-16 text-muted-foreground" role="status">Loading incident...</div>
  }

  if (error) {
    return (
      <div className="text-center py-16 text-destructive" role="alert">
        {(error as Error).message || 'Failed to load incident'}
      </div>
    )
  }

  if (!data) return null

  const incident = data
  const severity = incident.confirmed_severity || incident.predicted_severity
  const hasLocation = incident.latitude != null && incident.longitude != null

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{incident.id}</CardTitle>
              <CardDescription>{incident.disaster_type}</CardDescription>
            </div>
            <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">{incident.status}</span>
          </div>
          {isCoordinator && (
            <div className="flex items-center gap-2 mt-2 bg-amber-50 text-amber-800 rounded-md px-3 py-2 text-sm" role="status">
              Severity prediction is unavailable — manual triage determines the operational response.
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
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
              <p>
                {severity ? (
                  <span className="px-2 py-0.5 rounded-full text-white text-xs" style={{ backgroundColor: severityColor(severity) }}>{severity}</span>
                ) : (
                  <span className="text-muted-foreground">Not set</span>
                )}
              </p>
            </div>
          </div>

          {hasLocation && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Location</p>
              <MapPanel
                center={[incident.latitude as number, incident.longitude as number]}
                zoom={13}
                markers={[{ id: incident.id, lat: incident.latitude as number, lng: incident.longitude as number, label: incident.id, severity, status: incident.status }]}
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