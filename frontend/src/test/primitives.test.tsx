import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { SeverityBadge } from '../components/SeverityBadge'
import { StatusBadge } from '../components/StatusBadge'
import { severityTone } from '../lib/severityColor'

afterEach(() => cleanup())

describe('SeverityBadge', () => {
  it('renders the severity label and DESIGN_SYSTEM tone classes', () => {
    const { container } = render(<SeverityBadge severity="CRITICAL" />)
    expect(screen.getByText('CRITICAL')).toBeTruthy()
    expect(container.querySelector('[data-testid="severity-badge"]')?.className).toContain('bg-severity-critical/10')
    expect(severityTone('HIGH')).toContain('bg-severity-high/10')
    expect(severityTone('MEDIUM')).toContain('bg-severity-medium/10')
    expect(severityTone('LOW')).toContain('bg-severity-low/10')
    expect(severityTone('NOPE')).toContain('bg-status-unavailable/10')
  })
})

describe('StatusBadge', () => {
  it('maps operational statuses to tones and always renders a label', () => {
    const { container } = render(<StatusBadge status="UNAVAILABLE" />)
    expect(screen.getByText('Unavailable')).toBeTruthy()
    expect(container.querySelector('[data-testid="status-badge"]')?.className).toContain('bg-status-error/10')
  })
  it('renders a readable label for snake_case statuses', () => {
    render(<StatusBadge status="triage_pending" />)
    expect(screen.getByText('Triage Pending')).toBeTruthy()
    render(<StatusBadge status="true" />)
    expect(screen.getByText('Active')).toBeTruthy()
  })
})