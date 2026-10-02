import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const authState = { role: null as string | null }

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isInitialized: true,
    hasRole: (roles: string[]) => !!authState.role && roles.includes(authState.role),
  }),
}))

import { RAGChatPage } from '../pages/RAGChatPage'
import { RoleRoute } from '../components/RoleRoute'

afterEach(() => cleanup())

function renderRagGuard() {
  return render(
    <MemoryRouter initialEntries={['/rag']}>
      <Routes>
        <Route path="/" element={<div>Public home</div>} />
        <Route element={<RoleRoute allowedRoles={['FIELD_OFFICER', 'DISASTER_COORDINATOR', 'ADMINISTRATOR']} />}>
          <Route path="/rag" element={<RAGChatPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('RAGChatPage authorization', () => {
  it('renders the deferred RAG surface for an authorized role', () => {
    authState.role = 'DISASTER_COORDINATOR'
    renderRagGuard()
    expect(screen.getByText('RAG Assistant')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('RAG')
  })

  it('denies a Citizen (redirects away from the RAG surface)', () => {
    authState.role = 'CITIZEN'
    renderRagGuard()
    expect(screen.queryByText('RAG Assistant')).toBeNull()
    expect(screen.getByText('Public home')).toBeTruthy()
  })
})
