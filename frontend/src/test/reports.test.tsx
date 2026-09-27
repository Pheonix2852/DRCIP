import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../lib/reports', () => ({
  reports: {
    getAnalytics: vi.fn(),
    exportCsv: vi.fn(),
    exportXlsx: vi.fn(),
    exportPdf: vi.fn(),
  },
}))

vi.mock('../lib/responseZones', () => ({
  responseZones: { list: vi.fn() },
}))

// jsdom has no canvas backend; stub the chart wrappers so aria-labels stay assertable.
vi.mock('react-chartjs-2', () => {
  const Stub = ({ 'aria-label': label }: { 'aria-label'?: string }) =>
    React.createElement('div', { 'data-testid': 'chart-stub', 'aria-label': label })
  return { Doughnut: Stub, Bar: Stub, Line: Stub }
})

import { ReportsPage } from '../pages/ReportsPage'
import { reports } from '../lib/reports'
import { responseZones } from '../lib/responseZones'

type Stats = { avg: number | null; median: number | null; p90: number | null; count: number }

const emptyStats: Stats = { avg: null, median: null, p90: null, count: 0 }

function analytics(overrides: Record<string, unknown> = {}) {
  return {
    filters: { date_from: null, date_to: null, disaster_type: null, response_zone_id: null },
    incidents: {
      total: 11,
      by_status: { REPORTED: 2, IN_RESPONSE: 3, RESOLVED: 6 },
      by_disaster_type: { FLOOD: 7, FIRE: 4 },
      by_response_zone: { 'ZONE-1': 5, 'ZONE-2': 6 },
      by_severity: { LOW: 5, MEDIUM: 3, HIGH: 2, CRITICAL: 1 },
      people_affected_total: 420,
      trend: [{ date: '2026-01-01', count: 4 }, { date: '2026-01-02', count: 7 }],
    },
    response_times: {
      time_to_assign_ms: { ...emptyStats, avg: 120000, median: 90000, p90: 300000, count: 8 },
      time_to_first_response_ms: { ...emptyStats, avg: 900000, median: 600000, p90: 1800000, count: 8 },
      time_to_complete_ms: { ...emptyStats, avg: 7200000, median: 5400000, p90: 14400000, count: 6 },
      time_to_resolve_ms: { ...emptyStats, avg: 10800000, median: 7200000, p90: 25200000, count: 6 },
    },
    resources: { total: 40, by_status: { AVAILABLE: 25, DEPLOYED: 10, MAINTENANCE: 5 }, utilization_rate: 0.375 },
    teams: { total: 6, active: 4, by_status: { ACTIVE: 4, MAINTENANCE: 2 } },
    shelters: { total: 5, total_capacity: 1000, total_occupancy: 300, utilization_rate: 0.3, by_status: { AVAILABLE: 3, FULL: 2 } },
    prediction: {
      triage_count: 4,
      triage_ratio: 0.36,
      severity_distribution: { LOW: 5, MEDIUM: 3 },
      prediction_available: false as const,
      degraded_message: 'Severity prediction is temporarily unavailable. You can manually triage this incident.',
    },
    ...overrides,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(MemoryRouter, null, React.createElement(ReportsPage)),
    ),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(responseZones.list).mockResolvedValue({
    items: [
      { public_id: 'ZONE-1', name: 'North Zone', is_active: true },
      { public_id: 'ZONE-2', name: 'Old Zone', is_active: false },
    ],
  })
})

