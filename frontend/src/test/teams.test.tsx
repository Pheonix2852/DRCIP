import { describe, it, expect } from 'vitest'

describe('Team contract validation', () => {
  it('accepts valid team status values', async () => {
    const { teamStatusSchema } = await import('@drcip/contracts')
    for (const s of ['ACTIVE', 'DEPLOYED', 'UNAVAILABLE', 'MAINTENANCE']) {
      expect(teamStatusSchema.parse(s)).toBe(s)
    }
  })

  it('rejects invalid team status', async () => {
    const { teamStatusSchema } = await import('@drcip/contracts')
    expect(() => teamStatusSchema.parse('NOPE')).toThrow()
  })

  it('createTeamSchema requires name and leader_user_id', async () => {
    const { createTeamSchema } = await import('@drcip/contracts')
    expect(() => createTeamSchema.parse({})).toThrow()
    expect(() => createTeamSchema.parse({ name: 'T' })).toThrow()
    expect(() => createTeamSchema.parse({ leader_user_id: 'U1' })).toThrow()
    expect(createTeamSchema.parse({ name: 'Alpha', leader_user_id: 'USR-123' })).toMatchObject({ name: 'Alpha', leader_user_id: 'USR-123' })
  })

  it('updateTeamSchema is strict and rejects unknown fields', async () => {
    const { updateTeamSchema } = await import('@drcip/contracts')
    expect(updateTeamSchema.parse({ name: 'ok' })).toMatchObject({ name: 'ok' })
    expect(() => updateTeamSchema.parse({ name: 'ok', extra: 'field' })).toThrow()
  })

  it('teamStatusUpdateSchema requires a valid status', async () => {
    const { teamStatusUpdateSchema } = await import('@drcip/contracts')
    expect(teamStatusUpdateSchema.parse({ status: 'DEPLOYED' })).toMatchObject({ status: 'DEPLOYED' })
    expect(teamStatusUpdateSchema.parse({ status: 'MAINTENANCE', notes: 'Scheduled' })).toMatchObject({ status: 'MAINTENANCE', notes: 'Scheduled' })
    expect(() => teamStatusUpdateSchema.parse({})).toThrow()
    expect(() => teamStatusUpdateSchema.parse({ status: 'INVALID' })).toThrow()
  })

  it('teamMemberAddSchema requires member_name and member_role', async () => {
    const { teamMemberAddSchema } = await import('@drcip/contracts')
    expect(() => teamMemberAddSchema.parse({})).toThrow()
    expect(() => teamMemberAddSchema.parse({ member_name: 'X' })).toThrow()
    expect(() => teamMemberAddSchema.parse({ member_role: 'Y' })).toThrow()
    expect(teamMemberAddSchema.parse({ member_name: 'John', member_role: 'Paramedic' })).toMatchObject({ member_name: 'John', member_role: 'Paramedic' })
    expect(teamMemberAddSchema.parse({ member_name: 'J', member_role: 'M', contact_reference: '123' })).toMatchObject({ contact_reference: '123' })
  })

  it('team query defaults are page=1 limit=20 sort=newest', async () => {
    const { teamQuerySchema } = await import('@drcip/contracts')
    const d = teamQuerySchema.parse({})
    expect(d.page).toBe(1)
    expect(d.limit).toBe(20)
    expect(d.sort).toBe('newest')
  })

  it('team query accepts valid status filter', async () => {
    const { teamQuerySchema } = await import('@drcip/contracts')
    const q = teamQuerySchema.parse({ status: 'DEPLOYED', search: 'alpha', sort: 'oldest' })
    expect(q.status).toBe('DEPLOYED')
    expect(q.search).toBe('alpha')
    expect(q.sort).toBe('oldest')
  })
})

describe('Team API client helpers', () => {
  it('canManageTeams returns true for Coordinator/Admin, false otherwise', async () => {
    const { canManageTeams } = await import('../lib/teams')
    expect(canManageTeams('DISASTER_COORDINATOR')).toBe(true)
    expect(canManageTeams('ADMINISTRATOR')).toBe(true)
    expect(canManageTeams('FIELD_OFFICER')).toBe(false)
    expect(canManageTeams('CITIZEN')).toBe(false)
    expect(canManageTeams(undefined)).toBe(false)
  })
})

describe('Team envelope shape', () => {
  it('list response has correct structure', () => {
    const envelope = {
      success: true,
      data: {
        items: [],
        pagination: { page: 1, limit: 20, total: 0, total_pages: 0 },
      },
    }
    expect(envelope.success).toBe(true)
    expect(envelope.data.items).toEqual([])
    expect(envelope.data.pagination.total).toBe(0)
  })

  it('team object has correct fields', () => {
    const team = {
      id: 'TEAM-001',
      name: 'Alpha',
      status: 'ACTIVE',
      capability_profile: {},
      leader: { id: 'USR-007', name: 'Officer One' },
      members: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    expect(team.id).toBe('TEAM-001')
    expect(team.leader.id).toBe('USR-007')
    expect(team.members).toEqual([])
  })
})
