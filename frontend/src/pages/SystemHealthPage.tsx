import { useState, useEffect } from 'react'
import api from '../lib/api'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'

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
    try {
      const [healthRes, versionRes] = await Promise.all([
        api.get('/health'),
        api.get('/health/version'),
      ])
      setHealth(healthRes.data)
      setVersion(versionRes.data)
    } catch (err) {
      const axiosErr = err as { response?: { data?: HealthState }; message?: string }
      if (axiosErr.response?.data) {
        // A 503 still carries the JSON health payload.
        setHealth(axiosErr.response.data)
      } else {
        setError(axiosErr.message || 'Unable to reach the backend health endpoint')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { check() }, [])

  const healthy = health?.status === 'healthy'

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">System Health</h1>

      {loading && (
        <div className="text-center py-16 text-muted-foreground" role="status">Checking system health...</div>
      )}

      {error && !health && (
        <div className="text-sm px-3 py-2 rounded bg-red-50 text-red-800" role="alert">{error}</div>
      )}

      {health && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Backend Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded-full text-sm ${healthy ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                role="status"
              >
                {healthy ? 'Healthy' : 'Unhealthy'}
              </span>
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

      <button
        className="text-sm px-3 py-1.5 rounded-md border border-input bg-background hover:bg-accent"
        onClick={check}
        disabled={loading}
      >
        {loading ? 'Checking...' : 'Recheck'}
      </button>
    </div>
  )
}