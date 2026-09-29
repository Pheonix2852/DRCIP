import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { shelters, canManageShelters, type Shelter, type CreateShelterRequest, type UpdateShelterRequest } from '../lib/shelters'
import { MapPanel } from '../components/MapPanel'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'

const SHELTER_STATUSES = ['AVAILABLE', 'FULL', 'UNAVAILABLE']
const PAGE_SIZE = 20

const emptyForm: CreateShelterRequest = {
  name: '',
  latitude: 0,
  longitude: 0,
  total_capacity: 0,
  current_occupancy: 0,
  status: 'AVAILABLE',
}

export function SheltersPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const canManage = canManageShelters(user?.role)

  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [minCapacity, setMinCapacity] = useState('')
  const [page, setPage] = useState(1)

  const [nearbyLat, setNearbyLat] = useState('')
  const [nearbyLng, setNearbyLng] = useState('')
  const [nearbyRadius, setNearbyRadius] = useState('')
  const [nearbyActive, setNearbyActive] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Shelter | null>(null)
  const [form, setForm] = useState<CreateShelterRequest>(emptyForm)
  const [formError, setFormError] = useState('')

  const params = useMemo(() => ({
    page,
    limit: PAGE_SIZE,
    ...(statusFilter && { status: statusFilter }),
    ...(search.trim() && { search: search.trim() }),
    ...(minCapacity !== '' && { min_available_capacity: Number(minCapacity) }),
    ...(nearbyActive && nearbyLat && nearbyLng && nearbyRadius
      ? { nearby_lat: Number(nearbyLat), nearby_lng: Number(nearbyLng), nearby_radius_km: Number(nearbyRadius) }
      : {}),
  }), [page, statusFilter, search, minCapacity, nearbyActive, nearbyLat, nearbyLng, nearbyRadius])

  const { data, isLoading, error } = useQuery({
    queryKey: ['shelters', params],
    queryFn: () => shelters.list(params),
    placeholderData: (prev) => prev,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['shelters'] })

  const createMutation = useMutation({
    mutationFn: (data: CreateShelterRequest) => shelters.create(data),
    onSuccess: () => { invalidate(); closeForm() },
    onError: (err: Error) => setFormError(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateShelterRequest }) => shelters.update(id, data),
    onSuccess: () => { invalidate(); closeForm() },
    onError: (err: Error) => setFormError(err.message),
  })

  const items: Shelter[] = data?.items ?? []

  const markers = items
    .filter((s) => s.latitude != null && s.longitude != null)
    .map((s) => ({
      id: s.id,
      lat: s.latitude as number,
      lng: s.longitude as number,
      label: s.name || s.id,
      status: s.status,
    }))

  const resetFilters = () => {
    setStatusFilter('')
    setSearch('')
    setMinCapacity('')
    setPage(1)
    setNearbyActive(false)
    setNearbyLat('')
    setNearbyLng('')
    setNearbyRadius('')
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
    setForm(emptyForm)
    setFormError('')
  }

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (s: Shelter) => {
    setEditing(s)
    setForm({
      name: s.name,
      latitude: s.latitude ?? 0,
      longitude: s.longitude ?? 0,
      total_capacity: s.total_capacity,
      current_occupancy: s.current_occupancy,
      status: s.status,
    })
    setFormError('')
    setFormOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim()) { setFormError('Name is required'); return }
    if (form.total_capacity < 0) { setFormError('Capacity must not be negative'); return }
    const occupancy = form.current_occupancy ?? 0
    if (occupancy < 0) { setFormError('Occupancy must not be negative'); return }
    if (occupancy > form.total_capacity) { setFormError('Occupancy cannot exceed capacity'); return }
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: form as UpdateShelterRequest })
    } else {
      createMutation.mutate(form)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Shelter Management"
        actions={canManage && <Button size="sm" onClick={openCreate} data-testid="create-shelter-btn">New Shelter</Button>}
      />

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <Input aria-label="Search shelter name" placeholder="Search name..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} data-testid="shelter-search" />
            <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} aria-label="Filter by shelter status">
              <option value="">All statuses</option>
              {SHELTER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Input aria-label="Minimum available capacity" type="number" min="0" placeholder="Min available capacity" value={minCapacity} onChange={(e) => { setMinCapacity(e.target.value); setPage(1) }} data-testid="min-capacity" />
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={resetFilters}>Clear filters</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <Input aria-label="Latitude for nearby search" placeholder="Lat" type="number" step="any" className="sm:w-24" value={nearbyLat} onChange={(e) => setNearbyLat(e.target.value)} data-testid="nearby-lat" />
            <Input aria-label="Longitude for nearby search" placeholder="Lng" type="number" step="any" className="sm:w-24" value={nearbyLng} onChange={(e) => setNearbyLng(e.target.value)} data-testid="nearby-lng" />
            <Input aria-label="Radius in km for nearby search" placeholder="Radius km" type="number" step="any" className="col-span-2 sm:col-span-1 sm:w-28" value={nearbyRadius} onChange={(e) => setNearbyRadius(e.target.value)} data-testid="nearby-radius" />
            <Button size="sm" variant={nearbyActive ? 'default' : 'outline'} className="col-span-2 sm:col-span-1 sm:w-auto" onClick={() => { setNearbyActive(!nearbyActive); setPage(1) }} data-testid="nearby-toggle">
              {nearbyActive ? 'Nearby On' : 'Nearby Off'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shelters Map</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <LoadingState label="Loading map…" className="justify-center py-16" />
            ) : error ? (
              <ErrorState title="Failed to load shelters" description={(error as Error).message} />
            ) : markers.length === 0 ? (
              <EmptyState title="No shelters with location to display." description="Shelters appear on the map once a location is available." />
            ) : (
              <MapPanel center={[markers[0].lat, markers[0].lng]} zoom={6} markers={markers} height="h-80" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shelters ({data?.pagination?.total ?? 0})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <LoadingState label="Loading shelters…" className="justify-center py-16" />
            ) : error ? (
              <ErrorState title="Failed to load shelters" description={(error as Error).message} />
            ) : items.length === 0 ? (
              <EmptyState
                title="No shelters match the current filters."
                description="Adjust or clear the filters above to see more shelters."
                action={<Button variant="outline" size="sm" onClick={resetFilters}>Clear filters</Button>}
              />
            ) : (
              <ul className="divide-y" role="list">
                {items.map((s) => (
                  <li key={s.id} className="py-3">
                    <div className="drcip-dense-row">
                      <div className="drcip-dense-row-content">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm break-all">{s.name}</span>
                          <StatusBadge status={s.status} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 break-words">
                          {s.id} | Occupancy: {s.current_occupancy}/{s.total_capacity} ({s.total_capacity - s.current_occupancy} available)
                        </p>
                      </div>
                      {canManage && (
                        <div className="drcip-dense-row-actions">
                          <Button variant="outline" size="sm" onClick={() => openEdit(s)} data-testid={`edit-${s.id}`}>Edit</Button>
                        </div>
                      )}
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
      </div>

      <Dialog open={formOpen} onOpenChange={(open) => open ? setFormOpen(true) : closeForm()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.id}` : 'Create Shelter'}</DialogTitle>
          </DialogHeader>
          {formError && <div className="p-2 rounded-drcip-md bg-destructive/10 text-destructive text-sm" role="alert">{formError}</div>}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="shelter-form-name" className="block text-sm font-medium mb-1">Name</label>
              <Input id="shelter-form-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="form-name" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="shelter-form-lat" className="block text-sm font-medium mb-1">Latitude</label>
                <Input id="shelter-form-lat" type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: Number(e.target.value) })} data-testid="form-lat" />
              </div>
              <div>
                <label htmlFor="shelter-form-lng" className="block text-sm font-medium mb-1">Longitude</label>
                <Input id="shelter-form-lng" type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: Number(e.target.value) })} data-testid="form-lng" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="shelter-form-capacity" className="block text-sm font-medium mb-1">Total Capacity</label>
                <Input id="shelter-form-capacity" type="number" min="0" step="1" value={form.total_capacity} onChange={(e) => setForm({ ...form, total_capacity: Number(e.target.value) })} data-testid="form-capacity" />
              </div>
              <div>
                <label htmlFor="shelter-form-occupancy" className="block text-sm font-medium mb-1">Current Occupancy</label>
                <Input id="shelter-form-occupancy" type="number" min="0" step="1" value={form.current_occupancy ?? 0} onChange={(e) => setForm({ ...form, current_occupancy: Number(e.target.value) })} data-testid="form-occupancy" />
              </div>
            </div>
            <div>
              <label htmlFor="shelter-form-status" className="block text-sm font-medium mb-1">Status</label>
              <Select id="shelter-form-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} data-testid="form-status">
                {SHELTER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="form-submit">
                {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
