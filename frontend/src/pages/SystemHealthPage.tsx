import { useState, useEffect } from 'react'
import api from '../lib/api'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Button } from './ui/button'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { LoadingState } from '../components/LoadingState'

interface HealthState {
  status: string
  database: string
  timestamp: string
}

export function SystemHealthPage() {
  const [health, setHealth] = useState<HealthState | null>(null)
  const [version, setVersion] = useState<{ service: string; version: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const check = async () => {
    setLoading(true)
    setError(null)
    const [healthRes, versionRes] = await Promise.allSettled([
      api.get('/health'),
      api.get('/health/version'),
    ])
    if (healthRes.status === 'fulfilled') {
      setHealth(healthRes.value.data)
    } else {
      const reason = healthRes.reason as { response?: { data?: HealthState }; message?: string }
      if (reason.response?.data) {
        // A 503 still carries the JSON health payload.
        setHealth(reason.response.data)
      } else {
        setError(reason.message || 'Unable to reach the backend health endpoint')
      }
    }
    if (versionRes.status === 'fulfilled') {
      setVersion(versionRes.value.data)
    }
    setLoading(false)
  }

  useEffect(() => { check() }, [])

  const healthy = health?.status === 'healthy'

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <PageHeader title="System Health" />

      {loading && (
        <LoadingState label="Checking system health…" className="justify-center py-16" />
      )}

      {error && !health && (
        <div className="text-sm px-3 py-2 rounded bg-destructive/10 text-destructive" role="alert">{error}</div>
      )}

      {health && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Backend Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <StatusBadge status={healthy ? 'HEALTHY' : 'UNHEALTHY'} />
              <span className="text-sm text-muted-foreground">database {health.database}</span>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-muted-foreground">Backend Version</dt>
              <dd className="font-medium">{version ? `${version.service} ${version.version}` : '—'}</dd>
              <dt className="text-muted-foreground">Response Time</dt>
              <dd className="font-medium">{new Date(health.timestamp).toLocaleTimeString()}</dd>
            </dl>
          </CardContent>
        </Card>
      )}

      <Button variant="outline" size="sm" onClick={check} disabled={loading}>
        {loading ? 'Checking...' : 'Recheck'}
      </Button>
    </div>
  )
}