import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const h = vi.hoisted(() => {
  const user = { role: 'ADMINISTRATOR' }
  return { user }
})

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: h.user, ws: null }),
}))

vi.mock('../lib/users', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/users')>()
  return {
    ...actual,
    users: {
      list: vi.fn().mockResolvedValue({ items: [], pagination: { page: 1, limit: 20, total: 0, total_pages: 0 } }),
      detail: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      activate: vi.fn(),
      deactivate: vi.fn(),
    },
  }
})

vi.mock('../lib/audit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/audit')>()
  return {
    ...actual,
    auditLogs: {
      list: vi.fn().mockResolvedValue({ items: [], pagination: { page: 1, limit: 20, total: 0, total_pages: 0 } }),
      detail: vi.fn(),
    },
  }
})

import { canManageUsers, users } from '../lib/users'
import { canViewAuditLogs } from '../lib/audit'
import { UsersPage } from '../pages/UsersPage'
import { AuditLogPage } from '../pages/AuditLogPage'

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(React.createElement(QueryClientProvider, { client: qc }, ui))
}

describe('Phase 6 — role gating helpers', () => {
  it('canManageUsers allows only ADMINISTRATOR', () => {
    expect(canManageUsers('ADMINISTRATOR')).toBe(true)
    expect(canManageUsers('DISASTER_COORDINATOR')).toBe(false)
    expect(canManageUsers('FIELD_OFFICER')).toBe(false)
    expect(canManageUsers('CITIZEN')).toBe(false)
    expect(canManageUsers(undefined)).toBe(false)
  })

  it('canViewAuditLogs allows coordinator + admin', () => {
    expect(canViewAuditLogs('ADMINISTRATOR')).toBe(true)
    expect(canViewAuditLogs('DISASTER_COORDINATOR')).toBe(true)
    expect(canViewAuditLogs('FIELD_OFFICER')).toBe(false)
    expect(canViewAuditLogs('CITIZEN')).toBe(false)
    expect(canViewAuditLogs(undefined)).toBe(false)
  })
})

describe('Phase 6 — contract schemas', () => {
  it('userQuerySchema accepts valid inputs with defaults', async () => {
    const { userQuerySchema } = await import('@drcip/contracts')
    const d = userQuerySchema.parse({})
    expect(d.page).toBe(1)
    expect(d.limit).toBe(20)
    const f = userQuerySchema.parse({ role: 'FIELD_OFFICER', active: 'true', search: ' bob ' })
    expect(f.role).toBe('FIELD_OFFICER')
    expect(f.active).toBe('true')
    expect(f.search).toBe('bob')
    expect(() => userQuerySchema.parse({ role: 'NOPE' })).toThrow()
  })

  it('createUserSchema requires name, email, role', async () => {
    const { createUserSchema } = await import('@drcip/contracts')
    expect(() => createUserSchema.parse({})).toThrow()
    expect(() => createUserSchema.parse({ name: 'A', email: 'bad' })).toThrow()
    expect(createUserSchema.parse({ name: 'A', email: 'a@b.com', role: 'CITIZEN' })).toMatchObject({ name: 'A', email: 'a@b.com', role: 'CITIZEN' })
  })

  it('updateUserSchema is strict and requires at least one field', async () => {
    const { updateUserSchema } = await import('@drcip/contracts')
    expect(() => updateUserSchema.parse({})).toThrow()
    expect(() => updateUserSchema.parse({ extra: 1 })).toThrow()
    expect(updateUserSchema.parse({ name: 'x' })).toMatchObject({ name: 'x' })
    expect(updateUserSchema.parse({ role: 'ADMINISTRATOR' })).toMatchObject({ role: 'ADMINISTRATOR' })
  })

  it('auditLogQuerySchema defaults and accepts filters', async () => {
    const { auditLogQuerySchema } = await import('@drcip/contracts')
    const d = auditLogQuerySchema.parse({})
    expect(d.page).toBe(1)
    expect(d.sort).toBe('newest')
    const f = auditLogQuerySchema.parse({ action: 'USER_CREATE', entity_type: 'USER', from: '2020-01-01T00:00:00Z', to: '2099-12-31T23:59:59Z' })
    expect(f.action).toBe('USER_CREATE')
    expect(f.entity_type).toBe('USER')
    expect(() => auditLogQuerySchema.parse({ sort: 'weird' })).toThrow()
  })

  it('AUDIT_ACTIONS includes Phase 6 actions', async () => {
    const { AUDIT_ACTIONS } = await import('@drcip/contracts')
    expect(AUDIT_ACTIONS.USER_CREATE).toBe('USER_CREATE')
    expect(AUDIT_ACTIONS.USER_UPDATE).toBe('USER_UPDATE')
    expect(AUDIT_ACTIONS.USER_DEACTIVATE).toBe('USER_DEACTIVATE')
    expect(AUDIT_ACTIONS.USER_ACTIVATE).toBe('USER_ACTIVATE')
    expect(AUDIT_ACTIONS.INCIDENT_CREATE).toBe('INCIDENT_CREATE')
    expect(AUDIT_ACTIONS.ASSIGNMENT_FIELD_COMPLETE).toBe('ASSIGNMENT_FIELD_COMPLETE')
  })
})

