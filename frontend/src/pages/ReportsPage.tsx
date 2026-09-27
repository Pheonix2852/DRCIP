import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  LineElement,
  PointElement,
  BarController,
  DoughnutController,
  LineController,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js'
import { Doughnut, Bar, Line } from 'react-chartjs-2'
import type { ChartData } from 'chart.js'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { reports, type AnalyticsParams } from '../lib/reports'
import { responseZones } from '../lib/responseZones'

ChartJS.register(
  ArcElement,
  BarElement,
  LineElement,
  PointElement,
  BarController,
  DoughnutController,
  LineController,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
)

const DISASTER_TYPES = ['FLOOD', 'CYCLONE', 'FIRE', 'EARTHQUAKE', 'BUILDING_COLLAPSE', 'MEDICAL_EMERGENCY', 'ROAD_BLOCKAGE', 'LANDSLIDE']
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

const STATUS_COLORS: Record<string, string> = {
  REPORTED: '#2563eb',
  TRIAGE_PENDING: '#ca8a04',
  IN_RESPONSE: '#ea580c',
  RESOLVED: '#16a34a',
}

const SEVERITY_COLORS: Record<string, string> = {
  LOW: '#2563eb',
  MEDIUM: '#ca8a04',
  HIGH: '#ea580c',
  CRITICAL: '#dc2626',
}

const RESOURCE_STATUS_COLORS: Record<string, string> = {
  AVAILABLE: '#16a34a',
  ASSIGNED: '#ca8a04',
  DEPLOYED: '#ea580c',
  UNAVAILABLE: '#6b7280',
  MAINTENANCE: '#8b5cf6',
}

const CHART_OPTIONS = { maintainAspectRatio: false, responsive: true }
const BAR_HORIZONTAL_OPTIONS = { ...CHART_OPTIONS, indexAxis: 'y' as const }