describe('ReportsPage — data states', () => {
  it('renders the loading state first', () => {
    vi.mocked(reports.getAnalytics).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status').textContent).toContain('Loading analytics')
  })

  it('renders KPI cards with formatted values once data loads', async () => {
    vi.mocked(reports.getAnalytics).mockResolvedValue(analytics() as never)
    renderPage()

    await waitFor(() => expect(screen.getByTestId('kpi-total')).toBeTruthy())
    expect(screen.getByTestId('kpi-total').textContent).toBe('11')
    expect(screen.getByTestId('kpi-ttfr').textContent).toBe('15m')
    expect(screen.getByTestId('kpi-ttr').textContent).toBe('3.0h')
    expect(screen.getByTestId('kpi-utilization').textContent).toBe('38%')
    // 900000ms -> 15m, 10800000ms -> 3.0h
    expect(screen.getByText('Incident Trend')).toBeTruthy()
    expect(screen.getByLabelText(/Severity distribution: 5 LOW, 3 MEDIUM, 2 HIGH, 1 CRITICAL/)).toBeTruthy()
  })

  it('renders the error state with a retry affordance on fetch failure', async () => {
    vi.mocked(reports.getAnalytics).mockRejectedValue(new Error('boom'))
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Unable to load analytics data. Please try again.')
    expect(screen.getByText('Retry')).toBeTruthy()
  })

  it('renders the empty state when no incidents match', async () => {
    vi.mocked(reports.getAnalytics).mockResolvedValue(
      analytics({ incidents: { ...analytics().incidents, total: 0, by_severity: {}, by_disaster_type: {}, by_response_zone: {}, trend: [] } }) as never,
    )
    renderPage()

    await waitFor(() => expect(screen.getByText('No incidents found for the selected filters.')).toBeTruthy())
    expect(screen.queryByTestId('kpi-total')).toBeNull()
  })

  it('renders empty state (not error) for a valid zero-incident response', async () => {
    vi.mocked(reports.getAnalytics).mockResolvedValue(
      analytics({
        incidents: { total: 0, by_status: {}, by_disaster_type: {}, by_response_zone: {}, by_severity: {}, people_affected_total: 0, trend: [] },
        response_times: {
          time_to_assign_ms: { avg: null, median: null, p90: null, count: 0 },
          time_to_first_response_ms: { avg: null, median: null, p90: null, count: 0 },
          time_to_complete_ms: { avg: null, median: null, p90: null, count: 0 },
          time_to_resolve_ms: { avg: null, median: null, p90: null, count: 0 },
        },
        prediction: { triage_count: 0, triage_ratio: 0, severity_distribution: {}, prediction_available: false as const, degraded_message: 'AI prediction performance metrics are unavailable.' },
      }) as never,
    )
    renderPage()

    await waitFor(() => expect(screen.getByText('No incidents found for the selected filters.')).toBeTruthy())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('Current Snapshot')).toBeTruthy()
  })

  it('displays triage percentage correctly (never exceeding 100%)', async () => {
    vi.mocked(reports.getAnalytics).mockResolvedValue(
      analytics({
        prediction: { triage_count: 3, triage_ratio: 0.75, severity_distribution: {}, prediction_available: false as const, degraded_message: 'AI unavailable' },
      }) as never,
    )
    renderPage()

    await waitFor(() => expect(screen.getByTestId('prediction-triage-count').textContent).toBe('3'))
    expect(screen.getByText('(75%)')).toBeTruthy()
  })
})

