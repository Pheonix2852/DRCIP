import { FIELD_ASSIGNMENT, REGION } from './demo-data'

/**
 * Glass "Field Command" panel — hero foreground centerpiece.
 * Fictional operational readout (incident intelligence, spatial
 * coordination, severity, team proximity). Decorative demo data only.
 */
export function DrcipHeroPanel() {
  return (
    <aside
      aria-label="Live field command readout"
      className="hp"
      data-testid="hero-panel"
    >
      <div className="hp-head">
        <span className="hp-live">
          <span className="hp-dot" aria-hidden="true" />
          LIVE
        </span>
        <span className="hp-chip">{FIELD_ASSIGNMENT.id}</span>
      </div>
      <p className="hp-title">Field Command</p>

      <div className="hp-rows">
        <div className="hp-row">
          <span className="hp-k">INCIDENT</span>
          <span className="hp-v">{FIELD_ASSIGNMENT.title}</span>
          <span className="hp-sev hp-sev-high">
            <span className="hp-sev-dot" aria-hidden="true" />
            {FIELD_ASSIGNMENT.severity}
          </span>
        </div>
        <div className="hp-row">
          <span className="hp-k">TEAM</span>
          <span className="hp-v">T-03 · en route</span>
          <span className="hp-mono">1.8 KM</span>
        </div>
        <div className="hp-divider" role="separator" />
        <div className="hp-meter-row">
          <span className="hp-k">RESOURCE READINESS</span>
          <span className="hp-mono">74%</span>
        </div>
        <div className="hp-track">
          <i data-hero-meter aria-hidden="true" />
        </div>
      </div>

      <div className="hp-foot">
        <span className="hp-mono">{REGION.coordNum}</span>
        <span className="hp-mono">09:41</span>
      </div>
    </aside>
  )
}