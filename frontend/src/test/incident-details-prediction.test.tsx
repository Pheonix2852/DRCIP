import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../lib/incidents', () => ({
  incidents: { detail: vi.fn(), triage: vi.fn() },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'DISASTER_COORDINATOR' } }),
}))

// jsdom has no DOM for Leaflet; stub the map panel so page logic stays assertable.
vi.mock('../components/MapPanel', () => ({
  MapPanel: () => React.createElement('div', { 'data-testid': 'map-panel' }),
}))

import { IncidentDetailsPage } from '../pages/IncidentDetailsPage'
import { incidents } from '../lib/incidents'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/incidents/INC-1'] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, { path: '/incidents/:id', element: React.createElement(IncidentDetailsPage) }),
        ),
      ),
    ),
  )
}

const baseIncident = {
  id: 'INC-1',
  reporter_user_id: 'usr-1',
  disaster_type: 'FLOOD',
  description: 'Heavy flooding near the river',
  people_affected: 12,
  emergency_contact_number: '1234567890',
  latitude: 22.5,
  longitude: 88.4,
  status: 'REPORTED',
  created_at: '2026-09-27T12:00:00Z',
  updated_at: '2026-09-27T12:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('IncidentDetailsPage — severity prediction display', () => {
  it('shows predicted severity and confidence when prediction is SUCCESS', async () => {
    vi.mocked(incidents.detail).mockResolvedValue({
      ...baseIncident,
      predicted_severity: 'HIGH',
      confirmed_severity: null,
      latest_prediction: {
        severity: 'HIGH',
        confidence: '0.92',
        model_version: 'severity-v1-mock',
        status: 'SUCCESS',
        generated_at: '2026-09-27T12:00:00Z',
      },
    } as never)

    renderPage()

    await waitFor(() => expect(vi.mocked(incidents.detail)).toHaveBeenCalled())
    expect(await screen.findByTestId('predicted-severity')).toHaveTextContent('HIGH')
    expect(screen.getByText(/92% confidence/)).toBeTruthy()
  })

  it('shows degraded message when prediction is UNAVAILABLE', async () => {
    vi.mocked(incidents.detail).mockResolvedValue({
      ...baseIncident,
      predicted_severity: undefined,
      confirmed_severity: null,
      latest_prediction: {
        status: 'UNAVAILABLE',
      },
    } as never)

    renderPage()

    expect(
      await screen.findByText('Severity prediction is temporarily unavailable. You can manually triage this incident.'),
    ).toBeTruthy()
  })

  it('shows degraded message when prediction is ERROR', async () => {
    vi.mocked(incidents.detail).mockResolvedValue({
      ...baseIncident,
      predicted_severity: undefined,
      confirmed_severity: null,
      latest_prediction: {
        status: 'ERROR',
      },
    } as never)

    renderPage()

    expect(
      await screen.findByText('Severity prediction is temporarily unavailable. You can manually triage this incident.'),
    ).toBeTruthy()
  })

  it('shows degraded message when prediction is missing entirely', async () => {
    vi.mocked(incidents.detail).mockResolvedValue({
      ...baseIncident,
      predicted_severity: undefined,
      confirmed_severity: null,
    } as never)

    renderPage()

    expect(
      await screen.findByText('Severity prediction is temporarily unavailable. You can manually triage this incident.'),
    ).toBeTruthy()
  })

  it('keeps predicted and confirmed severity distinct when both are present', async () => {
    vi.mocked(incidents.detail).mockResolvedValue({
      ...baseIncident,
      predicted_severity: 'CRITICAL',
      confirmed_severity: 'MEDIUM',
      latest_prediction: {
        severity: 'CRITICAL',
        confidence: '0.87',
        model_version: 'severity-v1-mock',
        status: 'SUCCESS',
        generated_at: '2026-09-27T12:00:00Z',
      },
    } as never)

    renderPage()

    await screen.findByTestId('predicted-severity')
    // Both labels exist and severity values are kept distinct
    expect(screen.getByText('Confirmed:')).toBeTruthy()
    expect(screen.getByText('Predicted:')).toBeTruthy()
    expect(screen.getAllByText('MEDIUM').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('CRITICAL').length).toBeGreaterThanOrEqual(1)
  })
})