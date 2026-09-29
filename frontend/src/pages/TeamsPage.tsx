import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { teams, canManageTeams, type TeamSummary, type CreateTeamRequest, type UpdateTeamRequest } from '../lib/teams'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'

const TEAM_STATUSES = ['ACTIVE', 'DEPLOYED', 'UNAVAILABLE', 'MAINTENANCE']
const PAGE_SIZE = 20

interface UserSummary {
  id: string
  name: string
  email: string
  role: string
  is_active: boolean
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
  const [actionError, setActionError] = useState('')

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
    onError: (err: Error) => setActionError(err.message),
  })

  const memberMutation = useMutation({
    mutationFn: ({ id, name: n, role, contact }: { id: string; name: string; role: string; contact?: string }) =>
      teams.addMember(id, { member_name: n, member_role: role, contact_reference: contact }),
    onSuccess: () => { invalidate(); setMemberName(''); setMemberRole(''); setMemberContact('') },
    onError: (err: Error) => setActionError(err.message),
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
      <PageHeader
        title="Field Team Management"
        actions={canManage && <Button size="sm" onClick={openCreate} data-testid="create-team-btn">New Team</Button>}
      />

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Input aria-label="Search team or leader" placeholder="Search team or leader..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} data-testid="team-search" />
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
          {actionError && <p className="text-sm text-status-error" role="alert">Failed to update team: {actionError}</p>}
          {isLoading ? (
            <LoadingState label="Loading teams…" className="justify-center py-12" />
          ) : error ? (
            <ErrorState
              title="Failed to load teams"
              description={(error as Error).message}
              retry={() => refetch()}
            />
          ) : items.length === 0 ? (
            <EmptyState title="No teams found." description="No field teams match the current filters." />
          ) : (
            <ul className="divide-y" role="list">
              {items.map((t) => (
                <li key={t.id} className="py-3">
                  <div className="drcip-dense-row">
                    <div className="drcip-dense-row-content">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm break-all">{t.id}</span>
                        <StatusBadge status={t.status} />
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

      <Dialog open={formOpen} onOpenChange={(open) => open ? setFormOpen(true) : closeForm()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.id}` : 'Create Team'}</DialogTitle>
          </DialogHeader>
          {formError && <div className="p-2 rounded-drcip-md bg-destructive/10 text-destructive text-sm" role="alert">{formError}</div>}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="team-form-name" className="block text-sm font-medium mb-1">Team Name</label>
              <Input id="team-form-name" required value={name} onChange={(e) => setName(e.target.value)} data-testid="team-name" />
            </div>
            {!editing && (
              <div>
                <label htmlFor="team-form-leader" className="block text-sm font-medium mb-1">Leader (Field Officer)</label>
                <Select id="team-form-leader" value={leaderUserId} onChange={(e) => setLeaderUserId(e.target.value)} data-testid="team-leader">
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
        </DialogContent>
      </Dialog>

      <Dialog open={!!memberTeam} onOpenChange={(open) => { if (!open) setMemberTeam(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Members — {memberTeam?.id}</DialogTitle>
          </DialogHeader>
          <ul className="divide-y mb-4" role="list">
            {memberTeam?.members.length === 0 && <li className="py-2 text-sm text-muted-foreground">No members yet.</li>}
            {memberTeam?.members.map((m) => (
              <li key={m.id} className="py-2 text-sm">
                <span className="font-medium">{m.member_name}</span>
                <span className="text-muted-foreground"> — {m.member_role}</span>
                {m.contact_reference && <span className="text-muted-foreground"> ({m.contact_reference})</span>}
              </li>
            ))}
          </ul>
          <form onSubmit={handleAddMember} className="space-y-2 border-t pt-3">
            <Input aria-label="Member name" placeholder="Member name" value={memberName} onChange={(e) => setMemberName(e.target.value)} data-testid="member-name" />
            <Input aria-label="Member role" placeholder="Member role" value={memberRole} onChange={(e) => setMemberRole(e.target.value)} data-testid="member-role" />
            <Input aria-label="Contact (optional)" placeholder="Contact (optional)" value={memberContact} onChange={(e) => setMemberContact(e.target.value)} data-testid="member-contact" />
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setMemberTeam(null)}>Close</Button>
              <Button type="submit" disabled={memberMutation.isPending} data-testid="member-submit">Add Member</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
