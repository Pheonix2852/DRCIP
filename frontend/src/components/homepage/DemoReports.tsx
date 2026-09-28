import { useState } from 'react'
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
import { REPORT_DAILY, REPORT_SEVERITY, REPORT_ZONES, KPI, REGION } from './demo-data'

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

const lineOpts: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: noLegend },
  scales: {
    x: { ticks: { color: MUTED, font: { size: 10, ...FONT } }, grid: { color: GRID }, border: { color: BORDER } },
    y: { beginAtZero: true, ticks: { color: MUTED, font: { size: 10, ...FONT } }, grid: { color: GRID }, border: { display: false } },
  },
}

const doughnutOpts: ChartOptions<'doughnut'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { color: INK, font: { size: 11, ...FONT } } },
  },
}

const barOpts: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: noLegend },
  scales: {
    x: { ticks: { color: MUTED, font: { size: 10, ...FONT } }, grid: { display: false }, border: { color: BORDER } },
    y: { beginAtZero: true, ticks: { color: MUTED, font: { size: 10, ...FONT } }, grid: { color: GRID }, border: { display: false } },
  },
}

const SEV_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const
const sevColors = ['#B42318', '#C2410C', '#A16207', '#475467']

const lineData: ChartData<'line'> = {
  labels: [...REPORT_DAILY.labels],
  datasets: [
    {
      label: 'Reported',
      data: [...REPORT_DAILY.reported],
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

// DoughnutChart keeps positional typing simple for the demo preview.
function SeverityDoughnut() {
  const severities = [...REPORT_SEVERITY].sort(
    (a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity),
  )
  const data: ChartData<'doughnut', number[], string> = {
    labels: severities.map((s) => s.severity),
    datasets: [{ data: severities.map((s) => s.count), backgroundColor: sevColors, borderWidth: 0 }],
  }
  return <Doughnut data={data} options={doughnutOpts} />
}

function ZoneBar() {
  const data: ChartData<'bar', number[], string> = {
    labels: REPORT_ZONES.map((z) => z.zone),
    datasets: [
      {
        label: 'Incidents',
        data: REPORT_ZONES.map((z) => z.count),
        backgroundColor: 'rgba(47,104,240,0.55)',
        borderRadius: 4,
        borderSkipped: false as const,
      },
    ],
  }
  return <Bar data={data} options={barOpts} />
}

/** Framed Reports & Analytics surface — populated filters + populated charts. */
export function DemoReports() {
  const [status, setStatus] = useState('All statuses')
  const [severity, setSeverity] = useState('All severities')
  const [range, setRange] = useState('Last 7 days')

  return (
    <div className="surface-frame" data-testid="reports-surface">
      <div className="surface-bar">
        <p className="home-mono">REPORTS &amp; ANALYTICS · {REGION.label.toUpperCase()}</p>
        <span className="status-pill">
          <span className="status-dot" aria-hidden="true" />
          {range}
        </span>
      </div>

      <div className="surface-body space-y-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>All statuses</option>
            <option>Reported</option>
            <option>In response</option>
            <option>Resolved</option>
          </Select>
          <Select aria-label="Filter by severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option>All severities</option>
            <option>Critical</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </Select>
          <Select aria-label="Date range" value={range} onChange={(e) => setRange(e.target.value)}>
            <option>Last 7 days</option>
            <option>Last 30 days</option>
          </Select>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { k: `${KPI.incidents24h}`, l: 'reported' },
            { k: `${KPI.open}`, l: 'open' },
            { k: `${KPI.medianResponseMin}m`, l: 'median res.' },
          ].map((s) => (
            <div key={s.l} className="rounded-drcip-md border border-border bg-surface-cool px-3 py-2.5">
              <p className="font-mono text-lg leading-none text-ink">{s.k}</p>
              <p className="mt-1 text-[11px] text-text-muted">{s.l}</p>
            </div>
          ))}
        </div>

        <div className="rounded-drcip-md border border-border p-4">
          <p className="home-mono">REPORTED PER DAY · {status.toLowerCase()} / {severity.toLowerCase()}</p>
          <div className="mt-3 h-40">
            <Line data={lineData} options={lineOpts} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-drcip-md border border-border p-4">
            <p className="home-mono">OPEN BY SEVERITY</p>
            <div className="mt-3 h-40">
              <SeverityDoughnut />
            </div>
          </div>
          <div className="rounded-drcip-md border border-border p-4">
            <p className="home-mono">BY ZONE · {REGION.label.toUpperCase()}</p>
            <div className="mt-3 h-40">
              <ZoneBar />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}