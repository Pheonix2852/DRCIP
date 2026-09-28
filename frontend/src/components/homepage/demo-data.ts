/* Fictional, deterministic demonstration data for the public homepage product
   previews (Command Center / Field Operations / Reports). Never mixed with
   live API modules; values are coherent across surfaces and computed from a
   fixed matrix — no randomness, no timers. No backend calls. */

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type DemoStatus = 'Reported' | 'In response' | 'Resolved'

export interface DemoIncident {
  id: string
  type: string
  title: string
  severity: Severity
  status: 'REPORTED' | 'IN_RESPONSE' | 'RESOLVED'
  zone: string
  coord: string
  teamId: string | null
  updated: string
}

export interface DemoTrackedTeam {
  id: string
  name: string
  officer: string
  status: 'EN_ROUTE' | 'ON_SITE' | 'AVAILABLE' | 'STAGING'
  progress: number
  assignment: string | null
  updated: string
}

/** Fictional pilot region shared by all three preview surfaces. */
export const REGION = {
  label: 'Aranya District',
  center: '23.0225° N · 72.5714° E',
  coordNum: '23°01\'20"N 72°34\'17"E',
  date: '28 Sep 2026',
} as const

export const DEMO_INCIDENTS: DemoIncident[] = [
  { id: 'INC-0041', type: 'Flooding', title: 'Sasangir crossing inundated', severity: 'HIGH', status: 'IN_RESPONSE', zone: 'Riverside', coord: '23.02°N · 72.51°E', teamId: 'T-03', updated: '09:41' },
  { id: 'INC-0042', type: 'Structure', title: 'Market building roof damage', severity: 'CRITICAL', status: 'IN_RESPONSE', zone: 'Old market', coord: '22.98°N · 72.66°E', teamId: 'T-01', updated: '09:35' },
  { id: 'INC-0044', type: 'Medical', title: 'Evacuation at riverside camp', severity: 'HIGH', status: 'IN_RESPONSE', zone: 'Riverside', coord: '23.11°N · 72.59°E', teamId: 'T-02', updated: '09:28' },
  { id: 'INC-0043', type: 'Utility', title: 'Power lines down in Sector 7', severity: 'MEDIUM', status: 'REPORTED', zone: 'North', coord: '23.05°N · 72.70°E', teamId: null, updated: '09:02' },
  { id: 'INC-0045', type: 'Access', title: 'Debris on north access road', severity: 'LOW', status: 'REPORTED', zone: 'North', coord: '23.19°N · 72.45°E', teamId: null, updated: '08:47' },
] as const

export const DEMO_TEAMS: DemoTrackedTeam[] = [
  { id: 'T-01', name: 'Riverside', officer: 'A. Mehta', status: 'ON_SITE', progress: 65, assignment: 'INC-0042', updated: '09:37' },
  { id: 'T-02', name: 'Delta', officer: 'R. Bose', status: 'EN_ROUTE', progress: 40, assignment: 'INC-0044', updated: '09:30' },
  { id: 'T-03', name: 'Kaddua', officer: 'S. Pillai', status: 'EN_ROUTE', progress: 75, assignment: 'INC-0041', updated: '09:24' },
  { id: 'T-04', name: 'Reserve', officer: '—', status: 'AVAILABLE', progress: 0, assignment: null, updated: '09:00' },
] as const

/** Field Officer portal shows Kaddua team (T-03) assigned to INC-0041. */
export const FIELD_TEAM: DemoTrackedTeam = DEMO_TEAMS[2]
export const FIELD_ASSIGNMENT: DemoIncident = DEMO_INCIDENTS[0]

/** Command-center KPIs — coherent with the Reports matrix below. */
export const KPI = {
  incidents24h: 7,
  open: 5,
  teamsDeployed: 3,
  medianResponseMin: 18,
} as const

export const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

/* ------------------------------------------------------------
   Deterministic Reports matrix.
   Every KPI and chart on the Reports preview derives from the
   STATUS × SEVERITY incident matrix below, so filtering a
   status or severity re-derives all four surfaces coherently.
   All arithmetic is pure; there is no randomness or timers.
   ------------------------------------------------------------ */

/** Incidents (24h) by status × severity. All statuses ⇒ reported=7, open=5. */
const CELLS: Record<DemoStatus, Record<Severity, number>> = {
  Reported: { CRITICAL: 0, HIGH: 0, MEDIUM: 1, LOW: 1 },
  'In response': { CRITICAL: 1, HIGH: 2, MEDIUM: 0, LOW: 0 },
  Resolved: { CRITICAL: 0, HIGH: 1, MEDIUM: 1, LOW: 0 },
}

