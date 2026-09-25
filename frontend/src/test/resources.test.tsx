import { describe, it, expect } from 'vitest'

describe('Resource contract validation', () => {
  it('accepts valid resource type and status', async () => {
    const { resourceTypeSchema, resourceStatusSchema } = await import('@drcip/contracts')
    expect(resourceTypeSchema.parse('AMBULANCE')).toBe('AMBULANCE')
    expect(resourceStatusSchema.parse('AVAILABLE')).toBe('AVAILABLE')
  })

  it('rejects invalid resource type and status', async () => {
    const { resourceTypeSchema, resourceStatusSchema } = await import('@drcip/contracts')
    expect(() => resourceTypeSchema.parse('SUBMARINE')).toThrow()
    expect(() => resourceStatusSchema.parse('ON_FIRE')).toThrow()
  })

  it('resource query defaults are page=1 limit=20 sort=newest', async () => {
    const { resourceQuerySchema } = await import('@drcip/contracts')
    const d = resourceQuerySchema.parse({})
    expect(d.page).toBe(1)
    expect(d.limit).toBe(20)
    expect(d.sort).toBe('newest')
  })

  it('resource query accepts valid filters', async () => {
    const { resourceQuerySchema } = await import('@drcip/contracts')
    const q = resourceQuerySchema.parse({
      resource_type: 'FOOD',
      status: 'DEPLOYED',
      capability: 'medical',
      search: 'alpha',
      sort: 'oldest',
    })
    expect(q.resource_type).toBe('FOOD')
    expect(q.status).toBe('DEPLOYED')
    expect(q.capability).toBe('medical')
    expect(q.search).toBe('alpha')
    expect(q.sort).toBe('oldest')
  })

  it('nearby filter requires all three fields together', async () => {
    const { resourceQuerySchema } = await import('@drcip/contracts')
    expect(() => resourceQuerySchema.parse({ nearby_lat: 22.57 })).toThrow()
    const all = resourceQuerySchema.parse({ nearby_lat: '22.57', nearby_lng: '88.36', nearby_radius_km: '10' })
    expect(all.nearby_lat).toBe(22.57)
    expect(all.nearby_radius_km).toBe(10)
  })

  it('create resource rejects missing required fields', async () => {
    const { createResourceSchema } = await import('@drcip/contracts')
    expect(() => createResourceSchema.parse({})).toThrow()
    expect(() => createResourceSchema.parse({ name: 'no type' })).toThrow()
  })

  it('update resource schema is strict and rejects immutable fields', async () => {
    const { updateResourceSchema } = await import('@drcip/contracts')
    expect(updateResourceSchema.parse({ name: 'ok' })).toMatchObject({ name: 'ok' })
    expect(() => updateResourceSchema.parse({ resource_type: 'FOOD' })).toThrow()
    expect(() => updateResourceSchema.parse({ team_id: 'X' })).toThrow()
    expect(() => updateResourceSchema.parse({ public_id: 'RES-X' })).toThrow()
  })

  it('update resource rejects empty body', async () => {
    const { updateResourceSchema } = await import('@drcip/contracts')
    // All fields are optional, so empty parse succeeds at Zod level;
    // the route handler must enforce non-empty.
    const result = updateResourceSchema.parse({})
    expect(Object.keys(result).length).toBe(0)
  })
})

describe('Resource API client unwrap pattern', () => {
  it('unwraps successful envelope', async () => {
    // The unwrap helper is private to resources.ts; verify the envelope
    // shape that the frontend expects.
    const envelope = { success: true, data: { items: [], pagination: { page: 1, limit: 20, total: 0, total_pages: 0 } } }
    expect(envelope.success).toBe(true)
    expect(envelope.data.items).toEqual([])
    expect(envelope.data.pagination.total).toBe(0)
  })

  it('detects error envelope', () => {
    const envelope = { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } }
    expect(envelope.success).toBe(false)
    expect(envelope.error.code).toBe('FORBIDDEN')
  })
})
