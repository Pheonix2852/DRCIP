import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderHook, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'

import { useRealtime } from '../hooks/useRealtime'

// The hook consumes raw socket frames bridged onto the window by AuthContext,
// so tests dispatch 'drcip:ws-message' CustomEvents instead of mocking a socket.
function dispatchWs(payload: unknown) {
  window.dispatchEvent(new CustomEvent('drcip:ws-message', { detail: JSON.stringify(payload) }))
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children)
}

function setup() {
  const qc = new QueryClient()
  const spy = vi.spyOn(qc, 'invalidateQueries')
  renderHook(() => useRealtime(), { wrapper: wrapper(qc) })
  return spy
}

describe('useRealtime capacity invalidation', () => {
  it('invalidates the capacity query on resource.updated', () => {
    const spy = setup()
    dispatchWs({ event: 'resource.updated', version: 1, timestamp: '', data: { public_id: 'RES-1' } })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['capacity'] })
  })

  it('invalidates the capacity query on team.updated', () => {
    const spy = setup()
    dispatchWs({ event: 'team.updated', version: 1, timestamp: '', data: { public_id: 'TEAM-1' } })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['capacity'] })
  })

  it('does not invalidate capacity on incident events', () => {
    const spy = setup()
    dispatchWs({ event: 'incident.created', version: 1, timestamp: '', data: { public_id: 'INC-1' } })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['incidents'] })
    expect(spy).not.toHaveBeenCalledWith({ queryKey: ['capacity'] })
  })

  it('invalidates the notification queries on notification.created', () => {
    const spy = setup()
    dispatchWs({ event: 'notification.created', version: 1, timestamp: '', data: { notification_id: 'NTF-1' } })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['notifications'] })
  })

  it('invalidates the notification queries on a reconnect (missed-event reconciliation)', () => {
    const spy = setup()
    window.dispatchEvent(new Event('drcip:ws-reconnected'))
    expect(spy).toHaveBeenCalledWith({ queryKey: ['notifications'] })
  })

  it('ignores malformed frames without throwing', () => {
    const spy = setup()
    window.dispatchEvent(new CustomEvent('drcip:ws-message', { detail: 'not-json' }))
    expect(spy).not.toHaveBeenCalled()
  })
})

function CapacityHarness({ queryFn }: { queryFn: () => Promise<unknown> }) {
  useRealtime()
  useQuery({ queryKey: ['capacity'], queryFn })
  return null
}

describe('capacity query refetches end-to-end on realtime events', () => {
  it('refetches capacity after a team.updated event', async () => {
    const qc = new QueryClient()
    const queryFn = vi.fn().mockResolvedValue({ available_resources: 0, active_teams: 0, available_shelter_capacity: 0 })
    render(React.createElement(QueryClientProvider, { client: qc }, React.createElement(CapacityHarness, { queryFn })))

    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1))
    dispatchWs({ event: 'team.updated', version: 1, timestamp: '', data: { public_id: 'TEAM-1' } })
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2))
  })

  it('refetches capacity after a resource.updated event', async () => {
    const qc = new QueryClient()
    const queryFn = vi.fn().mockResolvedValue({ available_resources: 0, active_teams: 0, available_shelter_capacity: 0 })
    render(React.createElement(QueryClientProvider, { client: qc }, React.createElement(CapacityHarness, { queryFn })))

    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1))
    dispatchWs({ event: 'resource.updated', version: 1, timestamp: '', data: { public_id: 'RES-1' } })
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2))
  })
})