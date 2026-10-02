import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../lib/capacity', () => ({
  capacity: {
    get: vi.fn().mockResolvedValue({
      available_resources: 5,
      active_teams: 3,
      available_shelter_capacity: 120,
    }),
  },
}))

vi.mock('../lib/incidents', () => ({
  incidents: {
    list: vi.fn().mockResolvedValue({
      items: [
        {
          id: 'INC-TEST-1',
          disaster_type: 'FLOOD',
          description: 'Flooding reported near the river bank',
          people_affected: 5,
          emergency_contact_number: '9830012345',
          status: 'REPORTED',
          created_at: '2026-09-27T12:00:00Z',
          updated_at: '2026-09-27T12:00:00Z',
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, total_pages: 1 },
    }),
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'DISASTER_COORDINATOR' }, wsStatus: 'open', ws: null }),
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

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => cleanup())

describe('CoordinatorDashboard entry point', () => {
  it('mounts and renders the command center with fetched data', async () => {
    renderDashboard()
    expect(await screen.findByText('Coordinator Command Center')).toBeTruthy()
    expect(screen.getByText('Resources')).toBeTruthy()
    expect(await screen.findByText('INC-TEST-1')).toBeTruthy()
  })

  it('does not show the degraded realtime banner while the socket is open', async () => {
    renderDashboard()
    await screen.findByText('Coordinator Command Center')
    expect(screen.queryByText(/Realtime unavailable/)).toBeNull()
  })
})
