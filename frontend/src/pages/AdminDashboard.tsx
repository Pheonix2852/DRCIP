import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { admin } from '../lib/admin'
import { useAuth } from '../contexts/AuthContext'

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}

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
        <h1 className="text-xl font-semibold">Admin Dashboard</h1>
        <div className="text-center py-16 text-muted-foreground" role="status">Loading dashboard...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <h1 className="text-xl font-semibold">Admin Dashboard</h1>
        <div className="text-center py-16 text-destructive text-sm" role="alert">
          {(error as Error).message || 'Failed to load dashboard data'}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <h1 className="text-xl font-semibold">Admin Dashboard</h1>
        <div className="text-center py-16 text-muted-foreground">No data available.</div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold">Admin Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active Users" value={data.users.active} />
        <StatCard label="Total Users" value={data.users.total} />
        <StatCard label="Open Incidents" value={data.incidents.total} />
        <StatCard label="Active Teams" value={data.teams.active} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">User Roles</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(data.users.by_role).length === 0 ? (
              <p className="text-sm text-muted-foreground">No user data.</p>
            ) : (
              <ul className="space-y-2" role="list">
                {Object.entries(data.users.by_role).map(([role, count]) => (
                  <li key={role} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{role}</span>
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{count}</span>
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
            {data.health.status === 'ok' ? (
              <p className="text-sm">
                <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 mr-2">Healthy</span>
                <span className="text-muted-foreground text-xs">as of {new Date(data.health.timestamp).toLocaleTimeString()}</span>
              </p>
            ) : (
              <p className="text-sm">
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 mr-2">Unhealthy</span>
              </p>
            )}
            <Link to="/admin/health" className="text-xs text-primary hover:underline mt-2 inline-block">View system health</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">RAG Document Approval</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm px-3 py-2 rounded bg-amber-50 text-amber-800" role="status">
              RAG implementation is deferred.
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {data.rag.documents_total} document(s) indexed · {data.rag.documents_pending_approval} pending approval
            </p>
            <Link to="/admin/rag" className="text-xs text-primary hover:underline mt-2 inline-block">Open RAG Assistant</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuration Status</CardTitle>
          </CardHeader>
          <CardContent>
            {data.configuration.status === 'ok' ? (
              <p className="text-sm">
                <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 mr-2">Ready</span>
                <span className="text-muted-foreground text-xs">{data.configuration.message}</span>
              </p>
            ) : (
              <p className="text-sm">
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 mr-2">Incomplete</span>
                <span className="text-muted-foreground text-xs">{data.configuration.message}</span>
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Recent Audit Activity</CardTitle>
          <Link to="/admin/audit" className="text-xs text-primary hover:underline">View full audit log</Link>
        </CardHeader>
        <CardContent>
          {data.recent_audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit events yet.</p>
          ) : (
            <ul className="divide-y" role="list">
              {data.recent_audit.map((a) => (
                <li key={a.id} className="py-2 text-sm flex items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{a.actor_name}</span>
                    <span className="text-muted-foreground"> · {a.action}</span>
                    <span className="text-muted-foreground text-xs"> · {a.entity_type}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{new Date(a.occurred_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}