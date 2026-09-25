import { describe, it, expect } from 'vitest'

describe('Shelter contract validation', () => {
  it('accepts valid shelter status values', async () => {
    const { shelterStatusSchema } = await import('@drcip/contracts')
    for (const s of ['AVAILABLE', 'FULL', 'UNAVAILABLE']) {
      expect(shelterStatusSchema.parse(s)).toBe(s)
    }
  })

  it('rejects invalid shelter status', async () => {
    const { shelterStatusSchema } = await import('@drcip/contracts')
    expect(() => shelterStatusSchema.parse('CLOSED')).toThrow()
  })

  it('createShelterSchema requires name, lat, lng, total_capacity', async () => {
    const { createShelterSchema } = await import('@drcip/contracts')
    expect(() => createShelterSchema.parse({})).toThrow()
    expect(() => createShelterSchema.parse({ name: 'S' })).toThrow()
    expect(createShelterSchema.parse({ name: 'Shelter', latitude: 22, longitude: 88, total_capacity: 100 })).toMatchObject({ name: 'Shelter' })
  })

  it('createShelterSchema rejects occupancy > capacity', async () => {
    const { createShelterSchema } = await import('@drcip/contracts')
    expect(() => createShelterSchema.parse({ name: 'S', latitude: 22, longitude: 88, total_capacity: 10, current_occupancy: 50 })).toThrow()
  })

  it('createShelterSchema accepts occupancy == capacity', async () => {
    const { createShelterSchema } = await import('@drcip/contracts')
    const r = createShelterSchema.parse({ name: 'S', latitude: 22, longitude: 88, total_capacity: 10, current_occupancy: 10 })
    expect(r.current_occupancy).toBe(10)
  })

  it('updateShelterSchema is strict and rejects unknown fields', async () => {
    const { updateShelterSchema } = await import('@drcip/contracts')
    expect(updateShelterSchema.parse({ name: 'ok' })).toMatchObject({ name: 'ok' })
    expect(() => updateShelterSchema.parse({ public_id: 'X' })).toThrow()
  })

  it('updateShelterSchema rejects occupancy > capacity when both provided', async () => {
    const { updateShelterSchema } = await import('@drcip/contracts')
    expect(() => updateShelterSchema.parse({ total_capacity: 10, current_occupancy: 50 })).toThrow()
  })

  it('shelter query defaults are page=1 limit=20 sort=newest', async () => {
    const { shelterQuerySchema } = await import('@drcip/contracts')
    const d = shelterQuerySchema.parse({})
    expect(d.page).toBe(1)
    expect(d.limit).toBe(20)
    expect(d.sort).toBe('newest')
  })

  it('shelter query accepts status filter', async () => {
    const { shelterQuerySchema } = await import('@drcip/contracts')
    const q = shelterQuerySchema.parse({ status: 'AVAILABLE', min_available_capacity: 10 })
    expect(q.status).toBe('AVAILABLE')
    expect(q.min_available_capacity).toBe(10)
  })
})

describe('Shelter API client helpers', () => {
  it('canManageShelters returns true for Coordinator/Admin', async () => {
    const { canManageShelters } = await import('../lib/shelters')
    expect(canManageShelters('DISASTER_COORDINATOR')).toBe(true)
    expect(canManageShelters('ADMINISTRATOR')).toBe(true)
    expect(canManageShelters('FIELD_OFFICER')).toBe(false)
    expect(canManageShelters('CITIZEN')).toBe(false)
    expect(canManageShelters(undefined)).toBe(false)
  })
})