function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`
  return `${(ms / 3600000).toFixed(1)}h`
}

function formatPct(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function buildFilters(dateFrom: string, dateTo: string, disasterType: string, zoneId: string): AnalyticsParams {
  return {
    ...(dateFrom && { date_from: `${dateFrom}T00:00:00.000Z` }),
    ...(dateTo && { date_to: `${dateTo}T23:59:59.999Z` }),
    ...(disasterType && { disaster_type: disasterType }),
    ...(zoneId && { response_zone_id: zoneId }),
  }
}

function downloadBlob(res: { data: Blob }, filename: string) {
  const blob = res.data instanceof Blob ? res.data : new Blob([res.data as BlobPart])
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function summary(entries: [string, number][]): string {
  return entries.length ? entries.map(([k, v]) => `${v} ${k}`).join(', ') : 'no data'
}

function toEntries(record: Record<string, number> | undefined): [string, number][] {
  return Object.entries(record ?? {})
}

function StatusBreakdown({ title, counts, colors }: { title: string; counts: Record<string, number>; colors: Record<string, string> }) {
  const entries = toEntries(counts)
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No data</p>
      ) : (
        <ul className="mt-2 space-y-1" role="list">
          {entries.map(([status, count]) => (
            <li key={status} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: colors[status] ?? '#6b7280' }}
                />
                <span className="text-muted-foreground">{status}</span>
              </span>
              <span className="tabular-nums font-medium">{count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function UtilizationBar({ rate, label }: { rate: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(rate * 100)))
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{formatPct(rate)}</span>
      </div>
      <div
        className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function ReportsPage() {
  const [dateFrom, setDateFrom] = useState(todayStr)
  const [dateTo, setDateTo] = useState(todayStr)
  const [disasterType, setDisasterType] = useState('')
  const [zoneId, setZoneId] = useState('')
  const [appliedFilters, setAppliedFilters] = useState<AnalyticsParams>(() =>
    buildFilters(todayStr(), todayStr(), '', ''),
  )
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportError, setExportError] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports', 'analytics', appliedFilters],
    queryFn: () => reports.getAnalytics(appliedFilters),
  })

  const { data: zonesData } = useQuery({
    queryKey: ['response-zones'],
    queryFn: () => responseZones.list(),
    retry: false,
  })

  const zones = useMemo(
    () => (zonesData?.items ?? []).filter(z => z.is_active),
    [zonesData],
  )

  const severityData = useMemo<ChartData<'doughnut'>>(() => {
    const counts = data?.incidents.by_severity ?? {}
    const labels = SEVERITIES.filter(s => s in counts)
    return {
      labels,
      datasets: [{
        data: labels.map(l => counts[l] ?? 0),
        backgroundColor: labels.map(l => SEVERITY_COLORS[l]),
        borderWidth: 1,
      }],
    }
  }, [data])

  const typeData = useMemo<ChartData<'bar'>>(() => {
    const entries = toEntries(data?.incidents.by_disaster_type)
    return {
      labels: entries.map(([k]) => k),
      datasets: [{ label: 'Incidents', data: entries.map(([, v]) => v), backgroundColor: '#2563eb' }],
    }
  }, [data])

  const zoneData = useMemo<ChartData<'bar'>>(() => {
    const entries = toEntries(data?.incidents.by_response_zone)
    return {
      labels: entries.map(([k]) => k),
      datasets: [{ label: 'Incidents', data: entries.map(([, v]) => v), backgroundColor: '#0f766e' }],
    }
  }, [data])

  const trendData = useMemo<ChartData<'line'>>(() => {
    const trend = data?.incidents.trend ?? []
    return {
      labels: trend.map(t => t.date),
      datasets: [{
        label: 'Incidents',
        data: trend.map(t => t.count),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      }],
    }
  }, [data])

  const applyFilters = () => {
    setAppliedFilters(buildFilters(dateFrom, dateTo, disasterType, zoneId))
  }

  const clearFilters = () => {
    const today = todayStr()
    setDateFrom(today)
    setDateTo(today)
    setDisasterType('')
    setZoneId('')
    setAppliedFilters(buildFilters(today, today, '', ''))
  }

  const handleExport = async (format: 'csv' | 'xlsx' | 'pdf') => {
    setExportError('')
    setExporting(format)
    try {
      const fn = format === 'csv' ? reports.exportCsv : format === 'xlsx' ? reports.exportXlsx : reports.exportPdf
      const res = await fn(appliedFilters)
      downloadBlob(res as { data: Blob }, `drcip-report.${format}`)
    } catch (err) {
      setExportError((err as Error).message || 'Export failed')
    } finally {
      setExporting(null)
    }
  }

  const total = data?.incidents.total ?? 0
  const noIncidents = !isLoading && !error && total === 0

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Reports &amp; Analytics</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={exporting !== null} onClick={() => handleExport('csv')}>
            {exporting === 'csv' ? 'Exporting...' : 'Export CSV'}
          </Button>
          <Button variant="outline" size="sm" disabled={exporting !== null} onClick={() => handleExport('xlsx')}>
            {exporting === 'xlsx' ? 'Exporting...' : 'Export Excel'}
          </Button>
          <Button variant="outline" size="sm" disabled={exporting !== null} onClick={() => handleExport('pdf')}>
            {exporting === 'pdf' ? 'Exporting...' : 'Export PDF'}
          </Button>
        </div>
      </div>

      {exportError && (
        <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {exportError}
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              type="date"
              aria-label="Date from"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={e => setDateFrom(e.target.value)}
              data-testid="filter-date-from"
            />
            <Input
              type="date"
              aria-label="Date to"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={e => setDateTo(e.target.value)}
              data-testid="filter-date-to"
            />
            <Select
              value={disasterType}
              aria-label="Filter by disaster type"
              onChange={e => setDisasterType(e.target.value)}
              data-testid="filter-disaster-type"
            >
              <option value="">All disaster types</option>
              {DISASTER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Select
              value={zoneId}
              aria-label="Filter by response zone"
              onChange={e => setZoneId(e.target.value)}
              data-testid="filter-response-zone"
            >
              <option value="">All response zones</option>
              {zones.map(z => <option key={z.public_id} value={z.public_id}>{z.name}</option>)}
            </Select>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={applyFilters} data-testid="apply-filters">Apply</Button>
            <Button size="sm" variant="ghost" onClick={clearFilters} data-testid="clear-filters">Clear</Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div role="status" className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          Loading analytics...
        </div>
      ) : error ? (
        <Card>
          <CardContent className="pt-6 text-center" role="alert">
            <p className="text-sm text-destructive">Unable to load analytics data. Please try again.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      ) : noIncidents ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No incidents found for the selected filters.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Total Incidents</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums" data-testid="kpi-total">{total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Avg Time to First Response</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums" data-testid="kpi-ttfr">
                  {formatMs(data?.response_times.time_to_first_response_ms.avg)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Avg Time to Resolve</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums" data-testid="kpi-ttr">
                  {formatMs(data?.response_times.time_to_resolve_ms.avg)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Resource Utilization</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums" data-testid="kpi-utilization">
                  {formatPct(data?.resources.utilization_rate ?? 0)}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Severity Distribution</CardTitle></CardHeader>
              <CardContent>
                <div
                  className="h-64"
                  role="img"
                  aria-label={`Severity distribution: ${summary(SEVERITIES.filter(s => s in (data?.incidents.by_severity ?? {})).map(s => [s, data!.incidents.by_severity[s]] as [string, number]))}`}
                >
                  <Doughnut data={severityData} options={CHART_OPTIONS} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Incidents by Type</CardTitle></CardHeader>
              <CardContent>
                <div
                  className="h-64"
                  role="img"
                  aria-label={`Incidents by type: ${summary(toEntries(data?.incidents.by_disaster_type))}`}
                >
                  <Bar data={typeData} options={BAR_HORIZONTAL_OPTIONS} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Incidents by Zone</CardTitle></CardHeader>
              <CardContent>
                <div
                  className="h-64"
                  role="img"
                  aria-label={`Incidents by zone: ${summary(toEntries(data?.incidents.by_response_zone))}`}
                >
                  <Bar data={zoneData} options={CHART_OPTIONS} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Incident Trend</CardTitle></CardHeader>
              <CardContent>
                <div
                  className="h-64"
                  role="img"
                  aria-label={`Incident trend: ${(data?.incidents.trend ?? []).length} days plotted`}
                >
                  <Line data={trendData} options={CHART_OPTIONS} />
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Response Time</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {([
                ['Time to Assign', data?.response_times.time_to_assign_ms],
                ['Time to First Response', data?.response_times.time_to_first_response_ms],
                ['Time to Complete', data?.response_times.time_to_complete_ms],
                ['Time to Resolve', data?.response_times.time_to_resolve_ms],
              ] as const).map(([label, stats]) => (
                <Card key={label}>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <dl className="mt-2 space-y-1 text-sm">
                      <div className="flex justify-between"><dt className="text-muted-foreground">Avg</dt><dd className="tabular-nums font-medium">{formatMs(stats?.avg)}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted-foreground">Median</dt><dd className="tabular-nums">{formatMs(stats?.median)}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted-foreground">P90</dt><dd className="tabular-nums">{formatMs(stats?.p90)}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted-foreground">Samples</dt><dd className="tabular-nums">{stats?.count ?? 0}</dd></div>
                    </dl>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Current Snapshot</h2>
        <p className="mb-2 text-xs text-muted-foreground">
          Resource, team and shelter figures are system-wide and are not affected by the incident filters above.
        </p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Resources</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-2xl font-semibold tabular-nums">{data?.resources.total ?? 0}</p>
              <UtilizationBar rate={data?.resources.utilization_rate ?? 0} label="Resource utilization" />
              <StatusBreakdown title="By status" counts={data?.resources.by_status ?? {}} colors={RESOURCE_STATUS_COLORS} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Teams</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-2xl font-semibold tabular-nums">
                {data?.teams.active ?? 0}<span className="ml-1 text-sm font-normal text-muted-foreground">active of {data?.teams.total ?? 0}</span>
              </p>
              <StatusBreakdown title="By status" counts={data?.teams.by_status ?? {}} colors={STATUS_COLORS} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Shelters</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-2xl font-semibold tabular-nums">
                {data?.shelters.total_occupancy ?? 0}<span className="ml-1 text-sm font-normal text-muted-foreground">occupied of {data?.shelters.total_capacity ?? 0}</span>
              </p>
              <UtilizationBar rate={data?.shelters.utilization_rate ?? 0} label="Shelter utilization" />
              <StatusBreakdown title="By status" counts={data?.shelters.by_status ?? {}} colors={RESOURCE_STATUS_COLORS} />
            </CardContent>
          </Card>
        </div>
      </div>

      {data && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">AI Triage</h2>
          <Card>
            <CardContent className="pt-6 space-y-2">
              <p className="text-sm text-muted-foreground" data-testid="prediction-degraded">{data.prediction.degraded_message}</p>
              <p className="text-sm">
                <span className="text-muted-foreground">Incidents triaged:</span>{' '}
                <span className="font-medium tabular-nums" data-testid="prediction-triage-count">{data.prediction.triage_count}</span>
                <span className="text-muted-foreground"> ({formatPct(data.prediction.triage_ratio)})</span>
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {data && Object.keys(data.incidents.by_status).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Incidents by Status</CardTitle></CardHeader>
          <CardContent>
            <StatusBreakdown title="Status" counts={data.incidents.by_status} colors={STATUS_COLORS} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
