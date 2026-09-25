import { describe, it, expect } from 'vitest'

describe('Assignment item contract variants', () => {
  it('accepts a Resource item', async () => {
    const { assignmentItemSchema } = await import('@drcip/contracts')
    const item = assignmentItemSchema.parse({ resource_type: 'AMBULANCE', resource_id: 'RES-1', quantity: 2 })
    expect(item).toMatchObject({ resource_type: 'AMBULANCE', resource_id: 'RES-1', quantity: 2 })
  })

  it('accepts a Field Team item (no resource_type, quantity must be 1)', async () => {
    const { assignmentItemSchema } = await import('@drcip/contracts')
    const item = assignmentItemSchema.parse({ team_id: 'TEAM-1', quantity: 1 })
    expect(item).toMatchObject({ team_id: 'TEAM-1', quantity: 1 })
    expect(item).not.toHaveProperty('resource_type')
  })

  it('accepts a Shelter item (no resource_type)', async () => {
    const { assignmentItemSchema } = await import('@drcip/contracts')
    const item = assignmentItemSchema.parse({ shelter_id: 'SHL-1', quantity: 10 })
    expect(item).toMatchObject({ shelter_id: 'SHL-1', quantity: 10 })
    expect(item).not.toHaveProperty('resource_type')
  })

  it('accepts a mixed list of resource + team + shelter items', async () => {
    const { createAssignmentSchema } = await import('@drcip/contracts')
    const parsed = createAssignmentSchema.parse({
      items: [
        { resource_type: 'AMBULANCE', resource_id: 'RES-1', quantity: 1 },
        { team_id: 'TEAM-1', quantity: 1 },
        { shelter_id: 'SHL-1', quantity: 10 },
      ],
    })
    expect(parsed.items).toHaveLength(3)
  })

  it('rejects a Field Team item carrying a resource_type (regression)', async () => {
    const { assignmentItemSchema } = await import('@drcip/contracts')
    expect(() => assignmentItemSchema.parse({ resource_type: 'RESCUE_TEAM', team_id: 'TEAM-1', quantity: 1 })).toThrow()
  })

  it('rejects a Shelter item carrying a resource_type (regression)', async () => {
    const { assignmentItemSchema } = await import('@drcip/contracts')
    expect(() => assignmentItemSchema.parse({ resource_type: 'SHELTER', shelter_id: 'SHL-1', quantity: 5 })).toThrow()
  })

  it('rejects a Resource item without a resource_type', async () => {
    const { assignmentItemSchema } = await import('@drcip/contracts')
    expect(() => assignmentItemSchema.parse({ resource_id: 'RES-1', quantity: 1 })).toThrow()
  })

  it('rejects a Field Team item whose quantity is not 1', async () => {
    const { assignmentItemSchema } = await import('@drcip/contracts')
    expect(() => assignmentItemSchema.parse({ team_id: 'TEAM-1', quantity: 2 })).toThrow()
  })

  it('rejects a Shelter item with a fractional quantity', async () => {
    const { assignmentItemSchema } = await import('@drcip/contracts')
    expect(() => assignmentItemSchema.parse({ shelter_id: 'SHL-1', quantity: 1.5 })).toThrow()
  })

  it('rejects an item with more than one reference', async () => {
    const { assignmentItemSchema } = await import('@drcip/contracts')
    expect(() =>
      assignmentItemSchema.parse({ resource_type: 'AMBULANCE', resource_id: 'RES-1', shelter_id: 'SHL-1', quantity: 1 }),
    ).toThrow()
  })
})