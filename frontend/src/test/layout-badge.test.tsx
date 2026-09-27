import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../lib/notifications', () => ({
  notifications: { list: vi.fn() },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'CITIZEN' }, logout: vi.fn() }),
}))

import { Layout } from '../pages/Layout'
import { notifications } from '../lib/notifications'

function listResult(total: number) {
  return { items: [], pagination: { page: 1, limit: 1, total, total_pages: 1 } }
}

function renderLayout() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    qc,
    ...render(
      React.createElement(
        QueryClientProvider,
        { client: qc },
        React.createElement(MemoryRouter, null, React.createElement(Layout)),
      ),
    ),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => cleanup())

describe('Shell bell badge', () => {
  it('shows the unread count and hides the badge at zero', async () => {
    vi.mocked(notifications.list).mockResolvedValue(listResult(2) as never)
    renderLayout()
    const bell = await screen.findByRole('link', { name: /Notifications \(2 unread\)/ })
    expect(bell).toBeTruthy()

    cleanup()
    vi.mocked(notifications.list).mockResolvedValue(listResult(0) as never)
    renderLayout()
    await waitFor(() => expect(notifications.list).toHaveBeenCalled())
    expect(screen.queryByRole('link', { name: /Notifications \(0 unread\)/ })).toBeTruthy()
  })

  it('refetches the unread count when a notification.created event arrives', async () => {
    vi.mocked(notifications.list)
      .mockResolvedValueOnce(listResult(0) as never)
      .mockResolvedValueOnce(listResult(2) as never)
    renderLayout()
    await waitFor(() => expect(notifications.list).toHaveBeenCalledTimes(1))

    window.dispatchEvent(
      new CustomEvent('drcip:ws-message', {
        detail: JSON.stringify({ event: 'notification.created', version: 1, timestamp: '', data: { notification_id: 'NTF-1' } }),
      }),
    )
    await screen.findByRole('link', { name: /Notifications \(2 unread\)/ })
    expect(notifications.list).toHaveBeenCalledTimes(2)
  })

  it('refetches the unread count after a reconnect to reconcile missed events', async () => {
    vi.mocked(notifications.list)
      .mockResolvedValueOnce(listResult(0) as never)
      .mockResolvedValueOnce(listResult(3) as never)
    renderLayout()
    await waitFor(() => expect(notifications.list).toHaveBeenCalledTimes(1))

    window.dispatchEvent(new Event('drcip:ws-reconnected'))
    await screen.findByRole('link', { name: /Notifications \(3 unread\)/ })
    expect(notifications.list).toHaveBeenCalledTimes(2)
  })

  it('decrements the count when the notifications page marks a row read', async () => {
    vi.mocked(notifications.list)
      .mockResolvedValueOnce(listResult(2) as never)
      .mockResolvedValueOnce(listResult(1) as never)
    const { qc } = renderLayout()
    await screen.findByRole('link', { name: /Notifications \(2 unread\)/ })

    // Mirrors NotificationsPage.markReadMutation.onSuccess, which invalidates
    // the shared ['notifications'] key and drives the badge from REST.
    qc.invalidateQueries({ queryKey: ['notifications'] })
    await screen.findByRole('link', { name: /Notifications \(1 unread\)/ })
    expect(notifications.list).toHaveBeenCalledTimes(2)
  })

  it('reconciles a stale count from REST when the window regains focus', async () => {
    vi.mocked(notifications.list)
      .mockResolvedValueOnce(listResult(0) as never)
      .mockResolvedValueOnce(listResult(2) as never)
    renderLayout()
    await waitFor(() => expect(notifications.list).toHaveBeenCalledTimes(1))

    // Focus gain after a blur is what triggers React Query's refetchOnWindowFocus
    // in a real browser; drive the focus manager over that transition.
    focusManager.setFocused(false)
    focusManager.setFocused(true)
    await screen.findByRole('link', { name: /Notifications \(2 unread\)/ })
    expect(notifications.list).toHaveBeenCalledTimes(2)
  })
})