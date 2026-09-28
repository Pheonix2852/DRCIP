import { useEffect, useRef, useState } from 'react'
import { REGION, DEMO_INCIDENTS, KPI, type Severity } from './demo-data'
import { Select } from '../../pages/ui/select'
import { AnimatedNumber } from './AnimatedNumber'

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

/**
 * Framed command-center surface — live incident map + severity-filterable
 * queue. Queue-row hover highlights the matching map marker and vice versa.
 */
export function DemoCommandCenter() {
  const [severity, setSeverity] = useState<string>(SEVERITY_OPTIONS[0])
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const visible = DEMO_INCIDENTS.filter(
    (inc) => severity === 'All severities' || inc.severity === severity,
  )

  // Map pointer depth response: set CSS vars for restrained parallax
  useEffect(() => {
    const el = mapRef.current
    if (!el || !window.matchMedia('(pointer: fine)').matches) return
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1
      el.style.setProperty('--demo-mx', nx.toFixed(3))
      el.style.setProperty('--demo-my', ny.toFixed(3))
    }
    const onLeave = () => {
      el.style.removeProperty('--demo-mx')
      el.style.removeProperty('--demo-my')
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [])

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
          <div ref={mapRef} className="demo-map" role="img" aria-label="Incident map showing five fictional incidents in Aranya District">
            <span className="demo-map-cross" aria-hidden="true" />
            {DEMO_INCIDENTS.map((inc) => {
              const pos = MARKER_POS[inc.id]
              return (
                <span
                  key={inc.id}
                  className={`demo-map-marker m-${inc.severity.toLowerCase()}${hoveredId === inc.id ? ' is-active' : ''}`}
                  style={{ left: pos.left, top: pos.top }}
                  onMouseEnter={() => setHoveredId(inc.id)}
                  onMouseLeave={() => setHoveredId(null)}
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
            <div className="rounded-drcip-md border border-border bg-surface-cool px-3 py-2.5">
              <p className="font-mono text-lg leading-none text-ink">
                <AnimatedNumber value={KPI.incidents24h} />
              </p>
              <p className="mt-1 text-[11px] text-text-muted">24h reports</p>
            </div>
            <div className="rounded-drcip-md border border-border bg-surface-cool px-3 py-2.5">
              <p className="font-mono text-lg leading-none text-ink">
                <AnimatedNumber value={KPI.open} />
              </p>
              <p className="mt-1 text-[11px] text-text-muted">open</p>
            </div>
            <div className="rounded-drcip-md border border-border bg-surface-cool px-3 py-2.5">
              <p className="font-mono text-lg leading-none text-ink">
                <AnimatedNumber value={KPI.teamsDeployed} />
              </p>
              <p className="mt-1 text-[11px] text-text-muted">teams out</p>
            </div>
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
              <li
                key={inc.id}
                onMouseEnter={() => setHoveredId(inc.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`flex items-center gap-3 rounded-drcip-md border border-border bg-surface px-3 py-2.5 transition-colors ${hoveredId === inc.id ? 'is-hover' : ''}`}
              >
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