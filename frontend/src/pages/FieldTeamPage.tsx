import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Select } from './ui/select'
import { teams } from '../lib/teams'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'

const TEAM_STATUSES = ['ACTIVE', 'DEPLOYED', 'UNAVAILABLE', 'MAINTENANCE']

export function TeamStatusPage() {
  const queryClient = useQueryClient()
  const [statusError, setStatusError] = useState('')

  const { data: team, isLoading, error } = useQuery({
    queryKey: ['teams', 'me'],
    queryFn: () => teams.myTeam(),
  })

  const statusMutation = useMutation({
    mutationFn: (status: string) => teams.updateStatus(team!.id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teams', 'me'] }),
    onError: (err: Error) => setStatusError(err.message),
  })

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <PageHeader title="My Team" />
        <LoadingState label="Loading team…" className="justify-center py-16" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <PageHeader title="My Team" />
        <ErrorState title="Failed to load team" description={(error as Error).message} />
      </div>
    )
  }

  if (!team) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <PageHeader title="My Team" />
        <EmptyState title="No team is assigned to you." description="A disaster coordinator assigns field teams. Contact your coordinator if you believe this is incorrect." />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <PageHeader title="My Team" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            {team.name}
            <StatusBadge status={team.status} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Leader</p>
              <p className="font-medium break-words">{team.leader.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Team ID</p>
              <p className="font-mono text-xs break-all">{team.id}</p>
            </div>
          </div>

          <div>
            <p className="text-sm text-muted-foreground mb-1">Update Status</p>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={team.status}
                onChange={(e) => statusMutation.mutate(e.target.value)}
                disabled={statusMutation.isPending}
                aria-label="Update Status"
                className="w-full sm:w-48"
                data-testid="my-team-status"
              >
                {TEAM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
              {statusMutation.isPending && <span className="text-xs text-muted-foreground">Saving...</span>}
              {statusError && <p className="text-xs text-status-error" role="alert">Failed to update status: {statusError}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team Members ({team.members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {team.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members on your team yet.</p>
          ) : (
            <ul className="divide-y" role="list">
              {team.members.map((m) => (
                <li key={m.id} className="py-2 text-sm">
                  <span className="font-medium">{m.member_name}</span>
                  <span className="text-muted-foreground"> — {m.member_role}</span>
                  {m.contact_reference && <span className="text-muted-foreground"> ({m.contact_reference})</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