/** Open incidents distributed to pilot zones (per-severity bases sum to open). */
const SEV_ZONES: Record<Severity, { zone: string; count: number }[]> = {
  CRITICAL: [{ zone: 'Old market', count: 1 }],
  HIGH: [{ zone: 'Riverside', count: 2 }],
  MEDIUM: [{ zone: 'North', count: 1 }],
  LOW: [{ zone: 'North', count: 1 }],
}

const DAILY_7 = [0, 1, 1, 2, 1, 1, 1]
const DAILY_30 = [0, 1, 1, 2, 0, 1, 1, 1, 2, 1, 0, 1, 1, 0, 1, 0, 2, 1, 1, 0, 1, 1, 1, 0, 2, 1, 1, 0, 1, 1] as const

const MEDIAN: Record<DemoStatus | 'All', number> = {
  All: 18,
  Reported: 16,
  'In response': 19,
  Resolved: 21,
}

const SEVERITY_MEDIAN_DELTA: Record<Severity | 'All', number> = {
  All: 0,
  CRITICAL: 5,
  HIGH: 2,
  MEDIUM: -1,
  LOW: -4,
}

const LABELS_7 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export type ReportRange = '7d' | '30d'

export interface ReportSnapshot {
  reported: number
  open: number
  resolved: number
  median: number
  labels: string[]
  daily: number[]
  severity: { severity: Severity; count: number }[]
  zones: { zone: string; count: number }[]
}

function sumCells(cells: Record<DemoStatus, Record<Severity, number>>) {
  let total = 0
  for (const status of Object.keys(cells) as DemoStatus[]) {
    for (const sev of SEVERITY_ORDER) total += cells[status][sev]
  }
  return total
}

/**
 * Deterministic report snapshot for a (status, severity, range) filter combo.
 * Charts and KPIs re-derive coherently from the matrix on every call.
 */
export function reportSnapshot(
  status: DemoStatus | 'All',
  severityValue: Severity | 'All',
  range: ReportRange,
): ReportSnapshot {
  const statusIds: DemoStatus[] =
    status === 'All' ? ['Reported', 'In response', 'Resolved'] : [status]
  const severityIds: Severity[] =
    severityValue === 'All' ? SEVERITY_ORDER : [severityValue]

  let reported = 0
  let open = 0
  let resolved = 0
  const openBySeverity: Record<Severity, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  }

  for (const st of statusIds) {
    for (const sev of severityIds) {
      const cell = CELLS[st][sev]
      reported += cell
      if (st === 'Resolved') resolved += cell
      if (st === 'Reported' || st === 'In response') {
        open += cell
        openBySeverity[sev] += cell
      }
    }
  }

  // Zone counts: scale each severity's zone bases by how many incidents of
  // that severity are open under the current filters (deterministic).
  const zoneMap = new Map<string, number>()
  for (const sev of severityIds) {
    const factor = openBySeverity[sev]
    for (const z of SEV_ZONES[sev]) {
      zoneMap.set(z.zone, (zoneMap.get(z.zone) ?? 0) + z.count * factor)
    }
  }
  const zones = [...zoneMap.entries()]
    .map(([zone, count]) => ({ zone, count }))
    .filter((z) => z.count > 0)

  // Daily line: distribute `reported` across the range shape, remainder on the
  // most recent day so the series always sums exactly to the reported KPI.
  const series = range === '7d' ? DAILY_7 : DAILY_30
  const baseTotal = sumCells(CELLS)
  let remaining = reported
  const daily = series.map((v) => {
    const scaled = Math.min(remaining, Math.round((v / baseTotal) * reported))
    remaining -= scaled
    return scaled
  })
  if (daily.length > 0) daily[daily.length - 1] += remaining

  const median =
    MEDIAN[statusIds.length === 1 ? statusIds[0] : 'All'] +
    SEVERITY_MEDIAN_DELTA[severityIds.length === 1 ? severityIds[0] : 'All']

  return {
    reported,
    open,
    resolved,
    median,
    labels: range === '7d' ? [...LABELS_7] : Array.from({ length: 30 }, (_, i) => `d${i + 1}`),
    daily,
    severity: SEVERITY_ORDER.map((sev) => ({ severity: sev, count: openBySeverity[sev] })),
    zones,
  }
}