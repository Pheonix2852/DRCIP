import { useState } from 'react'
import { REGION, DEMO_INCIDENTS, KPI, type Severity } from './demo-data'
import { Select } from '../../pages/ui/select'

const MARKER_POS: Record<string, { left: string; top: string }> = {
  'INC-0041': { left: '40%', top: '45%' },
  'INC-0042': { left: '64%', top: '60%' },
  'INC-0044': { left: '30%', top: '72%' },
  'INC-0043': { left: '72%', top: '32%' },
  'INC-0045': { left: '24%', top: '26%' },
}

const SEVERITY_OPTIONS = ['All severities', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const
const LEGEND: { key: Severity; color: string }[] = [
  { key: 'CRITICAL', color: '#B42318' },
  { key: 'HIGH', color: '#C2410C' },
  { key: 'MEDIUM', color: '#A16207' },
  { key: 'LOW', color: '#475467' },
]

/** Framed command-center surface — live incident map + severity-filterable queue. */
export function DemoCommandCenter() {
  const [severity, setSeverity] = useState<string>(SEVERITY_OPTIONS[0])
  const visible = DEMO_INCIDENTS.filter(
    (inc) => severity === 'All severities' || inc.severity === severity,
  )

  return (
    <div className="surface-frame">
      <div className="surface-bar">
        <p className="home-mono">COMMAND CENTER · {REGION.label.toUpperCase()}</p>
        <span className="status-pill st-go">
          <span className="status-dot" aria-hidden="true" />
          LIVE
        </span>
      </div>

      <div className="surface-body grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="demo-map" role="img" aria-label="Incident map showing five fictional incidents in Aranya District">
            <span className="demo-map-cross" aria-hidden="true" />
            {DEMO_INCIDENTS.map((inc) => {
              const pos = MARKER_POS[inc.id]
              return (
                <span
                  key={inc.id}
                  className={`demo-map-marker m-${inc.severity.toLowerCase()}`}
                  style={{ left: pos.left, top: pos.top }}
                >
                  <span className="marker-dot" aria-hidden="true" />
                  <span className="marker-id">{inc.id}</span>
                </span>
              )
            })}
            <div className="demo-map-legend" aria-hidden="true">
              {LEGEND.map((l) => (
                <span key={l.key}>
                  <i style={{ background: l.color }} />
                  {l.key}
                </span>
              ))}
            </div>
            <span className="demo-map-coord">{REGION.center}</span>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="grid grid-cols-3 gap-2">
            {[
              { k: `${KPI.incidents24h}`, l: '24h reports' },
              { k: `${KPI.open}`, l: 'open' },
              { k: `${KPI.teamsDeployed}`, l: 'teams out' },
            ].map((s) => (
              <div key={s.l} className="rounded-drcip-md border border-border bg-surface-cool px-3 py-2.5">
                <p className="font-mono text-lg leading-none text-ink">{s.k}</p>
                <p className="mt-1 text-[11px] text-text-muted">{s.l}</p>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <label htmlFor="ccc-sev" className="home-mono block">
              QUEUE · FILTER BY SEVERITY
            </label>
            <Select
              id="ccc-sev"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="mt-2"
              aria-label="Filter incidents by severity"
            >
              {SEVERITY_OPTIONS.map((opt) => (
                <option key={opt}>{opt}</option>
              ))}
            </Select>
          </div>

          <ul className="mt-4 space-y-2" role="list" data-testid="incident-queue">
            {visible.map((inc) => (
              <li key={inc.id} className="flex items-center gap-3 rounded-drcip-md border border-border bg-surface px-3 py-2.5">
                <span className={`sev-pill sev-${inc.severity}`}>
                  <span className="sev-dot" aria-hidden="true" />
                  {inc.severity}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">{inc.id} · {inc.title}</span>
                  <span className="block text-[11.5px] text-text-muted">{inc.zone} · {inc.coord}</span>
                </span>
                <span className="home-mono">{inc.updated}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}