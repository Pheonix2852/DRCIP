import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { StatusBadge } from '../components/StatusBadge'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { users, canManageUsers, type User, type CreateUserRequest, type UpdateUserRequest } from '../lib/users'
import { useAuth } from '../contexts/AuthContext'

const ROLES = ['CITIZEN', 'FIELD_OFFICER', 'DISASTER_COORDINATOR', 'ADMINISTRATOR']
const PAGE_SIZE = 20

const emptyForm: CreateUserRequest = {
  name: '',
  email: '',
  role: 'CITIZEN',
}

function errorMessage(err: unknown): string {
  const axiosError = err as { response?: { data?: { error?: { message?: string } } } }
  return axiosError.response?.data?.error?.message || (err as Error)?.message || 'Request failed'
}

export function UsersPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [roleFilter, setRoleFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [form, setForm] = useState<CreateUserRequest>(emptyForm)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')

  const params = useMemo(() => ({
    page,
    limit: PAGE_SIZE,
    ...(roleFilter && { role: roleFilter }),
    ...(activeFilter && { active: activeFilter }),
    ...(search.trim() && { search: search.trim() }),
  }), [page, roleFilter, activeFilter, search])

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['users', params],
    queryFn: () => users.list(params),
    placeholderData: (prev) => prev,
  })

  useEffect(() => {
    const onFocus = () => { refetch() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refetch])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] })

  const createMutation = useMutation({
    mutationFn: (data: CreateUserRequest) => users.create(data),
    onSuccess: () => { invalidate(); setFormOpen(false); setForm(emptyForm); setFormError('') },
    onError: (err: Error) => setFormError(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserRequest }) => users.update(id, data),
    onSuccess: () => { invalidate(); setFormOpen(false); setForm(emptyForm); setFormError('') },
    onError: (err: Error) => setFormError(err.message),
  })

  const activateMutation = useMutation({
    mutationFn: (id: string) => users.activate(id),
    onMutate: () => setActionError(''),
    onSuccess: () => { invalidate() },
    onError: (err: Error) => setActionError(errorMessage(err)),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => users.deactivate(id),
    onMutate: () => setActionError(''),
    onSuccess: () => { invalidate() },
    onError: (err: Error) => setActionError(errorMessage(err)),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: { name: form.name, role: form.role } })
    } else {
      createMutation.mutate(form)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (u: User) => {
    setEditing(u)
    setForm({ name: u.name, email: u.email, role: u.role })
    setFormError('')
    setFormOpen(true)
  }

  if (!canManageUsers(user?.role)) {
    return (
      <div>
        <PageHeader title="User Management" />
        <p className="text-sm text-muted-foreground" role="alert">Cannot manage users.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="User Management"
        description="Provision, edit, and activate accounts."
        actions={
          <Button size="sm" onClick={openCreate} data-testid="create-user">Provision User</Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="drcip-filter-group">
            <Input aria-label="Search name or email" placeholder="Search name or email" className="sm:w-56" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} data-testid="user-search" />
            <Select aria-label="Filter by role" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1) }} className="sm:w-48" data-testid="user-role-filter">
              <option value="">All roles</option>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
            <Select aria-label="Filter by account status" value={activeFilter} onChange={(e) => { setActiveFilter(e.target.value); setPage(1) }} className="sm:w-40" data-testid="user-active-filter">
              <option value="">All statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setRoleFilter(''); setActiveFilter(''); setPage(1) }}>Clear filters</Button>
          </div>
        </CardContent>
      </Card>

      {actionError && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm" role="alert" data-testid="action-error">
          {actionError}
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Loading users…" className="justify-center py-16" />
      ) : error ? (
        <ErrorState
          title="Failed to load users"
          description={(error as Error).message}
          retry={() => refetch()}
        />
      ) : !data?.items.length ? (
        <EmptyState title="No users found." description="No accounts match the current filters." />
      ) : (
        <Card>
          <CardContent className="space-y-3">
            {data.items.map((u) => (
              <div key={u.id} className="drcip-dense-row border-b pb-3 last:border-b-0 last:pb-0">
                <div className="drcip-dense-row-content">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{u.name}</span>
                    <StatusBadge status={u.is_active} />
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                  <div className="text-xs text-muted-foreground">Role: {u.role}</div>
                </div>
                <div className="drcip-dense-row-actions">
                  <Button variant="outline" size="sm" onClick={() => openEdit(u)} data-testid="edit-user">Edit</Button>
                  {u.is_active
                    ? <ConfirmDialog
                        trigger={<Button variant="outline" size="sm" data-testid="deactivate-user">Deactivate</Button>}
                        title={`Deactivate ${u.name}?`}
                        description="This will prevent the user from signing in. You can reactivate later."
                        onConfirm={() => deactivateMutation.mutate(u.id)}
                      />
                    : <Button variant="outline" size="sm" onClick={() => activateMutation.mutate(u.id)} data-testid="activate-user">Activate</Button>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data && data.pagination.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Page {data.pagination.page} of {data.pagination.total_pages}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
            <Button variant="outline" size="sm" disabled={page >= data.pagination.total_pages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : 'Provision User'}</DialogTitle>
          </DialogHeader>
          {formError && <div className="p-2 rounded bg-destructive/10 text-destructive text-sm" role="alert">{formError}</div>}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="user-form-name" className="block text-sm font-medium mb-1">Name</label>
              <Input id="user-form-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" data-testid="form-name" />
            </div>
            <div>
              <label htmlFor="user-form-email" className="block text-sm font-medium mb-1">Email</label>
              <Input id="user-form-email" required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@example.com" disabled={!!editing} data-testid="form-email" />
            </div>
            <div>
              <label htmlFor="user-form-role" className="block text-sm font-medium mb-1">Role</label>
              <Select id="user-form-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} data-testid="form-role">
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
            </div>
            {!editing && (
              <p className="text-xs text-muted-foreground">New accounts use the system default password until changed.</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="form-submit">
                {editing ? 'Save Changes' : 'Create User'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default UsersPage