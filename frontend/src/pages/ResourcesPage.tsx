import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { resources, type ResourceSummary, type CreateResourceRequest, type UpdateResourceRequest } from '../lib/resources'
import { MapPanel } from '../components/MapPanel'
import { useAuth } from '../contexts/AuthContext'

const RESOURCE_TYPES = ['AMBULANCE', 'RESCUE_TEAM', 'FOOD', 'MEDICAL_KIT', 'VEHICLE', 'RELIEF_TRUCK', 'SHELTER', 'VOLUNTEER', 'PERSONNEL']
const STATUSES = ['AVAILABLE', 'ASSIGNED', 'DEPLOYED', 'UNAVAILABLE', 'MAINTENANCE']
const PAGE_SIZE = 20

const emptyForm: CreateResourceRequest = {
  resource_type: 'AMBULANCE',
  name: '',
  status: 'AVAILABLE',
  quantity: 1,
}

export function ResourcesPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const canManage = user?.role === 'DISASTER_COORDINATOR' || user?.role === 'ADMINISTRATOR'

  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [capability, setCapability] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  const [page, setPage] = useState(1)

  const [nearbyLat, setNearbyLat] = useState('')
  const [nearbyLng, setNearbyLng] = useState('')
  const [nearbyRadius, setNearbyRadius] = useState('')
  const [nearbyActive, setNearbyActive] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ResourceSummary | null>(null)
  const [form, setForm] = useState<CreateResourceRequest>(emptyForm)
  const [formError, setFormError] = useState('')

  const params = useMemo(() => ({
    page,
    limit: PAGE_SIZE,
    ...(typeFilter && { resource_type: typeFilter }),
    ...(statusFilter && { status: statusFilter }),
    ...(capability.trim() && { capability: capability.trim() }),
    ...(search.trim() && { search: search.trim() }),
    sort,
    ...(nearbyActive && nearbyLat && nearbyLng && nearbyRadius
      ? { nearby_lat: Number(nearbyLat), nearby_lng: Number(nearbyLng), nearby_radius_km: Number(nearbyRadius) }
      : {}),
  }), [page, typeFilter, statusFilter, capability, search, sort, nearbyActive, nearbyLat, nearbyLng, nearbyRadius])

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['resources', params],
    queryFn: () => resources.list(params),
    placeholderData: (prev) => prev,
  })

  useEffect(() => {
    const onFocus = () => { refetch() }
    window.addEventListener('focus', onFocus)
    window.addEventListener('drcip:ws-reconnected', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('drcip:ws-reconnected', onFocus)
    }
  }, [refetch])

  const createMutation = useMutation({
    mutationFn: (data: CreateResourceRequest) => resources.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] })
      setFormOpen(false)
      setForm(emptyForm)
    },
    onError: (err: Error) => setFormError(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateResourceRequest }) => resources.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] })
      setFormOpen(false)
      setEditing(null)
      setForm(emptyForm)
    },
    onError: (err: Error) => setFormError(err.message),
  })

  const items: ResourceSummary[] = data?.items ?? []

  const markers = items
    .filter((r) => r.latitude != null && r.longitude != null)
    .map((r) => ({
      id: r.id,
      lat: r.latitude as number,
      lng: r.longitude as number,
      label: r.name || r.id,
      status: r.status,
      onClick: undefined,
    }))

  const handleFiltersReset = () => {
    setTypeFilter('')
    setStatusFilter('')
    setCapability('')
    setSearch('')
    setSort('newest')
    setPage(1)
    setNearbyActive(false)
    setNearbyLat('')
    setNearbyLng('')
    setNearbyRadius('')
  }

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (r: ResourceSummary) => {
    setEditing(r)
    setForm({
      resource_type: r.resource_type,
      name: r.name,
      status: r.status,
      quantity: r.quantity,
      unit: r.unit ?? undefined,
      capacity: r.capacity ?? undefined,
      latitude: r.latitude ?? undefined,
      longitude: r.longitude ?? undefined,
      contact_reference: r.contact_reference ?? undefined,
    })
    setFormError('')
    setFormOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim()) { setFormError('Name is required'); return }
    if (form.quantity < 0) { setFormError('Quantity must not be negative'); return }
    if (form.capacity !== undefined && form.capacity !== null && form.capacity < 0) { setFormError('Capacity must not be negative'); return }
    
    if (editing) {
      const { name, status, quantity, unit, capacity, capability_profile, latitude, longitude, contact_reference } = form
      updateMutation.mutate({
        id: editing.id,
        data: { name, status, quantity, unit, capacity, capability_profile, latitude, longitude, contact_reference },
      })
    } else {
      createMutation.mutate(form)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Resource Inventory</h1>
        {canManage && (
          <Button size="sm" onClick={openCreate} data-testid="create-resource-btn">New Resource</Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
            <div className="lg:col-span-2">
              <Input placeholder="Search name or ID..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} data-testid="search-input" />
            </div>
            <Select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }} aria-label="Filter by resource type">
              <option value="">All types</option>
              {RESOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} aria-label="Filter by status">
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')} aria-label="Sort order">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </Select>
            <Input placeholder="Capability..." value={capability} onChange={(e) => { setCapability(e.target.value); setPage(1) }} data-testid="capability-input" />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex items-end gap-1">
              <Input placeholder="Lat" type="number" step="any" className="w-24" value={nearbyLat} onChange={(e) => setNearbyLat(e.target.value)} data-testid="nearby-lat" />
              <Input placeholder="Lng" type="number" step="any" className="w-24" value={nearbyLng} onChange={(e) => setNearbyLng(e.target.value)} data-testid="nearby-lng" />
              <Input placeholder="Radius km" type="number" step="any" className="w-24" value={nearbyRadius} onChange={(e) => setNearbyRadius(e.target.value)} data-testid="nearby-radius" />
              <Button size="sm" variant={nearbyActive ? 'default' : 'outline'} onClick={() => { setNearbyActive(!nearbyActive); setPage(1) }} data-testid="nearby-toggle">
                {nearbyActive ? 'Nearby On' : 'Nearby Off'}
              </Button>
            </div>
            <div className="ml-auto">
              <Button variant="ghost" size="sm" onClick={handleFiltersReset}>Clear filters</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resources Map</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-16 text-muted-foreground" role="status">Loading map...</div>
            ) : error ? (
              <div className="text-center py-16 text-destructive text-sm">{(error as Error).message || 'Failed to load resources'}</div>
            ) : markers.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">No resources with location to display.</div>
            ) : (
              <MapPanel center={[markers[0].lat, markers[0].lng]} zoom={6} markers={markers} height="h-80" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resource Inventory ({data?.pagination?.total ?? 0})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="text-center py-16 text-muted-foreground" role="status">Loading resources...</div>
            ) : error ? (
              <div className="text-center py-16 text-destructive text-sm">{(error as Error).message || 'Failed to load resources'}</div>
            ) : items.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-muted-foreground">No resources match the current filters.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={handleFiltersReset}>Clear filters</Button>
              </div>
            ) : (
              <ul className="divide-y" role="list">
                {items.map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{r.id}</span>
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs">{r.status}</span>
                          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs">{r.resource_type}</span>
                          {r.is_own_team && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs">Your Team</span>}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{r.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Qty: {r.quantity}{r.unit ? ` ${r.unit}` : ''}
                          {r.capacity != null && ` | Capacity: ${r.capacity}`}
                          {r.latitude != null && r.longitude != null && ` | ${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}`}
                        </p>
                      </div>
                      {canManage && (
                        <Button variant="outline" size="sm" onClick={() => openEdit(r)} data-testid={`edit-${r.id}`}>Edit</Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {data && data.pagination.total_pages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
                <span className="text-sm text-muted-foreground">Page {data.pagination.page} of {data.pagination.total_pages} ({data.pagination.total} total)</span>
                <Button variant="outline" size="sm" disabled={page >= data.pagination.total_pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4" onClick={() => setFormOpen(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-lg shadow-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{editing ? `Edit ${editing.id}` : 'Create Resource'}</h2>
            {formError && <div className="mb-3 p-2 rounded bg-red-50 text-red-700 text-sm" role="alert">{formError}</div>}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <Select value={form.resource_type} onChange={(e) => setForm({ ...form, resource_type: e.target.value })} disabled={!!editing} data-testid="form-type">
                  {RESOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Resource name" data-testid="form-name" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} data-testid="form-status">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium mb-1">Quantity</label>
                  <Input type="number" min="0" step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} data-testid="form-quantity" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Unit</label>
                  <Input value={form.unit ?? ''} onChange={(e) => setForm({ ...form, unit: e.target.value || undefined })} placeholder="e.g. vehicles, kits" data-testid="form-unit" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Capacity</label>
                <Input type="number" min="0" step="1" value={form.capacity ?? ''} onChange={(e) => setForm({ ...form, capacity: e.target.value ? Number(e.target.value) : undefined })} data-testid="form-capacity" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium mb-1">Latitude</label>
                  <Input type="number" step="any" value={form.latitude ?? ''} onChange={(e) => setForm({ ...form, latitude: e.target.value ? Number(e.target.value) : undefined })} data-testid="form-lat" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Longitude</label>
                  <Input type="number" step="any" value={form.longitude ?? ''} onChange={(e) => setForm({ ...form, longitude: e.target.value ? Number(e.target.value) : undefined })} data-testid="form-lng" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Contact Reference</label>
                <Input value={form.contact_reference ?? ''} onChange={(e) => setForm({ ...form, contact_reference: e.target.value || undefined })} data-testid="form-contact" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
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
