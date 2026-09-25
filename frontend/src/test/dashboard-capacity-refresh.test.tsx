import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../lib/capacity', () => ({
  capacity: {
    get: vi.fn().mockResolvedValue({ available_resources: 1, active_teams: 2, available_shelter_capacity: 3 }),
  },
}))

vi.mock('../lib/incidents', () => ({
  incidents: {
    list: vi.fn().mockResolvedValue({ items: [], pagination: { page: 1, limit: 10, total: 0, total_pages: 0 } }),
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'DISASTER_COORDINATOR' }, wsStatus: 'closed', ws: null }),
}))

import { capacity } from '../lib/capacity'
import { incidents } from '../lib/incidents'
import { CoordinatorDashboard } from '../pages/CoordinatorDashboard'

const capacityGet = vi.mocked(capacity.get)
const incidentsList = vi.mocked(incidents.list)

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CoordinatorDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  capacityGet.mockClear()
  incidentsList.mockClear()
})

afterEach(() => cleanup())

describe('CoordinatorDashboard degraded-state refresh', () => {
  it('shows the degraded warning when realtime is not open', async () => {
    renderDashboard()
    expect(await screen.findByText(/Realtime unavailable/)).toBeTruthy()
  })

  it('Refresh now refetches capacity (not only incidents)', async () => {
    renderDashboard()
    await waitFor(() => expect(capacityGet).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByText('Refresh now'))

    await waitFor(() => expect(capacityGet).toHaveBeenCalledTimes(2))
    expect(incidentsList.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
