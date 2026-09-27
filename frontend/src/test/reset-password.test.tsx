import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const post = vi.fn()
vi.mock('../lib/api', () => ({
  default: { post: (...args: unknown[]) => post(...args) },
}))

import { ResetPasswordPage } from '../pages/ResetPasswordPage'

function renderReset(initialEntry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(
        MemoryRouter,
        { initialEntries: [initialEntry] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, { path: '/reset-password', element: React.createElement(ResetPasswordPage) }),
        ),
      ),
    ),
  )
}

beforeEach(() => {
  post.mockReset()
})

describe('ResetPasswordPage', () => {
  it('requests a reset, shows generic feedback and advances to the confirm step', async () => {
    post.mockResolvedValue({ data: { success: true, data: { message: 'If the email exists, a reset link will be sent' } } })

    renderReset('/reset-password')

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'citizen@test.local' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send Reset Token' }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/api/v1/auth/password-reset/request', { email: 'citizen@test.local' })
      expect(screen.getByText(/reset link has been sent/i)).toBeTruthy()
    })

    // Now on the confirm step
    expect(screen.getByRole('button', { name: 'Reset Password' })).toBeTruthy()
  })

  it('opens a reset URL: prefills the token and starts on the confirm step', async () => {
    post.mockResolvedValue({ data: { success: true, data: { message: 'Password has been reset' } } })

    renderReset('/reset-password?token=abcdef1234567890abcdef1234567890')

    // Confirm step is shown directly, token prefilled from the link
    const tokenInput = screen.getByLabelText('Reset Token') as HTMLInputElement
    expect(tokenInput.value).toBe('abcdef1234567890abcdef1234567890')
    expect(screen.getByRole('button', { name: 'Reset Password' })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'NewPass123!' } })
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'NewPass123!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/api/v1/auth/password-reset/confirm', {
        token: 'abcdef1234567890abcdef1234567890',
        password: 'NewPass123!',
      })
      expect(screen.getByText(/password has been reset/i)).toBeTruthy()
    })
  })
})