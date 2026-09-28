import { useRef } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { FIELD_TEAM, FIELD_ASSIGNMENT, DEMO_TEAMS, REGION } from './demo-data'
import { prefersReducedMotion } from './homeMotion'

gsap.registerPlugin(useGSAP)

const STATUS_LABEL: Record<string, string> = {
  EN_ROUTE: 'En route',
  ON_SITE: 'On site',
  AVAILABLE: 'Available',
  STAGING: 'Staging',
}

function Track({ value, tone }: { value: number; tone?: 'accent' | 'plain' }) {
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--home-track)]">
      <div
        className={`h-full rounded-full ${tone === 'plain' ? 'bg-[var(--text-muted)]' : 'bg-[var(--home-accent)]'}`}
        style={{ width: `${value}%`, transformOrigin: 'left center' }}
        data-progress={value}
      />
    </div>
  )
}

/** Framed Field-Officer surface — my team, active assignment, tracked teams. */
export function DemoFieldOperations() {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    if (prefersReducedMotion()) return
    const bars = ref.current?.querySelectorAll('[data-progress]')
    if (!bars || bars.length === 0) return
    gsap.fromTo(
      bars,
      { scaleX: 0 },
      {
        scaleX: 1,
        duration: 0.8,
        ease: 'power2.out',
        stagger: 0.12,
        scrollTrigger: { trigger: ref.current, start: 'top 80%', once: true },
      },
    )
  }, { scope: ref })

  return (
    <div ref={ref} className="surface-frame">
      <div className="surface-bar">
        <p className="home-mono">FIELD OPERATIONS · {REGION.label.toUpperCase()}</p>
        <span className="status-pill st-go">
          <span className="status-dot" aria-hidden="true" />
          {FIELD_TEAM.id} ACTIVE
        </span>
      </div>

      <div className="surface-body space-y-4">
        <div className="rounded-drcip-md border border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink">My Team · {FIELD_TEAM.name}</p>
            <span className="status-pill">
              <span className="status-dot" aria-hidden="true" />
              {STATUS_LABEL[FIELD_TEAM.status]}
            </span>
          </div>
          <p className="home-mono mt-1">LEAD {FIELD_TEAM.officer} · 4 MEMBERS</p>
          <p className="home-mono">COVERAGE {FIELD_TEAM.progress}% · UPDATED {FIELD_TEAM.updated}</p>
          <Track value={FIELD_TEAM.progress} />
        </div>

        <div className="rounded-drcip-md border border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink">Active Assignment</p>
            <span className={`sev-pill sev-${FIELD_ASSIGNMENT.severity}`}>
              <span className="sev-dot" aria-hidden="true" />
              {FIELD_ASSIGNMENT.severity}
            </span>
          </div>
          <p className="mt-1 text-[15px] font-medium text-ink">{FIELD_ASSIGNMENT.id} · {FIELD_ASSIGNMENT.title}</p>
          <p className="home-mono mt-1">{FIELD_ASSIGNMENT.zone} · {FIELD_ASSIGNMENT.coord}</p>
          <p className="home-mono">DISPATCHED 09:24 · LAST UPDATE {FIELD_ASSIGNMENT.updated}</p>
          <Track value={75} />
        </div>

        <div>
          <p className="home-mono">{REGION.label.toUpperCase()} · TEAMS</p>
          <ul className="mt-2 space-y-2" role="list">
            {DEMO_TEAMS.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-drcip-md border border-border bg-surface px-3 py-2.5 transition-transform duration-150 hover:-translate-y-0.5">
                <span className="home-mono w-9 flex-none">{t.id}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-ink">
                    {t.name} · {t.assignment ?? 'standby'}
                  </span>
                  <span className="block text-[11.5px] text-text-muted">
                    {STATUS_LABEL[t.status]} · {t.progress}% · {t.updated}
                  </span>
                </span>
                <span
                  className={`h-2 w-2 flex-none rounded-full ${t.status === 'AVAILABLE' ? 'bg-status-success' : t.status === 'ON_SITE' ? 'bg-cobalt-electric' : 'bg-status-warning'}`}
                  aria-hidden="true"
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}