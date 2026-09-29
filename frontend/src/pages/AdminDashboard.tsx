import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { PageHeader } from '../components/PageHeader'
import { KpiCard } from '../components/KpiCard'
import { admin } from '../lib/admin'
import { useAuth } from '../contexts/AuthContext'

export function AdminDashboard() {
  const { user } = useAuth()
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => admin.overview(),
    enabled: user?.role === 'ADMINISTRATOR',
  })

  if (!user || user.role !== 'ADMINISTRATOR') {
    return (
      <div className="max-w-6xl mx-auto text-center py-16 text-destructive text-sm" role="alert">
        Access denied. Administrator privileges are required.
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <PageHeader title="Admin Dashboard" />
        <LoadingState label="Loading dashboard…" className="justify-center py-16" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <PageHeader title="Admin Dashboard" />
        <ErrorState
          title="Failed to load dashboard data"
          description={(error as Error).message}
        />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <PageHeader title="Admin Dashboard" />
        <EmptyState title="No data available." description="The dashboard overview returned no metrics." />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader title="Admin Dashboard" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Active Users" value={data.users.active} />
        <KpiCard label="Total Users" value={data.users.total} />
        <KpiCard label="Open Incidents" value={data.incidents.total} />
        <KpiCard label="Active Teams" value={data.teams.active} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">User Roles</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(data.users.by_role).length === 0 ? (
              <p className="text-sm text-muted">No user data.</p>
            ) : (
              <ul className="space-y-2" role="list">
                {Object.entries(data.users.by_role).map(([role, count]) => (
                  <li key={role} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{role}</span>
                    <span className="px-2 py-0.5 rounded-drcip-md bg-surface-cool text-text-secondary text-xs tabular-nums">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Services / Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <StatusBadge status={data.health.status === 'ok' ? 'ACTIVE' : 'UNAVAILABLE'} />
              <span className="text-xs text-muted">as of {new Date(data.health.timestamp).toLocaleTimeString()}</span>
            </div>
            <Link to="/admin/health" className="inline-block py-1 text-xs text-primary hover:underline">View system health</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">RAG Document Approval</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm px-3 py-2 rounded-drcip-md bg-status-warning/10 text-status-warning" role="status">
              RAG implementation is deferred.
            </div>
            <p className="text-xs text-muted mt-2">
              {data.rag.documents_total} document(s) indexed · {data.rag.documents_pending_approval} pending approval
            </p>
            <Link to="/admin/rag" className="inline-block py-1 text-xs text-primary hover:underline">Open RAG Assistant</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuration Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <StatusBadge status={data.configuration.status === 'ok' ? 'ACTIVE' : 'WARNING'} label={data.configuration.status === 'ok' ? 'Ready' : 'Incomplete'} />
              <span className="text-xs text-muted">{data.configuration.message}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Recent Audit Activity</CardTitle>
          <Link to="/admin/audit" className="inline-block py-1 text-xs text-primary hover:underline">View full audit log</Link>
        </CardHeader>
        <CardContent>
          {data.recent_audit.length === 0 ? (
            <p className="text-sm text-muted">No audit events yet.</p>
          ) : (
            <ul className="divide-y divide-border" role="list">
              {data.recent_audit.map((a) => (
                <li key={a.id} className="py-2 text-sm flex items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{a.actor_name}</span>
                    <span className="text-muted"> · {a.action}</span>
                    <span className="text-xs text-muted"> · {a.entity_type}</span>
                  </span>
                  <span className="text-xs text-muted">{new Date(a.occurred_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}