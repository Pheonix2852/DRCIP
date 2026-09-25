import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { shelters, canManageShelters, type Shelter, type CreateShelterRequest, type UpdateShelterRequest } from '../lib/shelters'
import { MapPanel } from '../components/MapPanel'
import { useAuth } from '../contexts/AuthContext'

const SHELTER_STATUSES = ['AVAILABLE', 'FULL', 'UNAVAILABLE']
const PAGE_SIZE = 20

function statusColor(status: string): string {
  switch (status) {
    case 'AVAILABLE': return 'bg-green-100 text-green-800'
    case 'FULL': return 'bg-amber-100 text-amber-800'
    case 'UNAVAILABLE': return 'bg-red-100 text-red-800'
    default: return 'bg-gray-100 text-gray-700'
  }
}

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Shelter Management</h1>
        {canManage && <Button size="sm" onClick={openCreate} data-testid="create-shelter-btn">New Shelter</Button>}
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <Input placeholder="Search name..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} data-testid="shelter-search" />
            <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} aria-label="Filter by shelter status">
              <option value="">All statuses</option>
              {SHELTER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Input type="number" min="0" placeholder="Min available capacity" value={minCapacity} onChange={(e) => { setMinCapacity(e.target.value); setPage(1) }} data-testid="min-capacity" />
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={resetFilters}>Clear filters</Button>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Input placeholder="Lat" type="number" step="any" className="w-24" value={nearbyLat} onChange={(e) => setNearbyLat(e.target.value)} data-testid="nearby-lat" />
            <Input placeholder="Lng" type="number" step="any" className="w-24" value={nearbyLng} onChange={(e) => setNearbyLng(e.target.value)} data-testid="nearby-lng" />
            <Input placeholder="Radius km" type="number" step="any" className="w-28" value={nearbyRadius} onChange={(e) => setNearbyRadius(e.target.value)} data-testid="nearby-radius" />
            <Button size="sm" variant={nearbyActive ? 'default' : 'outline'} onClick={() => { setNearbyActive(!nearbyActive); setPage(1) }} data-testid="nearby-toggle">
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
              <div className="text-center py-16 text-muted-foreground" role="status">Loading map...</div>
            ) : error ? (
              <div className="text-center py-16 text-destructive text-sm">{(error as Error).message || 'Failed to load shelters'}</div>
            ) : markers.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">No shelters with location to display.</div>
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
              <div className="text-center py-16 text-muted-foreground" role="status">Loading shelters...</div>
            ) : error ? (
              <div className="text-center py-16 text-destructive text-sm">{(error as Error).message || 'Failed to load shelters'}</div>
            ) : items.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-muted-foreground">No shelters match the current filters.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={resetFilters}>Clear filters</Button>
              </div>
            ) : (
              <ul className="divide-y" role="list">
                {items.map((s) => (
                  <li key={s.id} className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{s.name}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${statusColor(s.status)}`}>{s.status}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {s.id} | Occupancy: {s.current_occupancy}/{s.total_capacity} ({s.total_capacity - s.current_occupancy} available)
                        </p>
                      </div>
                      {canManage && (
                        <Button variant="outline" size="sm" onClick={() => openEdit(s)} data-testid={`edit-${s.id}`}>Edit</Button>
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

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={closeForm}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{editing ? `Edit ${editing.id}` : 'Create Shelter'}</h2>
            {formError && <div className="mb-3 p-2 rounded bg-red-50 text-red-700 text-sm" role="alert">{formError}</div>}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="form-name" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium mb-1">Latitude</label>
                  <Input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: Number(e.target.value) })} data-testid="form-lat" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Longitude</label>
                  <Input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: Number(e.target.value) })} data-testid="form-lng" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium mb-1">Total Capacity</label>
                  <Input type="number" min="0" step="1" value={form.total_capacity} onChange={(e) => setForm({ ...form, total_capacity: Number(e.target.value) })} data-testid="form-capacity" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Current Occupancy</label>
                  <Input type="number" min="0" step="1" value={form.current_occupancy ?? 0} onChange={(e) => setForm({ ...form, current_occupancy: Number(e.target.value) })} data-testid="form-occupancy" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} data-testid="form-status">
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
          </div>
        </div>
      )}
    </div>
  )
}
