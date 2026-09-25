import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import prisma from '../src/lib/prisma'
import { publicId } from '../src/lib/publicId'
import {
  createResourceSchema,
  updateResourceSchema,
  resourceQuerySchema,
  createTeamSchema,
  updateTeamSchema,
  teamQuerySchema,
  teamMemberAddSchema,
  teamStatusUpdateSchema,
  createShelterSchema,
  updateShelterSchema,
  shelterQuerySchema,
  shelterStatusSchema,
  TEAM_STATUSES,
  SHELTER_STATUSES,
} from '@drcip/contracts'
import { createResource, createShelter, createTeam, createFieldOfficer, truncateTables } from './helpers'

beforeAll(async () => {
  await truncateTables()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('publicId helper', () => {
  it('produces prefixed uppercase ids for the Phase 3 entity prefixes', () => {
    for (const prefix of ['RES', 'TEAM', 'SHL']) {
      const id = publicId(prefix)
      expect(id).toMatch(new RegExp(`^${prefix}-[0-9A-F]{8}$`))
    }
  })

  it('produces distinct ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => publicId('RES')))
    expect(ids.size).toBe(50)
  })
})

describe('Resource contract validation', () => {
  const valid = {
    resource_type: 'AMBULANCE',
    name: 'Ambulance 1',
    status: 'AVAILABLE',
    quantity: 2,
    latitude: 22.5726,
    longitude: 88.3639,
  }

  it('accepts a valid resource', () => {
    expect(createResourceSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a negative quantity', () => {
    expect(createResourceSchema.safeParse({ ...valid, quantity: -1 }).success).toBe(false)
  })

  it('rejects an unknown resource type', () => {
    expect(createResourceSchema.safeParse({ ...valid, resource_type: 'SUBMARINE' }).success).toBe(false)
  })

  it('rejects out-of-range coordinates', () => {
    expect(createResourceSchema.safeParse({ ...valid, latitude: 120 }).success).toBe(false)
    expect(createResourceSchema.safeParse({ ...valid, longitude: 200 }).success).toBe(false)
  })

  it('requires latitude and longitude to be supplied together', () => {
    expect(createResourceSchema.safeParse({ ...valid, longitude: undefined }).success).toBe(false)
    expect(createResourceSchema.safeParse({ ...valid, latitude: undefined }).success).toBe(false)
  })

  it('allows a resource without a location', () => {
    const { latitude: _lat, longitude: _lng, ...noLocation } = valid
    expect(createResourceSchema.safeParse(noLocation).success).toBe(true)
  })

  it('applies query defaults', () => {
    const q = resourceQuerySchema.parse({})
    expect(q.page).toBe(1)
    expect(q.limit).toBe(20)
    expect(q.sort).toBe('newest')
  })

  it('coerces numeric query params from strings', () => {
    const q = resourceQuerySchema.parse({ page: '3', limit: '5' })
    expect(q.page).toBe(3)
    expect(q.limit).toBe(5)
  })

  it('update schema is partial and does not allow resource_type changes', () => {
    expect(updateResourceSchema.safeParse({ status: 'DEPLOYED' }).success).toBe(true)
    expect(updateResourceSchema.safeParse({ resource_type: 'FOOD' }).success).toBe(false)
  })
})

describe('Team contract validation', () => {
  it('accepts a valid team', () => {
    expect(createTeamSchema.safeParse({ name: 'Team Alpha', leader_user_id: 'USR-001' }).success).toBe(true)
  })

  it('requires a leader', () => {
    expect(createTeamSchema.safeParse({ name: 'Team Alpha' }).success).toBe(false)
  })

  it('validates the team status vocabulary', () => {
    for (const status of Object.values(TEAM_STATUSES)) {
      expect(teamStatusUpdateSchema.safeParse({ status }).success).toBe(true)
    }
    expect(teamStatusUpdateSchema.safeParse({ status: 'ON_BREAK' }).success).toBe(false)
  })

  it('requires member name and role', () => {
    expect(teamMemberAddSchema.safeParse({ member_name: 'A', member_role: 'MEDIC' }).success).toBe(true)
    expect(teamMemberAddSchema.safeParse({ member_name: 'A' }).success).toBe(false)
  })

  it('update schema and query schema follow conventions', () => {
    expect(updateTeamSchema.safeParse({ name: 'Renamed' }).success).toBe(true)
    expect(teamQuerySchema.parse({}).sort).toBe('newest')
  })
})

describe('Shelter contract validation', () => {
  const valid = {
    name: 'Shelter 1',
    latitude: 22.5726,
    longitude: 88.3639,
    total_capacity: 100,
    current_occupancy: 10,
  }

  it('accepts a valid shelter', () => {
    expect(createShelterSchema.safeParse(valid).success).toBe(true)
  })

  it('requires a location', () => {
    const { latitude: _lat, longitude: _lng, ...noLocation } = valid
    expect(createShelterSchema.safeParse(noLocation).success).toBe(false)
  })

  it('rejects occupancy greater than capacity', () => {
    expect(createShelterSchema.safeParse({ ...valid, current_occupancy: 101 }).success).toBe(false)
  })

  it('validates the shelter status vocabulary', () => {
    for (const status of Object.values(SHELTER_STATUSES)) {
      expect(shelterStatusSchema.safeParse(status).success).toBe(true)
    }
    expect(shelterStatusSchema.safeParse('CLOSED').success).toBe(false)
  })

  it('applies query defaults and supports capacity filtering', () => {
    const q = shelterQuerySchema.parse({})
    expect(q.page).toBe(1)
    expect(q.limit).toBe(20)
    expect(q.sort).toBe('newest')
    expect(shelterQuerySchema.parse({ min_available_capacity: '5' }).min_available_capacity).toBe(5)
  })
})

describe('spatial persistence (PostGIS geography round-trip)', () => {
  it('stores and reads a Resource location as lng/lat', async () => {
    const created = await createResource({ latitude: 22.5726, longitude: 88.3639 })
    const rows = await prisma.$queryRaw<{ lng: number; lat: number }[]>`
      SELECT ST_X("location"::geometry)::float AS lng, ST_Y("location"::geometry)::float AS lat
      FROM "Resource" WHERE "publicId" = ${created.publicId}
    `
    expect(rows[0].lng).toBeCloseTo(88.3639, 6)
    expect(rows[0].lat).toBeCloseTo(22.5726, 6)
  })

  it('stores a null Resource location as NULL', async () => {
    const created = await createResource({ latitude: null, longitude: null })
    const rows = await prisma.$queryRaw<{ isNull: boolean }[]>`
      SELECT ("location" IS NULL) AS "isNull" FROM "Resource" WHERE "publicId" = ${created.publicId}
    `
    expect(rows[0].isNull).toBe(true)
  })

  it('stores and reads a Shelter location as lng/lat', async () => {
    const created = await createShelter({ latitude: 22.58, longitude: 88.37 })
    const rows = await prisma.$queryRaw<{ lng: number; lat: number }[]>`
      SELECT ST_X("location"::geometry)::float AS lng, ST_Y("location"::geometry)::float AS lat
      FROM "Shelter" WHERE "publicId" = ${created.publicId}
    `
    expect(rows[0].lng).toBeCloseTo(88.37, 6)
    expect(rows[0].lat).toBeCloseTo(22.58, 6)
  })

  it('enforces the ShelterStatus enum at the database level', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "Shelter" ("id","publicId","name","location","totalCapacity","currentOccupancy","status","capabilities","createdAt","updatedAt")
         VALUES (gen_random_uuid(), 'SHL-BAD', 'Bad', ST_SetSRID(ST_MakePoint(88.0,22.0),4326)::geography, 1, 0, 'CLOSED', '{}'::jsonb, now(), now())`,
      ),
    ).rejects.toThrow()
  })

  it('accepts a valid ShelterStatus value', async () => {
    const created = await createShelter({ status: 'FULL', total_capacity: 5, current_occupancy: 5 })
    const rows = await prisma.$queryRaw<{ status: string }[]>`
      SELECT "status"::text AS status FROM "Shelter" WHERE "publicId" = ${created.publicId}
    `
    expect(rows[0].status).toBe('FULL')
  })
})

describe('Field Team foundation', () => {
  it('creates a team whose leader is a Field Officer', async () => {
    const officer = await createFieldOfficer()
    const team = await createTeam({ leaderUserId: officer.id, name: 'Team Bravo' })
    expect(team.publicId).toMatch(/^TEAM-/)
    const rows = await prisma.$queryRaw<{ role: string; leaderUserId: string }[]>`
      SELECT u."role"::text AS role, t."leaderUserId" AS "leaderUserId"
      FROM "FieldTeam" t JOIN "User" u ON u."id" = t."leaderUserId"
      WHERE t."id" = ${team.id}
    `
    expect(rows[0].role).toBe('FIELD_OFFICER')
    expect(rows[0].leaderUserId).toBe(officer.id)
  })
})