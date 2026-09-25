import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from '../contexts/AuthContext'

class MockWebSocket {
  static OPEN = 1
  static CONNECTING = 0
  static CLOSING = 2
  static CLOSED = 3
  static instances: MockWebSocket[] = []

  url: string
  readyState = 0
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      this.onopen?.()
    }, 0)
  }
  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }
  addEventListener() {}
  removeEventListener() {}
  send() {}
}

function Consumer() {
  const { ws, wsStatus } = useAuth()
  return <div data-testid="status">{`${wsStatus}:${ws ? 'yes' : 'no'}`}</div>
}

function renderProvider() {
  return render(
    <StrictMode>
      <MemoryRouter>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </MemoryRouter>
    </StrictMode>,
  )
}

beforeEach(() => {
  MockWebSocket.instances = []
  vi.stubGlobal('WebSocket', MockWebSocket)
  localStorage.setItem(
    'drcip-auth',
    JSON.stringify({
      token: 'test-token',
      user: { id: 'u1', name: 'Coord', email: '', role: 'DISASTER_COORDINATOR', is_active: true, created_at: '' },
    }),
  )
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('AuthContext WebSocket registration under StrictMode', () => {
  it('registers the socket and reaches open status', async () => {
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('open:yes'))
  })

  it('connects exactly one socket (no orphaned duplicate)', async () => {
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('open:yes'))
    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.instances[0].url).toContain('token=test-token')
  })
})
