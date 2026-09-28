/* Fictional, static demonstration data for the public homepage product
   previews (Command Center / Field Operations / Reports). Never mixed with
   live API modules; values are coherent across surfaces. No backend calls. */

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

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

export const KPI = {
  incidents24h: 12,
  open: 6,
  teamsDeployed: 3,
  medianResponseMin: 18,
} as const

export const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

export const REPORT_DAILY = {
  labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  reported: [4, 7, 5, 9, 11, 8, 12],
} as const

/** Donut — open incidents by severity (sums to the 5 listed incidents + 1). */
export const REPORT_SEVERITY: { severity: Severity; count: number }[] = [
  { severity: 'CRITICAL', count: 1 },
  { severity: 'HIGH', count: 2 },
  { severity: 'MEDIUM', count: 1 },
  { severity: 'LOW', count: 1 },
]

/** Bar — listed incidents by pilot-region zone. */
export const REPORT_ZONES: { zone: string; count: number }[] = [
  { zone: 'Riverside', count: 2 },
  { zone: 'North', count: 2 },
  { zone: 'Old market', count: 1 },
]