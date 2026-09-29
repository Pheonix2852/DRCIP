import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

const authMock: { user: { role: string }; wsStatus: string; ws: null } = {
  user: { role: 'DISASTER_COORDINATOR' },
  wsStatus: 'connecting',
  ws: null,
}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authMock,
}))

vi.mock('../hooks/useRealtime', () => ({
  useRealtime: () => {},
}))

vi.mock('../lib/capacity', () => ({
  capacity: { get: vi.fn().mockResolvedValue({ available_resources: 1, active_teams: 2, available_shelter_capacity: 3 }) },
}))

vi.mock('../lib/incidents', () => ({
  incidents: { list: vi.fn().mockResolvedValue({ items: [], pagination: { page: 1, limit: 10, total: 0, total_pages: 0 } }) },
}))

import { CoordinatorDashboard } from '../pages/CoordinatorDashboard'

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

afterEach(() => {
  cleanup()
  authMock.wsStatus = 'connecting'
})

describe('CoordinatorDashboard — realtime degraded panel', () => {
  it('does NOT show degraded panel when wsStatus is connecting (first load)', () => {
    authMock.wsStatus = 'connecting'
    renderDashboard()
    expect(screen.queryByText(/Realtime unavailable/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Realtime reconnecting/)).not.toBeInTheDocument()
  })

  it('does NOT show degraded panel when wsStatus is open', () => {
    authMock.wsStatus = 'open'
    renderDashboard()
    expect(screen.queryByText(/Realtime unavailable/)).not.toBeInTheDocument()
  })

  it('shows degraded panel when wsStatus is closed (genuine disconnect)', () => {
    authMock.wsStatus = 'closed'
    renderDashboard()
    expect(screen.getByText(/Realtime unavailable/)).toBeInTheDocument()
  })

  it('shows reconnecting panel when wsStatus is reconnecting', () => {
    authMock.wsStatus = 'reconnecting'
    renderDashboard()
    expect(screen.getByText(/Realtime reconnecting/)).toBeInTheDocument()
  })
})
