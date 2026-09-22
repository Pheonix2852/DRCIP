import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { incidents, type IncidentSummary } from '../lib/incidents'
import { MapPanel } from '../components/MapPanel'
import { useRealtime } from '../hooks/useRealtime'
import { useAuth } from '../contexts/AuthContext'

const STATUSES = ['REPORTED', 'TRIAGE_PENDING', 'IN_RESPONSE', 'RESOLVED']
const DISASTER_TYPES = ['FLOOD', 'CYCLONE', 'FIRE', 'EARTHQUAKE', 'BUILDING_COLLAPSE', 'MEDICAL_EMERGENCY', 'ROAD_BLOCKAGE', 'LANDSLIDE']
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const PAGE_SIZE = 10

function severityColor(severity?: string): string {
  switch (severity) {
    case 'CRITICAL': return '#dc2626'
    case 'HIGH': return '#ea580c'
    case 'MEDIUM': return '#ca8a04'
    case 'LOW': return '#2563eb'
    default: return '#6b7280'
  }
}

export function CoordinatorDashboard() {
  useRealtime()
  const { wsStatus } = useAuth()
  const [status, setStatus] = useState('')
  const [disasterType, setDisasterType] = useState('')
  const [severity, setSeverity] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  const [page, setPage] = useState(1)

  const params = useMemo(() => ({
    page,
    limit: PAGE_SIZE,
    ...(status && { status }),
    ...(disasterType && { disaster_type: disasterType }),
    ...(severity && { severity }),
    ...(search.trim() && { search: search.trim() }),
    sort,
  }), [page, status, disasterType, severity, search, sort])

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['incidents', params],
    queryFn: () => incidents.list(params),
    placeholderData: (prev) => prev,
  })

  useEffect(() => {
    const onReconnected = () => { refetch() }
    window.addEventListener('drcip:ws-reconnected', onReconnected)
    const onFocus = () => { refetch() }
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('drcip:ws-reconnected', onReconnected)
      window.removeEventListener('focus', onFocus)
    }
  }, [refetch])

  const items: IncidentSummary[] = data?.items ?? []

  const markers = items
    .filter((i) => i.latitude != null && i.longitude != null)
    .map((i) => ({
      id: i.id,
      lat: i.latitude as number,
      lng: i.longitude as number,
      label: i.id,
      severity: i.confirmed_severity,
      status: i.status,
      onClick: undefined,
    }))

  const handleFiltersReset = () => {
    setStatus('')
    setDisasterType('')
    setSeverity('')
    setSearch('')
    setSort('newest')
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Coordinator Command Center</h1>
        {wsStatus !== 'open' && (
          <span className="text-xs px-3 py-1 rounded-full bg-amber-100 text-amber-800" role="status">
            {wsStatus === 'reconnecting' ? 'Realtime reconnecting...' : 'Realtime unavailable — updates will be fetched'}{' '}
            <button className="underline ml-1" onClick={() => refetch()}>Refresh now</button>
          </span>
        )}
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
            <div className="lg:col-span-2">
              <Input placeholder="Search description or ID..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} data-testid="search-input" />
            </div>
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="Filter by status">
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Select value={disasterType} onChange={(e) => { setDisasterType(e.target.value); setPage(1) }} aria-label="Filter by disaster type">
              <option value="">All types</option>
              {DISASTER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Select value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1) }} aria-label="Filter by confirmed severity">
              <option value="">All severities</option>
              {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')} aria-label="Sort order">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={handleFiltersReset} disabled={!status && !disasterType && !severity && !search}>Clear filters</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Live Incidents</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-16 text-muted-foreground" role="status">Loading map...</div>
            ) : error ? (
              <div className="text-center py-16 text-destructive text-sm">{(error as Error).message || 'Failed to load incidents'}</div>
            ) : markers.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">No incidents with location to display.</div>
            ) : (
              <MapPanel center={[markers[0].lat, markers[0].lng]} zoom={6} markers={markers} height="h-80" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Incident Queue ({data?.pagination?.total ?? 0})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="text-center py-16 text-muted-foreground" role="status">Loading incidents...</div>
            ) : error ? (
              <div className="text-center py-16 text-destructive text-sm">{(error as Error).message || 'Failed to load incidents'}</div>
            ) : items.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-muted-foreground">No incidents match the current filters.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={handleFiltersReset}>Clear filters</Button>
              </div>
            ) : (
              <ul className="divide-y" role="list">
                {items.map((inc) => (
                  <li key={inc.id} className="py-3">
                    <Link to={`/incidents/${inc.id}`} className="block hover:bg-muted/50 rounded-md p-2 -m-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">{inc.id}</span>
                        <span className="flex gap-1 flex-wrap justify-end">
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs">{inc.status}</span>
                          {inc.confirmed_severity && (
                            <span
                              className="px-2 py-0.5 rounded-full text-white text-xs"
                              style={{ backgroundColor: severityColor(inc.confirmed_severity) }}
                            >
                              {inc.confirmed_severity}
                            </span>
                          )}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{inc.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {inc.disaster_type} • {new Date(inc.created_at).toLocaleString()}
                        {inc.latitude != null && inc.longitude != null && ` • ${inc.latitude.toFixed(4)}, ${inc.longitude.toFixed(4)}`}
                      </p>
                    </Link>
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
    </div>
  )
}