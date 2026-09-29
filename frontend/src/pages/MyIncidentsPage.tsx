import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { incidents } from '../lib/incidents'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { SeverityBadge } from '../components/SeverityBadge'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'

export function MyIncidentsPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<string>('')
  const [disaster_type, setDisasterType] = useState<string>('')
  const [search, setSearch] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['incidents', page, status, disaster_type],
    queryFn: () =>
      incidents
        .list({
          page,
          limit: 10,
          ...(status && { status }),
          ...(disaster_type && { disaster_type }),
        })
        .then((res) => res),
  })

  const items = data?.items ?? []
  const filteredItems = search
    ? items.filter((i) => {
        const q = search.toLowerCase()
        return (
          i.id.toLowerCase().includes(q) ||
          i.disaster_type.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q)
        )
      })
    : items

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="My Incidents" description="View and track your submitted incident reports." />
      <Card>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div className="space-y-2">
              <Select name="status" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="REPORTED">REPORTED</option>
                <option value="TRIAGE_PENDING">TRIAGE_PENDING</option>
                <option value="IN_RESPONSE">IN_RESPONSE</option>
                <option value="RESOLVED">RESOLVED</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Select name="disaster_type" aria-label="Filter by disaster type" value={disaster_type} onChange={(e) => setDisasterType(e.target.value)}>
                <option value="">All Types</option>
                <option value="FLOOD">Flood</option>
                <option value="CYCLONE">Cyclone</option>
                <option value="FIRE">Fire</option>
                <option value="EARTHQUAKE">Earthquake</option>
                <option value="BUILDING_COLLAPSE">Building Collapse</option>
                <option value="MEDICAL_EMERGENCY">Medical Emergency</option>
                <option value="ROAD_BLOCKAGE">Road Blockage</option>
                <option value="LANDSLIDE">Landslide</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Input type="text" placeholder="Search by id, type, or description..." value={search} onChange={(e) => setSearch(e.target.value)} className="sm:w-64" />
            </div>
          </div>

          {isLoading ? (
            <LoadingState label="Loading incidents…" className="justify-center py-8" />
          ) : error ? (
            <ErrorState title="Failed to load incidents" description={(error as Error).message} />
          ) : items.length === 0 ? (
            <EmptyState
              title="No incidents found."
              description="You have not reported any incidents yet."
              action={
                <Link to="/report">
                  <Button>Report New Incident</Button>
                </Link>
              }
            />
          ) : filteredItems.length === 0 ? (
            <EmptyState
              title="No matching incidents."
              description="No incidents match your search. Try different keywords or clear the search."
              action={
                <Button variant="outline" size="sm" onClick={() => setSearch('')}>Clear search</Button>
              }
            />
          ) : (
            <>
              <div className="space-y-4">
                {filteredItems.map((incident) => (
                  <Card key={incident.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex flex-wrap justify-between items-start gap-4">
                        <div>
                          <Link to={`/incidents/${incident.id}`} className="font-semibold hover:underline">
                            {incident.id}
                          </Link>
                          <span className="ml-2 text-sm text-muted-foreground">{incident.disaster_type}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <StatusBadge status={incident.status} />
                          {incident.predicted_severity && (
                            <SeverityBadge severity={incident.predicted_severity} />
                          )}
                          <span className="text-muted-foreground">
                            {new Date(incident.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                        {incident.description}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {data && data.pagination && (
                <div className="mt-6 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Page {data.pagination.page} of {data.pagination.total_pages} ({data.pagination.total} total)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={page >= (data.pagination.total_pages || 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}