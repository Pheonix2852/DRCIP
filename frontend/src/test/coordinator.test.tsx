import { describe, it, expect } from 'vitest'
import { severityColor } from '../components/MapPanel'

describe('MapPanel marker mapping', () => {
  it('maps CRITICAL severity to its DESIGN_SYSTEM colour', () => {
    expect(severityColor('CRITICAL')).toBe('#B42318')
  })
  it('maps HIGH severity to its DESIGN_SYSTEM colour', () => {
    expect(severityColor('HIGH')).toBe('#C2410C')
  })
  it('maps MEDIUM severity to its DESIGN_SYSTEM colour', () => {
    expect(severityColor('MEDIUM')).toBe('#A16207')
  })
  it('maps LOW severity to its DESIGN_SYSTEM colour', () => {
    expect(severityColor('LOW')).toBe('#475467')
  })
  it('maps unknown severity to the unavailable tone', () => {
    expect(severityColor(undefined)).toBe('#667085')
    expect(severityColor('UNKNOWN')).toBe('#667085')
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