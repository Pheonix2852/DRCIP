import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Button } from './ui/button'
import { teams } from '../lib/teams'
import { assignments } from '../lib/assignments'
import { useRealtime } from '../hooks/useRealtime'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { UnavailableState } from '../components/UnavailableState'

export function FieldOperationsDashboard() {
  useRealtime()
  const { wsStatus } = useAuth()

  const teamQuery = useQuery({
    queryKey: ['teams', 'me'],
    queryFn: () => teams.myTeam(),
  })

  const assignmentsQuery = useQuery({
    queryKey: ['assignments', 'me'],
    queryFn: () => assignments.myAssignments({ limit: 20 }),
  })

  const team = teamQuery.data
  const items = assignmentsQuery.data?.items ?? []
  const activeAssignment = items.find((a) => a.status === 'ASSIGNED' || a.status === 'IN_PROGRESS') ?? null

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeader title="Field Operations Dashboard" className="mb-0" />
        <Link to="/field/update">
          <Button variant="outline" size="sm">Status Update</Button>
        </Link>
      </div>

      {(wsStatus === 'closed' || wsStatus === 'reconnecting') && (
        <UnavailableState
          tone="degraded"
          title={wsStatus === 'reconnecting' ? 'Realtime reconnecting…' : 'Realtime unavailable — updates will be fetched'}
          description="Team and assignment data below is from the last successful fetch. It may be out of date until the connection recovers."
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">My Team</CardTitle>
            </CardHeader>
            <CardContent>
              {teamQuery.isLoading ? (
                <LoadingState label="Loading team…" className="justify-center py-8" />
              ) : teamQuery.error ? (
                <ErrorState title="Failed to load team" description={(teamQuery.error as Error).message} />
              ) : !team ? (
                <EmptyState title="No team is assigned to you." description="A disaster coordinator assigns field teams. Contact your coordinator if you believe this is incorrect." />
              ) : (
                <Link to="/field/team" className="block hover:bg-muted/50 rounded-md p-2 -m-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-medium min-w-0 break-words">{team.name}</span>
                    <StatusBadge status={team.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Leader: {team.leader.name} · {team.members.length} members</p>
                </Link>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Active Assignment</CardTitle>
              <Link to="/field/assignments" className="text-xs text-primary hover:underline">View all</Link>
            </CardHeader>
            <CardContent>
              {assignmentsQuery.isLoading ? (
                <LoadingState label="Loading assignments…" className="justify-center py-8" />
              ) : assignmentsQuery.error ? (
                <ErrorState title="Failed to load assignments" description={(assignmentsQuery.error as Error).message} />
              ) : !activeAssignment ? (
                <EmptyState
                  title="No active assignment."
                  description="Use Field Update when you begin a task."
                />
              ) : (
                <div className="space-y-2">
                  <Link to="/field/update" className="block hover:bg-muted/50 rounded-md p-2 -m-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{activeAssignment.id}</span>
                      <StatusBadge status={activeAssignment.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Incident: <span className="font-mono">{activeAssignment.incident_id}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {activeAssignment.items.length} item(s) · assigned {new Date(activeAssignment.assigned_at).toLocaleString()}
                    </p>
                    {activeAssignment.notes && <p className="text-xs text-muted-foreground mt-0.5">{activeAssignment.notes}</p>}
                  </Link>
                  <Link to="/field/update">
                    <Button size="sm" className="w-full">Submit Field Update</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">All My Assignments</CardTitle>
              <Link to="/field/assignments" className="text-xs text-primary hover:underline">Manage</Link>
            </CardHeader>
            <CardContent>
              {assignmentsQuery.isLoading ? (
                <div className="text-center py-8 text-muted-foreground" role="status">Loading...</div>
              ) : assignmentsQuery.error ? (
                <div className="text-sm text-destructive" role="alert">
                  {(assignmentsQuery.error as Error).message || 'Failed to load assignments'}
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No assignments yet.</div>
              ) : (
                <ul className="divide-y" role="list">
                  {items.slice(0, 5).map((a) => (
                    <li key={a.id} className="py-2 text-sm">
                    <div className="drcip-dense-row">
                      <div className="drcip-dense-row-content">
                        <Link to="/field/update" className="hover:underline break-all">
                          <span className="font-medium">{a.id}</span>
                        </Link>
                      </div>
                      <div className="drcip-dense-row-actions">
                        <StatusBadge status={a.status} />
                      </div>
                    </div>
                  </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notifications</CardTitle>
              </CardHeader>
              <CardContent>
                <Link to="/notifications" className="inline-block">
                  <Button variant="outline" size="sm">View Notifications</Button>
                </Link>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">RAG Assistant</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-2">Disaster intelligence (deferred).</p>
                <Link to="/rag" className="inline-block">
                  <Button variant="outline" size="sm">Open RAG</Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
