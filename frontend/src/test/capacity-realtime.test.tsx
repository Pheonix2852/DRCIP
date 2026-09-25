import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderHook, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'

const h = vi.hoisted(() => {
  const listeners = new Map<string, Set<(ev: MessageEvent) => void>>()
  const ws = {
    addEventListener: (type: string, cb: (ev: MessageEvent) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(cb)
    },
    removeEventListener: (type: string, cb: (ev: MessageEvent) => void) => {
      listeners.get(type)?.delete(cb)
    },
    dispatch: (type: string, payload: unknown) => {
      const ev = new MessageEvent(type, { data: JSON.stringify(payload) })
      listeners.get(type)?.forEach((cb) => cb(ev))
    },
  }
  return { ws, listeners }
})

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ ws: h.ws }),
}))

import { useRealtime } from '../hooks/useRealtime'

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
    h.ws.dispatch('message', { event: 'resource.updated', version: 1, timestamp: '', data: { public_id: 'RES-1' } })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['capacity'] })
  })

  it('invalidates the capacity query on team.updated', () => {
    const spy = setup()
    h.ws.dispatch('message', { event: 'team.updated', version: 1, timestamp: '', data: { public_id: 'TEAM-1' } })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['capacity'] })
  })

  it('does not invalidate capacity on incident events', () => {
    const spy = setup()
    h.ws.dispatch('message', { event: 'incident.created', version: 1, timestamp: '', data: { public_id: 'INC-1' } })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['incidents'] })
    expect(spy).not.toHaveBeenCalledWith({ queryKey: ['capacity'] })
  })

  it('ignores malformed frames without throwing', () => {
    const spy = setup()
    const ev = new MessageEvent('message', { data: 'not-json' })
    h.listeners.get('message')?.forEach((cb) => cb(ev))
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
    h.ws.dispatch('message', { event: 'team.updated', version: 1, timestamp: '', data: { public_id: 'TEAM-1' } })
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2))
  })

  it('refetches capacity after a resource.updated event', async () => {
    const qc = new QueryClient()
    const queryFn = vi.fn().mockResolvedValue({ available_resources: 0, active_teams: 0, available_shelter_capacity: 0 })
    render(React.createElement(QueryClientProvider, { client: qc }, React.createElement(CapacityHarness, { queryFn })))

    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1))
    h.ws.dispatch('message', { event: 'resource.updated', version: 1, timestamp: '', data: { public_id: 'RES-1' } })
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2))
  })
})
