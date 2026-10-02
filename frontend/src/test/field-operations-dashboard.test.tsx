import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../lib/teams', () => ({
  teams: {
    myTeam: vi.fn().mockResolvedValue({
      id: 'TM-1',
      name: 'Alpha Rescue Team',
      status: 'ACTIVE',
      capability_profile: {},
      leader: { id: 'USR-1', name: 'Officer One' },
      members: [],
      created_at: '2026-09-27T12:00:00Z',
      updated_at: '2026-09-27T12:00:00Z',
    }),
  },
}))

vi.mock('../lib/assignments', () => ({
  assignments: {
    myAssignments: vi.fn().mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, total_pages: 0 },
    }),
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'FIELD_OFFICER' }, wsStatus: 'open', ws: null }),
}))

import { FieldOperationsDashboard } from '../pages/FieldOperationsDashboard'

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <FieldOperationsDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => cleanup())

describe('FieldOperationsDashboard entry point', () => {
  it('mounts and renders the field operations header', async () => {
    renderDashboard()
    expect(await screen.findByText('Field Operations Dashboard')).toBeTruthy()
    expect(screen.getByText('My Team')).toBeTruthy()
  })

  it('renders the fetched team and the empty-assignment state', async () => {
    renderDashboard()
    expect(await screen.findByText('Alpha Rescue Team')).toBeTruthy()
    expect(await screen.findByText('No active assignment.')).toBeTruthy()
  })
})
