import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { resources, type ResourceSummary, type CreateResourceRequest, type UpdateResourceRequest } from '../lib/resources'
import { MapPanel } from '../components/MapPanel'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'

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
      <PageHeader
        title="Resource Inventory"
        actions={canManage && (
          <Button size="sm" onClick={openCreate} data-testid="create-resource-btn">New Resource</Button>
        )}
      />

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
            <div className="lg:col-span-2">
              <Input aria-label="Search resource name or ID" placeholder="Search name or ID..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} data-testid="search-input" />
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
            <Input aria-label="Filter by capability" placeholder="Capability..." value={capability} onChange={(e) => { setCapability(e.target.value); setPage(1) }} data-testid="capability-input" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <Input aria-label="Latitude for nearby search" placeholder="Lat" type="number" step="any" className="sm:w-24" value={nearbyLat} onChange={(e) => setNearbyLat(e.target.value)} data-testid="nearby-lat" />
            <Input aria-label="Longitude for nearby search" placeholder="Lng" type="number" step="any" className="sm:w-24" value={nearbyLng} onChange={(e) => setNearbyLng(e.target.value)} data-testid="nearby-lng" />
            <Input aria-label="Radius in km for nearby search" placeholder="Radius km" type="number" step="any" className="col-span-2 sm:col-span-1 sm:w-24" value={nearbyRadius} onChange={(e) => setNearbyRadius(e.target.value)} data-testid="nearby-radius" />
            <Button size="sm" variant={nearbyActive ? 'default' : 'outline'} className="col-span-2 sm:col-span-1 sm:w-auto" onClick={() => { setNearbyActive(!nearbyActive); setPage(1) }} data-testid="nearby-toggle">
              {nearbyActive ? 'Nearby On' : 'Nearby Off'}
            </Button>
            <Button variant="ghost" size="sm" className="col-span-2 sm:col-span-1 lg:ml-auto" onClick={handleFiltersReset}>Clear filters</Button>
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
              <LoadingState label="Loading map…" className="justify-center py-16" />
            ) : error ? (
              <ErrorState
                title="Failed to load resources"
                description={(error as Error).message}
                retry={() => refetch()}
              />
            ) : markers.length === 0 ? (
              <EmptyState title="No resources with location to display." description="Resources appear on the map once a location is available." />
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
              <LoadingState label="Loading resources…" className="justify-center py-16" />
            ) : error ? (
              <ErrorState
                title="Failed to load resources"
                description={(error as Error).message}
                retry={() => refetch()}
              />
            ) : items.length === 0 ? (
              <EmptyState
                title="No resources match the current filters."
                description="Adjust or clear the filters above to see more resources."
                action={<Button variant="outline" size="sm" onClick={handleFiltersReset}>Clear filters</Button>}
              />
            ) : (
              <ul className="divide-y" role="list">
                {items.map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="drcip-dense-row">
                      <div className="drcip-dense-row-content">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm break-all">{r.id}</span>
                          <StatusBadge status={r.status} />
                          <span className="px-2 py-0.5 rounded-drcip-md bg-surface-cool text-text-secondary text-xs">{r.resource_type}</span>
                          {r.is_own_team && <span className="px-2 py-0.5 rounded-drcip-md bg-surface-cool text-text-secondary text-xs">Your Team</span>}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 break-words">{r.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 break-words">
                          Qty: {r.quantity}{r.unit ? ` ${r.unit}` : ''}
                          {r.capacity != null && ` | Capacity: ${r.capacity}`}
                          {r.latitude != null && r.longitude != null && ` | ${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}`}
                        </p>
                      </div>
                      {canManage && (
                        <div className="drcip-dense-row-actions">
                          <Button variant="outline" size="sm" onClick={() => openEdit(r)} data-testid={`edit-${r.id}`}>Edit</Button>
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
                <span className="text-sm text-muted-foreground">Page {data.pagination.page} of {data.pagination.total_pages} ({data.pagination.total} total)</span>
                <Button variant="outline" size="sm" disabled={page >= data.pagination.total_pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.id}` : 'Create Resource'}</DialogTitle>
          </DialogHeader>
          {formError && <div className="p-2 rounded-drcip-md bg-destructive/10 text-destructive text-sm" role="alert">{formError}</div>}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label htmlFor="resource-form-type" className="block text-sm font-medium mb-1">Type</label>
                <Select id="resource-form-type" value={form.resource_type} onChange={(e) => setForm({ ...form, resource_type: e.target.value })} disabled={!!editing} data-testid="form-type">
                  {RESOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </div>
              <div>
                <label htmlFor="resource-form-name" className="block text-sm font-medium mb-1">Name</label>
                <Input id="resource-form-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Resource name" data-testid="form-name" />
              </div>
              <div>
                <label htmlFor="resource-form-status" className="block text-sm font-medium mb-1">Status</label>
                <Select id="resource-form-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} data-testid="form-status">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="resource-form-quantity" className="block text-sm font-medium mb-1">Quantity</label>
                  <Input id="resource-form-quantity" type="number" min="0" step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} data-testid="form-quantity" />
                </div>
                <div>
                  <label htmlFor="resource-form-unit" className="block text-sm font-medium mb-1">Unit</label>
                  <Input id="resource-form-unit" value={form.unit ?? ''} onChange={(e) => setForm({ ...form, unit: e.target.value || undefined })} placeholder="e.g. vehicles, kits" data-testid="form-unit" />
                </div>
              </div>
              <div>
                <label htmlFor="resource-form-capacity" className="block text-sm font-medium mb-1">Capacity</label>
                <Input id="resource-form-capacity" type="number" min="0" step="1" value={form.capacity ?? ''} onChange={(e) => setForm({ ...form, capacity: e.target.value ? Number(e.target.value) : undefined })} data-testid="form-capacity" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="resource-form-lat" className="block text-sm font-medium mb-1">Latitude</label>
                  <Input id="resource-form-lat" type="number" step="any" value={form.latitude ?? ''} onChange={(e) => setForm({ ...form, latitude: e.target.value ? Number(e.target.value) : undefined })} data-testid="form-lat" />
                </div>
                <div>
                  <label htmlFor="resource-form-lng" className="block text-sm font-medium mb-1">Longitude</label>
                  <Input id="resource-form-lng" type="number" step="any" value={form.longitude ?? ''} onChange={(e) => setForm({ ...form, longitude: e.target.value ? Number(e.target.value) : undefined })} data-testid="form-lng" />
                </div>
              </div>
              <div>
                <label htmlFor="resource-form-contact" className="block text-sm font-medium mb-1">Contact Reference</label>
                <Input id="resource-form-contact" value={form.contact_reference ?? ''} onChange={(e) => setForm({ ...form, contact_reference: e.target.value || undefined })} data-testid="form-contact" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
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
