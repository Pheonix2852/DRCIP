import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../lib/notifications', () => ({
  notifications: { list: vi.fn(), markRead: vi.fn() },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'CITIZEN' } }),
}))

import { NotificationsPage } from '../pages/NotificationsPage'
import { notifications } from '../lib/notifications'

const inAppUnread = {
  id: 'NTF-1',
  public_id: 'NTF-1',
  logical_key: 'INCIDENT_STATUS_UPDATE:INC-1:TRIAGE_PENDING',
  channel: 'IN_APP',
  notification_type: 'INCIDENT_STATUS_UPDATE',
  priority: 'HIGH',
  message: 'Incident INC-1 status changed to TRIAGE_PENDING.',
  payload: {},
  delivery_status: 'SENT',
  sent_at: '2026-09-26T10:00:00Z',
  read_at: null,
  incident_public_id: 'INC-1',
  assignment_public_id: null,
  created_at: '2026-09-26T10:00:00Z',
}

const failedEmail = {
  id: 'NTF-2',
  public_id: 'NTF-2',
  logical_key: 'EMERGENCY_BROADCAST:bcast-1',
  channel: 'EMAIL',
  notification_type: 'EMERGENCY_BROADCAST',
  priority: 'CRITICAL',
  message: 'Containment area expanding.',
  payload: {},
  delivery_status: 'FAILED',
  sent_at: null,
  read_at: null,
  incident_public_id: null,
  assignment_public_id: null,
  created_at: '2026-09-26T10:01:00Z',
}

const readOne = {
  ...inAppUnread,
  id: 'NTF-3',
  public_id: 'NTF-3',
  logical_key: 'INCIDENT_STATUS_UPDATE:INC-3:RESOLVED',
  priority: 'LOW',
  message: 'Incident INC-3 status changed to RESOLVED.',
  read_at: '2026-09-26T11:00:00Z',
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/notifications'] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, { path: '/notifications', element: React.createElement(NotificationsPage) }),
        ),
      ),
    ),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Notification contracts', () => {
  it('notificationQuerySchema defaults and accepts filters', async () => {
    const { notificationQuerySchema } = await import('@drcip/contracts')
    const d = notificationQuerySchema.parse({})
    expect(d.page).toBe(1)
    expect(d.limit).toBe(20)
    expect(d.unread_only).toBeUndefined()
    const q = notificationQuerySchema.parse({ unread_only: 'true', notification_type: 'INCIDENT_ESCALATION', sort: 'oldest' })
    expect(q.unread_only).toBe('true')
    expect(q.notification_type).toBe('INCIDENT_ESCALATION')
    expect(() => notificationQuerySchema.parse({ notification_type: 'NOPE' })).toThrow()
  })

  it('broadcastNotificationSchema enforces message length and enum scope', async () => {
    const { broadcastNotificationSchema } = await import('@drcip/contracts')
    expect(() => broadcastNotificationSchema.parse({ message: 'x'.repeat(2001), severity: 'HIGH', recipient_scope: 'ALL' })).toThrow()
    expect(() => broadcastNotificationSchema.parse({ message: 'ok', severity: 'HIGH', recipient_scope: 'SOMETHING' })).toThrow()
    expect(broadcastNotificationSchema.parse({ message: 'ok', severity: 'HIGH', recipient_scope: 'COORDINATORS' })).toMatchObject({ recipient_scope: 'COORDINATORS' })
  })
})

