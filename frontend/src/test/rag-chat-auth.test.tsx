import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const authState = { authenticated: true }

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: authState.authenticated,
    isInitialized: true,
  }),
}))

import { RAGChatPage } from '../pages/RAGChatPage'
import { PrivateRoute } from '../components/PrivateRoute'

afterEach(() => cleanup())

function renderRagRoute() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/rag']}>
        <Routes>
          <Route path="/login" element={<div>Sign in required</div>} />
          <Route element={<PrivateRoute />}>
            <Route path="/rag" element={<RAGChatPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RAGChatPage authorization', () => {
  it.each(['CITIZEN', 'FIELD_OFFICER', 'DISASTER_COORDINATOR', 'ADMINISTRATOR'])(
    'renders the RAG assistant for %s',
    () => {
      authState.authenticated = true
      renderRagRoute()
      expect(screen.getByRole('heading', { name: 'RAG Assistant' })).toBeTruthy()
      expect(screen.getByLabelText('Your question')).toBeTruthy()
    },
  )

  it('redirects an unauthenticated user to login', () => {
    authState.authenticated = false
    renderRagRoute()
    expect(screen.getByText('Sign in required')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'RAG Assistant' })).toBeNull()
  })
})