describe('Phase 6 — UsersPage role gating', () => {
  beforeEach(() => { h.user.role = 'ADMINISTRATOR' })

  it('renders for administrator', async () => {
    renderWithQuery(React.createElement(UsersPage))
    expect(screen.getByText('User Management')).toBeInTheDocument()
    expect(screen.getByTestId('create-user')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('No users found.')).toBeInTheDocument())
  })

  it('renders access-denied for field officer', () => {
    h.user.role = 'FIELD_OFFICER'
    renderWithQuery(React.createElement(UsersPage))
    expect(screen.getByText('Cannot manage users.')).toBeInTheDocument()
  })

  it('renders access-denied for citizen', () => {
    h.user.role = 'CITIZEN'
    renderWithQuery(React.createElement(UsersPage))
    expect(screen.getByText('Cannot manage users.')).toBeInTheDocument()
  })
})

describe('Phase 6 — deactivate error feedback', () => {
  beforeEach(() => { h.user.role = 'ADMINISTRATOR' })

  it('displays user-visible feedback when LAST_ADMINISTRATOR deactivate is rejected', async () => {
    const adminUser = {
      id: 'USR-001',
      name: 'System Admin',
      email: 'admin@drcip.local',
      role: 'ADMINISTRATOR',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    }
    vi.mocked(users.list).mockResolvedValueOnce({
      items: [adminUser],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1 },
    })
    vi.mocked(users.deactivate).mockRejectedValueOnce({
      response: { data: { error: { message: 'Cannot deactivate the last active Administrator' } } },
    })

    renderWithQuery(React.createElement(UsersPage))

    const deactivateButton = await screen.findByTestId('deactivate-user')
    fireEvent.click(deactivateButton)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Cannot deactivate the last active Administrator')
  })

  it('shows the domain message for SELF_DEACTIVATION-style 400 errors', async () => {
    const adminUser = {
      id: 'USR-002',
      name: 'Another Admin',
      email: 'a@drcip.local',
      role: 'ADMINISTRATOR',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    }
    vi.mocked(users.list).mockResolvedValueOnce({
      items: [adminUser],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1 },
    })
    vi.mocked(users.deactivate).mockRejectedValueOnce({
      response: { data: { error: { message: 'You cannot deactivate your own account' } } },
    })

    renderWithQuery(React.createElement(UsersPage))

    const deactivateButton = await screen.findByTestId('deactivate-user')
    fireEvent.click(deactivateButton)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('You cannot deactivate your own account')
  })
})

describe('Phase 6 — AuditLogPage role gating', () => {
  beforeEach(() => { h.user.role = 'ADMINISTRATOR' })

  it('renders for coordinator', async () => {
    h.user.role = 'DISASTER_COORDINATOR'
    renderWithQuery(React.createElement(AuditLogPage))
    expect(screen.getByText('Audit Log Viewer')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('No audit records found.')).toBeInTheDocument())
  })

  it('renders for administrator', async () => {
    renderWithQuery(React.createElement(AuditLogPage))
    expect(screen.getByText('Audit Log Viewer')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('No audit records found.')).toBeInTheDocument())
  })

  it('renders access-denied for field officer', () => {
    h.user.role = 'FIELD_OFFICER'
    renderWithQuery(React.createElement(AuditLogPage))
    expect(screen.getByText('Cannot view audit logs.')).toBeInTheDocument()
  })

  it('renders access-denied for citizen', () => {
    h.user.role = 'CITIZEN'
    renderWithQuery(React.createElement(AuditLogPage))
    expect(screen.getByText('Cannot view audit logs.')).toBeInTheDocument()
  })
})