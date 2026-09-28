import { useMemo, useState } from 'react'
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
  type ChartOptions,
  type ChartData,
} from 'chart.js'
import { Line, Doughnut, Bar } from 'react-chartjs-2'
import { Select } from '../../pages/ui/select'
import { reportSnapshot, REGION, type DemoStatus, type Severity, type ReportRange } from './demo-data'
import { AnimatedNumber } from './AnimatedNumber'

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
)

const INK = '#0A1220'
const MUTED = '#69758C'
const ACCENT = '#1649B8'
const ELECTRIC = '#2F68F0'
const FONT = { family: '"IBM Plex Mono", ui-monospace, monospace' }
const GRID = 'rgba(10,18,32,0.05)'
const BORDER = '#D7DEE8'

const noLegend = { display: false }
const animate = { duration: 550, easing: 'easeOutQuart' as const }

const lineOpts: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: animate,
  plugins: { legend: noLegend },
  scales: {
    x: { ticks: { color: MUTED, font: { size: 10, ...FONT } }, grid: { color: GRID }, border: { color: BORDER } },
    y: { beginAtZero: true, ticks: { color: MUTED, font: { size: 10, ...FONT } }, grid: { color: GRID }, border: { display: false } },
  },
}

const doughnutOpts: ChartOptions<'doughnut'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: animate,
  plugins: {
    legend: { position: 'bottom', labels: { color: INK, font: { size: 11, ...FONT } } },
  },
}

const barOpts: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: animate,
  plugins: { legend: noLegend },
  scales: {
    x: { ticks: { color: MUTED, font: { size: 10, ...FONT } }, grid: { display: false }, border: { color: BORDER } },
    y: { beginAtZero: true, ticks: { color: MUTED, font: { size: 10, ...FONT } }, grid: { color: GRID }, border: { display: false } },
  },
}

const SEV_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const
const sevColors = ['#B42318', '#C2410C', '#A16207', '#475467']

const STATUS_OPTIONS = ['All statuses', 'Reported', 'In response', 'Resolved'] as const
const SEV_OPTIONS = ['All severities', ...SEV_ORDER] as const
const RANGE_OPTIONS = ['Last 7 days', 'Last 30 days'] as const

type StatusKey = (typeof STATUS_OPTIONS)[number]
type SevKey = (typeof SEV_OPTIONS)[number]

function toStatus(k: StatusKey): DemoStatus | 'All' {
  return k === 'All statuses' ? 'All' : k
}
function toSeverity(k: SevKey): Severity | 'All' {
  return k === 'All severities' ? 'All' : k
}
function toRange(k: (typeof RANGE_OPTIONS)[number]): ReportRange {
  return k === 'Last 7 days' ? '7d' : '30d'
}

/** Framed Reports & Analytics surface — deterministic filterable dataset. */
export function DemoReports() {
  const [statusKey, setStatusKey] = useState<StatusKey>('All statuses')
  const [sevKey, setSevKey] = useState<SevKey>('All severities')
  const [rangeKey, setRangeKey] = useState<(typeof RANGE_OPTIONS)[number]>('Last 7 days')

  const snap = useMemo(
    () => reportSnapshot(toStatus(statusKey), toSeverity(sevKey), toRange(rangeKey)),
    [statusKey, sevKey, rangeKey],
  )

  const lineData: ChartData<'line'> = {
    labels: snap.labels,
    datasets: [
      {
        label: 'Reported',
        data: snap.daily,
        borderColor: ACCENT,
        backgroundColor: 'rgba(47,104,240,0.08)',
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointBackgroundColor: ELECTRIC,
        borderWidth: 2,
      },
    ],
  }

  const doughnutData: ChartData<'doughnut', number[], string> = {
    labels: SEV_ORDER.map((s) => s),
    datasets: [
      {
        data: SEV_ORDER.map((s) => snap.severity.find((x) => x.severity === s)?.count ?? 0),
        backgroundColor: sevColors,
        borderWidth: 0,
      },
    ],
  }

  const barData: ChartData<'bar', number[], string> = {
    labels: snap.zones.map((z) => z.zone),
    datasets: [
      {
        label: 'Incidents',
        data: snap.zones.map((z) => z.count),
        backgroundColor: 'rgba(47,104,240,0.55)',
        borderRadius: 4,
        borderSkipped: false as const,
      },
    ],
  }

  return (
    <div className="surface-frame" data-testid="reports-surface">
      <div className="surface-bar">
        <p className="home-mono">REPORTS &amp; ANALYTICS · {REGION.label.toUpperCase()}</p>
        <span className="status-pill">
          <span className="status-dot" aria-hidden="true" />
          {rangeKey.toLowerCase()}
        </span>
      </div>

      <div className="surface-body space-y-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Select aria-label="Filter by status" value={statusKey} onChange={(e) => setStatusKey(e.target.value as StatusKey)}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
          <Select aria-label="Filter by severity" value={sevKey} onChange={(e) => setSevKey(e.target.value as SevKey)}>
            {SEV_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
          <Select aria-label="Date range" value={rangeKey} onChange={(e) => setRangeKey(e.target.value as (typeof RANGE_OPTIONS)[number])}>
            {RANGE_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-drcip-md border border-border bg-surface-cool px-3 py-2.5">
            <p className="font-mono text-lg leading-none text-ink">
              <AnimatedNumber value={snap.reported} />
            </p>
            <p className="mt-1 text-[11px] text-text-muted">reported</p>
          </div>
          <div className="rounded-drcip-md border border-border bg-surface-cool px-3 py-2.5">
            <p className="font-mono text-lg leading-none text-ink">
              <AnimatedNumber value={snap.open} />
            </p>
            <p className="mt-1 text-[11px] text-text-muted">open</p>
          </div>
          <div className="rounded-drcip-md border border-border bg-surface-cool px-3 py-2.5">
            <p className="font-mono text-lg leading-none text-ink">
              <AnimatedNumber value={snap.median} />m
            </p>
            <p className="mt-1 text-[11px] text-text-muted">median res.</p>
          </div>
        </div>

        <div className="rounded-drcip-md border border-border p-4">
          <p className="home-mono">REPORTED PER DAY · {statusKey.toLowerCase()} / {sevKey.toLowerCase()}</p>
          <div className="mt-3 h-40">
            <Line data={lineData} options={lineOpts} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-drcip-md border border-border p-4">
            <p className="home-mono">OPEN BY SEVERITY</p>
            <div className="mt-3 h-40">
              <Doughnut data={doughnutData} options={doughnutOpts} />
            </div>
          </div>
          <div className="rounded-drcip-md border border-border p-4">
            <p className="home-mono">BY ZONE · {REGION.label.toUpperCase()}</p>
            <div className="mt-3 h-40">
              <Bar data={barData} options={barOpts} />
            </div>
          </div>
        </div>

        <p className="reports-filter-caption">
          ILLUSTRATIVE PREVIEW · {statusKey.toUpperCase()} · {sevKey.toUpperCase()} · {rangeKey.toUpperCase()} · DETERMINISTIC DATA
        </p>
      </div>
    </div>
  )
}