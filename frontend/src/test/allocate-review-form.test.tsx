import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../lib/incidents', () => ({
  incidents: { detail: vi.fn() },
}))

vi.mock('../lib/assignments', () => ({
  assignments: { create: vi.fn() },
}))

import { AllocateReviewPage } from '../pages/AllocateReviewPage'
import { incidents } from '../lib/incidents'
import { assignments } from '../lib/assignments'

const incident = { id: 'INC-1', disaster_type: 'FLOOD', status: 'REPORTED' }

function renderPage() {
  vi.mocked(incidents.detail).mockResolvedValue(incident as never)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/incidents/INC-1/review'] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, { path: '/incidents/:id/review', element: React.createElement(AllocateReviewPage) }),
        ),
      ),
    ),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AllocateReviewPage — item form variants', () => {
  it('renders Resource type only for a Resource item', async () => {
    renderPage()
    await screen.findByText('Manual Assignment')

    expect(screen.getByText('Resource type')).toBeTruthy()
    expect(screen.getByTestId('ref-0').getAttribute('placeholder')).toBe('RES-...')
    expect(screen.getByTestId('qty-0')).toBeTruthy()
  })

  it('hides Resource type and fixes Qty to 1 for a Field Team item', async () => {
    renderPage()
    await screen.findByText('Manual Assignment')

    fireEvent.change(screen.getByTestId('kind-0'), { target: { value: 'team' } })

    expect(screen.queryByText('Resource type')).toBeNull()
    expect(screen.getByText('Team id')).toBeTruthy()
    expect(screen.getByTestId('ref-0').getAttribute('placeholder')).toBe('TEAM-...')
    expect(screen.getByTestId('team-qty-fixed').textContent).toBe('1')
    expect(screen.queryByTestId('qty-0')).toBeNull()
  })

  it('hides Resource type and shows Qty for a Shelter item', async () => {
    renderPage()
    await screen.findByText('Manual Assignment')

    fireEvent.change(screen.getByTestId('kind-0'), { target: { value: 'shelter' } })

    expect(screen.queryByText('Resource type')).toBeNull()
    expect(screen.getByText('Shelter id')).toBeTruthy()
    expect(screen.getByTestId('ref-0').getAttribute('placeholder')).toBe('SHL-...')
    expect(screen.getByTestId('qty-0')).toBeTruthy()
  })
})

describe('AllocateReviewPage — mixed submission payload', () => {
  it('submits a resource + team + shelter union payload without stray fields', async () => {
    vi.mocked(assignments.create).mockResolvedValue({ id: 'ASN-1' } as never)
    renderPage()
    await screen.findByText('Manual Assignment')

    fireEvent.click(screen.getByText('Add Item'))
    fireEvent.click(screen.getByText('Add Item'))

    // Row 0: Resource (default) -> qty 2, ref RES-1
    fireEvent.change(screen.getByTestId('qty-0'), { target: { value: '2' } })
    fireEvent.change(screen.getByTestId('ref-0'), { target: { value: 'RES-1' } })

    // Row 1: Field Team -> team ref only
    fireEvent.change(screen.getByTestId('kind-1'), { target: { value: 'team' } })
    fireEvent.change(screen.getByTestId('ref-1'), { target: { value: 'TEAM-1' } })

    // Row 2: Shelter -> qty 10, ref SHL-1
    fireEvent.change(screen.getByTestId('kind-2'), { target: { value: 'shelter' } })
    fireEvent.change(screen.getByTestId('qty-2'), { target: { value: '10' } })
    fireEvent.change(screen.getByTestId('ref-2'), { target: { value: 'SHL-1' } })

    fireEvent.click(screen.getByText('Create Assignment'))

    await waitFor(() => expect(assignments.create).toHaveBeenCalledTimes(1))

    const [, payload] = vi.mocked(assignments.create).mock.calls[0]
    expect(payload.items).toEqual([
      { resource_type: 'AMBULANCE', resource_id: 'RES-1', quantity: 2 },
      { team_id: 'TEAM-1', quantity: 1 },
      { shelter_id: 'SHL-1', quantity: 10 },
    ])

    // The produced payload must satisfy the shared contract.
    const { createAssignmentSchema } = await import('@drcip/contracts')
    const parsed = createAssignmentSchema.parse(payload)
    expect(parsed.items).toHaveLength(3)
  })
})