describe('NotificationsPage', () => {
  it('renders read/unread states and FAILED delivery without relying on color alone', async () => {
    vi.mocked(notifications.list).mockResolvedValue({
      items: [inAppUnread, readOne, failedEmail],
      pagination: { page: 1, limit: 10, total: 3, total_pages: 1 },
    } as never)
    renderPage()

    await screen.findByText(/Incident INC-1 status changed/)
    expect(screen.getByText('Priority: HIGH')).toBeTruthy()
    // Unread IN_APP row offers a mark-as-read action.
    expect(screen.getByText('Mark as read')).toBeTruthy()
    // Read row shows an explicit text label.
    expect(screen.getByText('Read')).toBeTruthy()
    // Deferred/email failure is surfaced with text and its channel, not just a color.
    expect(screen.getByText('Delivery failed (EMAIL)')).toBeTruthy()
    // Incident link is available when an incident_public_id exists.
    expect(screen.getAllByText('View details')[0].closest('a')?.getAttribute('href')).toContain('/incidents/INC-1')
  })

  it('marks a notification read and refetches', async () => {
    vi.mocked(notifications.list).mockResolvedValue({
      items: [inAppUnread],
      pagination: { page: 1, limit: 10, total: 1, total_pages: 1 },
    } as never)
    vi.mocked(notifications.markRead).mockResolvedValue({ ...inAppUnread, read_at: '2026-09-26T12:00:00Z' } as never)
    renderPage()

    await screen.findByText(/Incident INC-1 status changed/)
    fireEvent.click(screen.getByText('Mark as read'))
    await waitFor(() => expect(notifications.markRead).toHaveBeenCalledWith('NTF-1'))
    await waitFor(() => expect(notifications.list).toHaveBeenCalled())
  })

  it('shows an empty state when there are no notifications', async () => {
    vi.mocked(notifications.list).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 10, total: 0, total_pages: 1 },
    } as never)
    renderPage()
    expect(await screen.findByText('No notifications found.')).toBeTruthy()
  })

  it('renders an IN_APP + EMAIL pair as one inbox item with per-channel delivery status', async () => {
    const sharedMessage = 'Shared assignment notice.'
    const pairInApp = {
      ...inAppUnread,
      id: 'NTF-A',
      public_id: 'NTF-A',
      logical_key: 'ASSIGNMENT_CREATED:ASN-9',
      notification_type: 'ASSIGNMENT_CREATED',
      message: sharedMessage,
      assignment_public_id: 'ASN-9',
      incident_public_id: null,
    }
    const pairEmail = {
      ...failedEmail,
      id: 'NTF-B',
      public_id: 'NTF-B',
      logical_key: 'ASSIGNMENT_CREATED:ASN-9',
      notification_type: 'ASSIGNMENT_CREATED',
      message: sharedMessage,
      delivery_status: 'FAILED',
    }
    vi.mocked(notifications.list).mockResolvedValue({
      items: [pairInApp, pairEmail],
      pagination: { page: 1, limit: 10, total: 2, total_pages: 1 },
    } as never)
    renderPage()

    await screen.findByText(sharedMessage)
    // One logical event renders one item, not two channel rows.
    expect(screen.getAllByText(sharedMessage).length).toBe(1)
    expect(screen.getByText('IN_APP + EMAIL')).toBeTruthy()
    expect(screen.getByText('Delivery failed (EMAIL)')).toBeTruthy()
    // Read state/mark-as-read is driven by the IN_APP row's public id.
    fireEvent.click(screen.getByText('Mark as read'))
    await waitFor(() => expect(notifications.markRead).toHaveBeenCalledWith('NTF-A'))
  })

  it('keeps events with different logical_keys as separate items', async () => {
    vi.mocked(notifications.list).mockResolvedValue({
      items: [
        { ...inAppUnread, message: 'First event.' },
        { ...readOne, message: 'Second event.' },
      ],
      pagination: { page: 1, limit: 10, total: 2, total_pages: 1 },
    } as never)
    renderPage()

    expect(await screen.findByText('First event.')).toBeTruthy()
    expect(screen.getByText('Second event.')).toBeTruthy()
    // One item stays unread and offers mark-as-read; the other is read.
    expect(screen.getByText('Mark as read')).toBeTruthy()
    expect(screen.getByText('Read')).toBeTruthy()
  })

  it('labels Priority and Severity independently when both are present', async () => {
    const escalation = {
      ...inAppUnread,
      id: 'NTF-4',
      public_id: 'NTF-4',
      logical_key: 'INCIDENT_ESCALATION:INC-9:CRITICAL',
      notification_type: 'INCIDENT_ESCALATION',
      priority: 'LOW',
      message: 'Escalation review needed.',
      payload: { severity: 'CRITICAL', incident_public_id: 'INC-9' },
    }
    vi.mocked(notifications.list).mockResolvedValue({
      items: [escalation],
      pagination: { page: 1, limit: 10, total: 1, total_pages: 1 },
    } as never)
    renderPage()

    expect(await screen.findByText('Escalation review needed.')).toBeTruthy()
    // Independent labels: the event has priority LOW but severity CRITICAL.
    expect(screen.getByText('Priority: LOW')).toBeTruthy()
    expect(screen.getByText('Severity: CRITICAL')).toBeTruthy()
  })

  it('shows no Severity chip when the payload carries none', async () => {
    vi.mocked(notifications.list).mockResolvedValue({
      items: [inAppUnread],
      pagination: { page: 1, limit: 10, total: 1, total_pages: 1 },
    } as never)
    renderPage()

    await screen.findByText(/Incident INC-1 status changed/)
    expect(screen.getByText('Priority: HIGH')).toBeTruthy()
    expect(screen.queryByText(/Severity:/)).toBeNull()
  })
})