describe('ReportsPage — filters', () => {
  it('sends the active zone range on load and active zones only in the select', async () => {
    vi.mocked(reports.getAnalytics).mockResolvedValue(analytics() as never)
    renderPage()

    await waitFor(() => expect(reports.getAnalytics).toHaveBeenCalled())
    const initial = vi.mocked(reports.getAnalytics).mock.calls[0][0]!
    expect(initial.date_from).toMatch(/T00:00:00\.000Z$/)
    expect(initial.date_to).toMatch(/T23:59:59\.999Z$/)

    await waitFor(() => expect(screen.getByLabelText('Filter by response zone')).toBeTruthy())
    const zoneSelect = screen.getByLabelText('Filter by response zone') as HTMLSelectElement
    expect([...zoneSelect.options].map(o => o.value)).toEqual(['', 'ZONE-1'])
  })

  it('re-queries with the composed params when Apply is pressed', async () => {
    vi.mocked(reports.getAnalytics).mockResolvedValue(analytics() as never)
    renderPage()
    await waitFor(() => expect(reports.getAnalytics).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText('Date from'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText('Date to'), { target: { value: '2026-01-31' } })
    fireEvent.change(screen.getByLabelText('Filter by disaster type'), { target: { value: 'FLOOD' } })
    fireEvent.change(screen.getByLabelText('Filter by response zone'), { target: { value: 'ZONE-1' } })
    fireEvent.click(screen.getByTestId('apply-filters'))

    await waitFor(() => expect(reports.getAnalytics).toHaveBeenCalledTimes(2))
    expect(vi.mocked(reports.getAnalytics).mock.calls[1][0]).toEqual({
      date_from: '2026-01-01T00:00:00.000Z',
      date_to: '2026-01-31T23:59:59.999Z',
      disaster_type: 'FLOOD',
      response_zone_id: 'ZONE-1',
    })
  })

  it('resets filters back to today on Clear', async () => {
    vi.mocked(reports.getAnalytics).mockResolvedValue(analytics() as never)
    renderPage()
    await waitFor(() => expect(reports.getAnalytics).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText('Filter by disaster type'), { target: { value: 'FIRE' } })
    fireEvent.click(screen.getByTestId('clear-filters'))

    await waitFor(() => expect((screen.getByLabelText('Filter by disaster type') as HTMLSelectElement).value).toBe(''))
    expect((screen.getByLabelText('Filter by response zone') as HTMLSelectElement).value).toBe('')
    expect((screen.getByLabelText('Date from') as HTMLInputElement).value).toBe(new Date().toISOString().slice(0, 10))
    // The initial (today-only) query key is restored, so react-query serves the cached result.
    fireEvent.click(screen.getByTestId('apply-filters'))
    expect(reports.getAnalytics).toHaveBeenCalledTimes(1)
  })
})

describe('ReportsPage — snapshot, prediction and export', () => {
  it('keeps the snapshot and prediction visible when incident filters yield zero matches', async () => {
    vi.mocked(reports.getAnalytics).mockResolvedValue(
      analytics({ incidents: { ...analytics().incidents, total: 0, by_severity: {}, by_disaster_type: {}, by_response_zone: {}, trend: [] } }) as never,
    )
    renderPage()

    await waitFor(() => expect(screen.getByText('No incidents found for the selected filters.')).toBeTruthy())
    expect(screen.getByText('Current Snapshot')).toBeTruthy()
    expect(screen.getByText('Resources')).toBeTruthy()
    expect(screen.getByText('Shelters')).toBeTruthy()
    expect(screen.getByLabelText('Shelter utilization').getAttribute('aria-valuenow')).toBe('30')
    expect(screen.getByLabelText('Resource utilization').getAttribute('aria-valuenow')).toBe('38')
  })

  it('surfaces the degraded prediction message and triage counts', async () => {
    vi.mocked(reports.getAnalytics).mockResolvedValue(analytics() as never)
    renderPage()

    await waitFor(() => expect(screen.getByTestId('prediction-degraded')).toBeTruthy())
    expect(screen.getByTestId('prediction-degraded').textContent).toBe(
      'Severity prediction is temporarily unavailable. You can manually triage this incident.',
    )
    expect(screen.getByTestId('prediction-triage-count').textContent).toBe('4')
  })

  it('passes the applied filters to the export endpoints', async () => {
    vi.mocked(reports.getAnalytics).mockResolvedValue(analytics() as never)
    vi.mocked(reports.exportCsv).mockResolvedValue({ data: new Blob(['a,b']) } as never)
    vi.mocked(reports.exportXlsx).mockResolvedValue({ data: new Blob(['x']) } as never)
    vi.mocked(reports.exportPdf).mockResolvedValue({ data: new Blob(['%PDF']) } as never)
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })

    renderPage()
    await waitFor(() => expect(reports.getAnalytics).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText('Filter by disaster type'), { target: { value: 'FLOOD' } })
    fireEvent.click(screen.getByTestId('apply-filters'))
    await waitFor(() => expect(reports.getAnalytics).toHaveBeenCalledTimes(2))

    const expected = { date_from: expect.stringContaining('T00:00:00.000Z'), date_to: expect.stringContaining('T23:59:59.999Z'), disaster_type: 'FLOOD' }

    fireEvent.click(screen.getByText('Export CSV'))
    await waitFor(() => expect(reports.exportCsv).toHaveBeenCalledWith(expected))
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')

    fireEvent.click(screen.getByText('Export Excel'))
    await waitFor(() => expect(reports.exportXlsx).toHaveBeenCalledWith(expected))

    fireEvent.click(screen.getByText('Export PDF'))
    await waitFor(() => expect(reports.exportPdf).toHaveBeenCalledWith(expected))

    vi.unstubAllGlobals()
  })
})
