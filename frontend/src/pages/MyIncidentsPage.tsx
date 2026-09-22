import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { incidents } from '../lib/incidents'
import { useQuery } from '@tanstack/react-query'

export function MyIncidentsPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<string>('')
  const [disaster_type, setDisasterType] = useState<string>('')

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

  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>My Incidents</CardTitle>
          <CardDescription>View and track your submitted incident reports.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div className="space-y-2">
              <Select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="REPORTED">REPORTED</option>
                <option value="TRIAGE_PENDING">TRIAGE_PENDING</option>
                <option value="IN_RESPONSE">IN_RESPONSE</option>
                <option value="RESOLVED">RESOLVED</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Select name="disaster_type" value={disaster_type} onChange={(e) => setDisasterType(e.target.value)}>
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
              <Input type="text" placeholder="Search..." className="sm:w-64" />
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading incidents...</div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">
              {(error as Error).message || 'Failed to load incidents'}
            </div>
          ) : data?.items?.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">No incidents found.</p>
              <Link to="/report">
                <Button>Report New Incident</Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {data?.items?.map((incident) => (
                  <Card key={incident.id} className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex flex-wrap justify-between items-start gap-4">
                        <div>
                          <Link to={`/incidents/${incident.id}`} className="font-semibold hover:underline">
                            {incident.id}
                          </Link>
                          <span className="ml-2 text-sm text-muted-foreground">{incident.disaster_type}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                            {incident.status}
                          </span>
                          {incident.predicted_severity && (
                            <span className="px-2 py-1 rounded-full bg-orange-100 text-orange-800">
                              {incident.predicted_severity}
                            </span>
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