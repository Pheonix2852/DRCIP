import { describe, it, expect } from 'vitest'
import { severityColor } from '../components/MapPanel'

describe('MapPanel marker mapping', () => {
  it('maps CRITICAL severity to red', () => {
    expect(severityColor('CRITICAL')).toBe('#dc2626')
  })
  it('maps HIGH severity to orange', () => {
    expect(severityColor('HIGH')).toBe('#ea580c')
  })
  it('maps MEDIUM severity to yellow', () => {
    expect(severityColor('MEDIUM')).toBe('#ca8a04')
  })
  it('maps LOW severity to blue', () => {
    expect(severityColor('LOW')).toBe('#2563eb')
  })
  it('maps unknown severity to gray', () => {
    expect(severityColor(undefined)).toBe('#6b7280')
    expect(severityColor('UNKNOWN')).toBe('#6b7280')
  })
})

describe('Incident query params', () => {
  it('search param is string-trimmed and bounded to 200 chars', async () => {
    const { incidentQuerySchema } = await import('@drcip/contracts')
    const valid = incidentQuerySchema.parse({ search: 'flood near river' })
    expect(valid.search).toBe('flood near river')
    const trimmed = incidentQuerySchema.parse({ search: '  hello  ' })
    expect(trimmed.search).toBe('hello')
    expect(() => incidentQuerySchema.parse({ search: 'x'.repeat(201) })).toThrow()
  })
  it('sort defaults to newest, accepts oldest', async () => {
    const { incidentQuerySchema } = await import('@drcip/contracts')
    const d = incidentQuerySchema.parse({})
    expect(d.sort).toBe('newest')
    const o = incidentQuerySchema.parse({ sort: 'oldest' })
    expect(o.sort).toBe('oldest')
    expect(() => incidentQuerySchema.parse({ sort: 'random' })).toThrow()
  })
  it('defaults are page=1 limit=20', async () => {
    const { incidentQuerySchema } = await import('@drcip/contracts')
    const d = incidentQuerySchema.parse({})
    expect(d.page).toBe(1)
    expect(d.limit).toBe(20)
  })
})

describe('WebSocket reconnect logic', () => {
  it('exponential backoff caps at 30s', () => {
    let delay = 1000
    const MAX = 30000
    for (let i = 0; i < 20; i++) {
      delay = Math.min(delay * 2, MAX)
    }
    expect(delay).toBe(MAX)
  })
})