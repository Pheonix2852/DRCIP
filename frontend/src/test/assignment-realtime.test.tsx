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
  return { ws }
})

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ ws: h.ws }),
}))

import { useRealtime } from '../hooks/useRealtime'

function setup() {
  const qc = new QueryClient()
  const spy = vi.spyOn(qc, 'invalidateQueries')
  renderHook(() => useRealtime(), {
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children),
  })
  return spy
}

describe('useRealtime assignment invalidation', () => {
  it('invalidates assignments on assignment.created', () => {
    const spy = setup()
    h.ws.dispatch('message', { event: 'assignment.created', version: 1, timestamp: '', data: { assignment_id: 'ASN-1', incident_id: 'INC-1' } })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['assignments'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['incident', 'INC-1'] })
  })

  it('invalidates assignments on assignment.updated', () => {
    const spy = setup()
    h.ws.dispatch('message', { event: 'assignment.updated', version: 1, timestamp: '', data: { assignment_id: 'ASN-1', status: 'IN_PROGRESS', incident_id: 'INC-1' } })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['assignments'] })
  })

  it('does not invalidate capacity on assignment events', () => {
    const spy = setup()
    h.ws.dispatch('message', { event: 'assignment.created', version: 1, timestamp: '', data: { assignment_id: 'ASN-1' } })
    expect(spy).not.toHaveBeenCalledWith({ queryKey: ['capacity'] })
  })
})

function QueryHarness({ queryFn }: { queryFn: () => Promise<unknown> }) {
  useRealtime()
  useQuery({ queryKey: ['assignments'], queryFn })
  return null
}

describe('assignments query refetches end-to-end on realtime events', () => {
  it('refetches after an assignment.updated event', async () => {
    const qc = new QueryClient()
    const queryFn = vi.fn().mockResolvedValue({ items: [], pagination: { total: 0 } })
    render(
      React.createElement(QueryClientProvider, { client: qc }, React.createElement(QueryHarness, { queryFn }))
    )

    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1))
    h.ws.dispatch('message', { event: 'assignment.updated', version: 1, timestamp: '', data: { assignment_id: 'ASN-1', incident_id: 'INC-1' } })
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2))
  })
})