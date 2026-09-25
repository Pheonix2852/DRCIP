import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Select } from './ui/select'
import { teams } from '../lib/teams'

const TEAM_STATUSES = ['ACTIVE', 'DEPLOYED', 'UNAVAILABLE', 'MAINTENANCE']

function statusColor(status: string): string {
  switch (status) {
    case 'ACTIVE': return 'bg-green-100 text-green-800'
    case 'DEPLOYED': return 'bg-blue-100 text-blue-800'
    case 'UNAVAILABLE': return 'bg-red-100 text-red-800'
    case 'MAINTENANCE': return 'bg-amber-100 text-amber-800'
    default: return 'bg-gray-100 text-gray-700'
  }
}

export function TeamStatusPage() {
  const queryClient = useQueryClient()

  const { data: team, isLoading, error } = useQuery({
    queryKey: ['teams', 'me'],
    queryFn: () => teams.myTeam(),
  })

  const statusMutation = useMutation({
    mutationFn: (status: string) => teams.updateStatus(team!.id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teams', 'me'] }),
  })

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-xl font-semibold">My Team</h1>
        <div className="text-center py-16 text-muted-foreground" role="status">Loading team...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-xl font-semibold">My Team</h1>
        <div className="text-center py-16 text-destructive text-sm">{(error as Error).message || 'Failed to load team'}</div>
      </div>
    )
  }

  if (!team) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-xl font-semibold">My Team</h1>
        <div className="text-center py-16 text-muted-foreground">No team is assigned to you.</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">My Team</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {team.name}
            <span className={`px-2 py-0.5 rounded-full text-xs ${statusColor(team.status)}`}>{team.status}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Leader</p>
              <p className="font-medium">{team.leader.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Team ID</p>
              <p className="font-mono text-xs">{team.id}</p>
            </div>
          </div>

          <div>
            <p className="text-sm text-muted-foreground mb-1">Update Status</p>
            <div className="flex items-center gap-2">
              <Select
                value={team.status}
                onChange={(e) => statusMutation.mutate(e.target.value)}
                disabled={statusMutation.isPending}
                className="w-48"
                data-testid="my-team-status"
              >
                {TEAM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
              {statusMutation.isPending && <span className="text-xs text-muted-foreground">Saving...</span>}
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
