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
    dispatchWs({ event: 'assignment.created', version: 1, timestamp: '', data: { assignment_id: 'ASN-1', incident_id: 'INC-1' } })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['assignments'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['incident', 'INC-1'] })
  })

  it('invalidates assignments on assignment.updated', () => {
    const spy = setup()
    dispatchWs({ event: 'assignment.updated', version: 1, timestamp: '', data: { assignment_id: 'ASN-1', status: 'IN_PROGRESS', incident_id: 'INC-1' } })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['assignments'] })
  })

  it('does not invalidate capacity on assignment events', () => {
    const spy = setup()
    dispatchWs({ event: 'assignment.created', version: 1, timestamp: '', data: { assignment_id: 'ASN-1' } })
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
    dispatchWs({ event: 'assignment.updated', version: 1, timestamp: '', data: { assignment_id: 'ASN-1', incident_id: 'INC-1' } })
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2))
  })
})