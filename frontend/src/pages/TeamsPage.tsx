import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { teams, canManageTeams, type TeamSummary, type CreateTeamRequest, type UpdateTeamRequest } from '../lib/teams'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

const TEAM_STATUSES = ['ACTIVE', 'DEPLOYED', 'UNAVAILABLE', 'MAINTENANCE']
const PAGE_SIZE = 20

interface UserSummary {
  id: string
  name: string
  email: string
  role: string
  is_active: boolean
}

function statusColor(status: string): string {
  switch (status) {
    case 'ACTIVE': return 'bg-green-100 text-green-800'
    case 'DEPLOYED': return 'bg-blue-100 text-blue-800'
    case 'UNAVAILABLE': return 'bg-red-100 text-red-800'
    case 'MAINTENANCE': return 'bg-amber-100 text-amber-800'
    default: return 'bg-gray-100 text-gray-700'
  }
}

export function TeamsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const canManage = canManageTeams(user?.role)

  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<TeamSummary | null>(null)
  const [name, setName] = useState('')
  const [leaderUserId, setLeaderUserId] = useState('')
  const [formError, setFormError] = useState('')

  const [memberTeam, setMemberTeam] = useState<TeamSummary | null>(null)
  const [memberName, setMemberName] = useState('')
  const [memberRole, setMemberRole] = useState('')
  const [memberContact, setMemberContact] = useState('')

  const params = useMemo(() => ({
    page,
    limit: PAGE_SIZE,
    ...(statusFilter && { status: statusFilter }),
    ...(search.trim() && { search: search.trim() }),
  }), [page, statusFilter, search])

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['teams', params],
    queryFn: () => teams.list(params),
    placeholderData: (prev) => prev,
  })

  // Eligible Field Officer leaders come from the role-scoped leader-candidates
  // endpoint (Coordinator + Admin). It excludes officers already leading a team
  // and keeps the current leader selectable when editing (exclude_team_id).
  const { data: leaderCandidates, isLoading: loadingCandidates } = useQuery({
    queryKey: ['teams', 'leader-candidates', editing?.id ?? null],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/leader-candidates', { params: editing ? { exclude_team_id: editing.id } : {} })
      return (res.data?.data ?? []) as UserSummary[]
    },
    enabled: formOpen && !editing ? true : false,
    placeholderData: (prev) => prev,
  })

  // When editing, the current leader must remain selectable.
  const availableOfficers = editing
    ? [...(leaderCandidates ?? []), ...(editing.leader ? [{ id: editing.leader.id, name: editing.leader.name, role: 'FIELD_OFFICER' as const, is_active: true }] : [])]
    : leaderCandidates ?? []

  useEffect(() => {
    const onFocus = () => { refetch() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refetch])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['teams'] })

  const createMutation = useMutation({
    mutationFn: (data: CreateTeamRequest) => teams.create(data),
    onSuccess: () => { invalidate(); closeForm() },
    onError: (err: Error) => setFormError(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTeamRequest }) => teams.update(id, data),
    onSuccess: () => { invalidate(); closeForm() },
    onError: (err: Error) => setFormError(err.message),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => teams.updateStatus(id, status),
    onSuccess: invalidate,
  })

  const memberMutation = useMutation({
    mutationFn: ({ id, name: n, role, contact }: { id: string; name: string; role: string; contact?: string }) =>
      teams.addMember(id, { member_name: n, member_role: role, contact_reference: contact }),
    onSuccess: () => { invalidate(); setMemberName(''); setMemberRole(''); setMemberContact('') },
  })

  const items: TeamSummary[] = data?.items ?? []

  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
    setName('')
    setLeaderUserId('')
    setFormError('')
  }

  const openCreate = () => {
    setEditing(null)
    setName('')
    setLeaderUserId('')
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (t: TeamSummary) => {
    setEditing(t)
    setName(t.name)
    setLeaderUserId(t.leader.id)
    setFormError('')
    setFormOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!name.trim()) { setFormError('Team name is required'); return }
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: { name: name.trim() } })
    } else {
      if (!leaderUserId.trim()) { setFormError('Leader is required'); return }
      createMutation.mutate({ name: name.trim(), leader_user_id: leaderUserId.trim() })
    }
  }

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault()
    if (!memberTeam) return
    if (!memberName.trim() || !memberRole.trim()) return
    memberMutation.mutate({
      id: memberTeam.id,
      name: memberName.trim(),
      role: memberRole.trim(),
      contact: memberContact.trim() || undefined,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Field Team Management</h1>
        {canManage && <Button size="sm" onClick={openCreate} data-testid="create-team-btn">New Team</Button>}
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Input placeholder="Search team or leader..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} data-testid="team-search" />
            <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} aria-label="Filter by team status">
              <option value="">All statuses</option>
              {TEAM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Teams ({data?.pagination?.total ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground" role="status">Loading teams...</div>
          ) : error ? (
            <div className="text-center py-12 text-destructive text-sm">{(error as Error).message || 'Failed to load teams'}</div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No teams found.</div>
          ) : (
            <ul className="divide-y" role="list">
              {items.map((t) => (
                <li key={t.id} className="py-3">
                  <div className="drcip-dense-row">
                    <div className="drcip-dense-row-content">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm break-all">{t.id}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${statusColor(t.status)}`}>{t.status}</span>
                      </div>
                      <p className="text-sm mt-1 break-words">{t.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 break-words">
                        Leader: {t.leader.name} ({t.leader.id}) | Members: {t.members.length}
                      </p>
                    </div>
                    <div className="drcip-dense-row-actions">
                      {canManage && (
                        <>
                          <Select
                            value={t.status}
                            onChange={(e) => statusMutation.mutate({ id: t.id, status: e.target.value })}
                            aria-label={`Update ${t.id} status`}
                            className="w-full sm:w-36"
                            data-testid={`status-${t.id}`}
                          >
                            {TEAM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </Select>
                          <Button variant="outline" size="sm" onClick={() => openEdit(t)} data-testid={`edit-${t.id}`}>Edit</Button>
                          <Button variant="outline" size="sm" onClick={() => setMemberTeam(t)} data-testid={`members-${t.id}`}>Members</Button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {data && data.pagination.total_pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
              <span className="text-sm text-muted-foreground">Page {data.pagination.page} of {data.pagination.total_pages}</span>
              <Button variant="outline" size="sm" disabled={page >= data.pagination.total_pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={closeForm}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{editing ? `Edit ${editing.id}` : 'Create Team'}</h2>
            {formError && <div className="mb-3 p-2 rounded bg-red-50 text-red-700 text-sm" role="alert">{formError}</div>}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Team Name</label>
                <Input required value={name} onChange={(e) => setName(e.target.value)} data-testid="team-name" />
              </div>
              {!editing && (
                <div>
                  <label className="block text-sm font-medium mb-1">Leader (Field Officer)</label>
                  <Select value={leaderUserId} onChange={(e) => setLeaderUserId(e.target.value)} data-testid="team-leader">
                    <option value="">
                      {loadingCandidates ? 'Loading candidates...' : 'Select a Field Officer...'}
                    </option>
                    {availableOfficers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.id})</option>
                    ))}
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Officers already leading another team are excluded. The server validates the leader.
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="team-submit">
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editing ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {memberTeam && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setMemberTeam(null)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">Members — {memberTeam.id}</h2>
            <ul className="divide-y mb-4" role="list">
              {memberTeam.members.length === 0 && <li className="py-2 text-sm text-muted-foreground">No members yet.</li>}
              {memberTeam.members.map((m) => (
                <li key={m.id} className="py-2 text-sm">
                  <span className="font-medium">{m.member_name}</span>
                  <span className="text-muted-foreground"> — {m.member_role}</span>
                  {m.contact_reference && <span className="text-muted-foreground"> ({m.contact_reference})</span>}
                </li>
              ))}
            </ul>
            <form onSubmit={handleAddMember} className="space-y-2 border-t pt-3">
              <Input placeholder="Member name" value={memberName} onChange={(e) => setMemberName(e.target.value)} data-testid="member-name" />
              <Input placeholder="Member role" value={memberRole} onChange={(e) => setMemberRole(e.target.value)} data-testid="member-role" />
              <Input placeholder="Contact (optional)" value={memberContact} onChange={(e) => setMemberContact(e.target.value)} data-testid="member-contact" />
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setMemberTeam(null)}>Close</Button>
                <Button type="submit" disabled={memberMutation.isPending} data-testid="member-submit">Add Member</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
