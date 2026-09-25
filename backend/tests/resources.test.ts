import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import prisma from '../src/lib/prisma'
import {
  testApp,
  createAuthedUser,
  createFieldOfficer,
  createResource,
  createTeam,
  authHeader,
  truncateTables,
  loginToken,
} from './helpers'

const API = '/api/v1/resources'

beforeAll(async () => {
  await truncateTables()
})

beforeEach(async () => {
  await truncateTables()
})

afterAll(async () => {
  await prisma.$disconnect()
})

// Actors must be created after the per-test truncation, so resolve per test.
const adminToken = async () => (await createAuthedUser('ADMINISTRATOR')).token

function validCreate(overrides: Record<string, unknown> = {}) {
  return {
    resource_type: 'AMBULANCE',
    name: 'Ambulance Alpha',
    status: 'AVAILABLE',
    quantity: 2,
    unit: 'vehicles',
    latitude: 22.5726,
    longitude: 88.3639,
    ...overrides,
  }
}

describe('Resource authentication & authorization', () => {
  it('rejects unauthenticated access (401)', async () => {
    const res = await request(testApp).get(API)
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
    expect(res.body.request_id).toBeDefined()
  })

  it('rejects a citizen on list/detail/create/update (403)', async () => {
    const { token } = await createAuthedUser('CITIZEN')
    const { publicId } = await createResource()

    const list = await request(testApp).get(API).set(authHeader(token))
    expect(list.status).toBe(403)
    expect(list.body.error.code).toBe('FORBIDDEN')

    const detail = await request(testApp).get(`${API}/${publicId}`).set(authHeader(token))
    expect(detail.status).toBe(403)

    const create = await request(testApp).post(API).set(authHeader(token)).send(validCreate())
    expect(create.status).toBe(403)

    const patch = await request(testApp).patch(`${API}/${publicId}`).set(authHeader(token)).send({ name: 'x' })
    expect(patch.status).toBe(403)
  })

  it('lets a Field Officer read but not mutate (read-only)', async () => {
    const { token } = await createAuthedUser('FIELD_OFFICER')
    const { publicId } = await createResource()

    const list = await request(testApp).get(API).set(authHeader(token))
    expect(list.status).toBe(200)
    expect(list.body.data.items.length).toBe(1)

    const detail = await request(testApp).get(`${API}/${publicId}`).set(authHeader(token))
    expect(detail.status).toBe(200)

    const create = await request(testApp).post(API).set(authHeader(token)).send(validCreate())
    expect(create.status).toBe(403)

    const patch = await request(testApp).patch(`${API}/${publicId}`).set(authHeader(token)).send({ name: 'x' })
    expect(patch.status).toBe(403)
  })

  it('lets a Coordinator and Administrator perform full CRUD', async () => {
    for (const role of ['DISASTER_COORDINATOR', 'ADMINISTRATOR'] as const) {
      const { token } = await createAuthedUser(role)

      const create = await request(testApp).post(API).set(authHeader(token)).send(validCreate({ name: `${role} resource` }))
      expect(create.status).toBe(201)
      expect(create.body.data.resource_id).toMatch(/^RES-/)

      const id = create.body.data.resource_id
      const patch = await request(testApp).patch(`${API}/${id}`).set(authHeader(token)).send({ status: 'DEPLOYED' })
      expect(patch.status).toBe(200)
      expect(patch.body.data.status).toBe('DEPLOYED')

      const detail = await request(testApp).get(`${API}/${id}`).set(authHeader(token))
      expect(detail.status).toBe(200)
      expect(detail.body.data.status).toBe('DEPLOYED')
    }
  })
})

describe('Resource create validation', () => {
  it('rejects missing required fields', async () => {
    const token = await adminToken()
    const res = await request(testApp).post(API).set(authHeader(token)).send({ name: 'no type' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects unknown resource types and statuses', async () => {
    const token = await adminToken()
    const badType = await request(testApp).post(API).set(authHeader(token)).send(validCreate({ resource_type: 'SUBMARINE' }))
    expect(badType.status).toBe(400)

    const badStatus = await request(testApp).post(API).set(authHeader(token)).send(validCreate({ status: 'ON_FIRE' }))
    expect(badStatus.status).toBe(400)
  })

  it('rejects negative quantity and capacity', async () => {
    const token = await adminToken()
    expect((await request(testApp).post(API).set(authHeader(token)).send(validCreate({ quantity: -1 }))).status).toBe(400)
    expect((await request(testApp).post(API).set(authHeader(token)).send(validCreate({ capacity: -5 }))).status).toBe(400)
  })

  it('accepts quantity 0 and capacity 0 as explicit values', async () => {
    const token = await adminToken()
    const res = await request(testApp)
      .post(API)
      .set(authHeader(token))
      .send(validCreate({ quantity: 0, capacity: 0 }))
    expect(res.status).toBe(201)
    const detail = await request(testApp).get(`${API}/${res.body.data.resource_id}`).set(authHeader(token))
    expect(detail.body.data.quantity).toBe(0)
    expect(detail.body.data.capacity).toBe(0)
  })

  it('rejects out-of-range coordinates and unmatched coordinate pairs', async () => {
    const token = await adminToken()
    expect((await request(testApp).post(API).set(authHeader(token)).send(validCreate({ latitude: 120 }))).status).toBe(400)
    expect((await request(testApp).post(API).set(authHeader(token)).send(validCreate({ longitude: 200 }))).status).toBe(400)
    const { longitude: _lng, ...noLng } = validCreate()
    expect((await request(testApp).post(API).set(authHeader(token)).send(noLng)).status).toBe(400)
  })

  it('does not persist a caller-supplied team linkage on create', async () => {
    const token = await adminToken()
    const officer = await createFieldOfficer()
    const team = await createTeam({ leaderUserId: officer.id })
    const res = await request(testApp)
      .post(API)
      .set(authHeader(token))
      .send(validCreate({ team_id: team.publicId, teamId: team.id }))
    expect(res.status).toBe(201)

    const detail = await request(testApp).get(`${API}/${res.body.data.resource_id}`).set(authHeader(token))
    expect(detail.body.data.team_id).toBeNull()
    expect(detail.body.data.is_own_team).toBe(false)
  })
})

describe('Resource update validation', () => {
  it('rejects an empty update', async () => {
    const token = await adminToken()
    const { publicId } = await createResource()
    const res = await request(testApp).patch(`${API}/${publicId}`).set(authHeader(token)).send({})
    expect(res.status).toBe(400)
  })

  it('rejects immutable fields', async () => {
    const token = await adminToken()
    const { publicId } = await createResource()
    expect(
      (await request(testApp).patch(`${API}/${publicId}`).set(authHeader(token)).send({ resource_type: 'FOOD' })).status,
    ).toBe(400)
    expect(
      (await request(testApp).patch(`${API}/${publicId}`).set(authHeader(token)).send({ team_id: 'TEAM-X' })).status,
    ).toBe(400)
    expect(
      (await request(testApp).patch(`${API}/${publicId}`).set(authHeader(token)).send({ public_id: 'RES-X' })).status,
    ).toBe(400)
  })

  it('rejects invalid enum / coordinate values on update', async () => {
    const token = await adminToken()
    const { publicId } = await createResource()
    expect((await request(testApp).patch(`${API}/${publicId}`).set(authHeader(token)).send({ status: 'NOPE' })).status).toBe(400)
    expect((await request(testApp).patch(`${API}/${publicId}`).set(authHeader(token)).send({ latitude: 999 })).status).toBe(400)
    expect((await request(testApp).patch(`${API}/${publicId}`).set(authHeader(token)).send({ quantity: -3 })).status).toBe(400)
  })

  it('returns 404 for an unknown resource', async () => {
    const token = await adminToken()
    const res = await request(testApp).patch(`${API}/RES-DOESNOTEXIST`).set(authHeader(token)).send({ name: 'x' })
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })
})

describe('Resource spatial persistence and nearby filtering', () => {
  it('round-trips coordinates through PostGIS', async () => {
    const token = await adminToken()
    const res = await request(testApp)
      .post(API)
      .set(authHeader(token))
      .send(validCreate({ latitude: 22.5726, longitude: 88.3639 }))
    expect(res.status).toBe(201)
    const detail = await request(testApp).get(`${API}/${res.body.data.resource_id}`).set(authHeader(token))
    expect(detail.body.data.latitude).toBeCloseTo(22.5726, 6)
    expect(detail.body.data.longitude).toBeCloseTo(88.3639, 6)
  })

  it('filters by ST_DWithin radius', async () => {
    const token = await adminToken()
    const near = await createResource({ name: 'Near', latitude: 22.5726, longitude: 88.3639 })
    const far = await createResource({ name: 'Far', latitude: 19.076, longitude: 72.8777 })

    const res = await request(testApp)
      .get(API)
      .query({ nearby_lat: 22.57, nearby_lng: 88.36, nearby_radius_km: 10 })
      .set(authHeader(token))
    expect(res.status).toBe(200)
    const ids = res.body.data.items.map((i: { id: string }) => i.id)
    expect(ids).toContain(near.publicId)
    expect(ids).not.toContain(far.publicId)
  })

  it('rejects incomplete nearby filters', async () => {
    const token = await adminToken()
    const res = await request(testApp).get(API).query({ nearby_lat: 22.57 }).set(authHeader(token))
    expect(res.status).toBe(400)
  })
})

describe('Resource list filters, pagination and sorting', () => {
  it('filters by type, status, capability and search', async () => {
    const token = await adminToken()
    await createResource({ name: 'Ambulance Alpha', resource_type: 'AMBULANCE', status: 'AVAILABLE', capability_profile: { capability: 'ADVANCED_LIFE_SUPPORT' } })
    await createResource({ name: 'Food Supply', resource_type: 'FOOD', status: 'DEPLOYED', capability_profile: {} })

    const byType = await request(testApp).get(API).query({ resource_type: 'AMBULANCE' }).set(authHeader(token))
    expect(byType.body.data.items.every((i: { resource_type: string }) => i.resource_type === 'AMBULANCE')).toBe(true)

    const byStatus = await request(testApp).get(API).query({ status: 'DEPLOYED' }).set(authHeader(token))
    expect(byStatus.body.data.items.length).toBe(1)
    expect(byStatus.body.data.items[0].resource_type).toBe('FOOD')

    const byCapability = await request(testApp).get(API).query({ capability: 'ADVANCED_LIFE_SUPPORT' }).set(authHeader(token))
    expect(byCapability.body.data.items.length).toBe(1)
    expect(byCapability.body.data.items[0].name).toBe('Ambulance Alpha')

    const bySearch = await request(testApp).get(API).query({ search: 'alpha' }).set(authHeader(token))
    expect(bySearch.body.data.items.length).toBe(1)
    expect(bySearch.body.data.items[0].name).toBe('Ambulance Alpha')
  })

  it('paginates and sorts', async () => {
    const token = await adminToken()
    await createResource({ name: 'R1' })
    await createResource({ name: 'R2' })
    await createResource({ name: 'R3' })

    const page1 = await request(testApp).get(API).query({ limit: 2, page: 1, sort: 'oldest' }).set(authHeader(token))
    expect(page1.body.data.items.length).toBe(2)
    expect(page1.body.data.pagination).toMatchObject({ page: 1, limit: 2, total: 3, total_pages: 2 })
    expect(page1.body.data.items[0].name).toBe('R1')

    const page2 = await request(testApp).get(API).query({ limit: 2, page: 2, sort: 'oldest' }).set(authHeader(token))
    expect(page2.body.data.items.length).toBe(1)
    expect(page2.body.data.items[0].name).toBe('R3')
  })
})

describe('Resource audit and not-found', () => {
  it('writes audit entries on create and update', async () => {
    const token = await adminToken()
    const create = await request(testApp).post(API).set(authHeader(token)).send(validCreate())
    const id = create.body.data.resource_id

    const createLog = await prisma.auditLog.findFirst({ where: { action: 'RESOURCE_CREATE' } })
    expect(createLog).not.toBeNull()
    expect((createLog?.afterState as { public_id?: string })?.public_id).toBe(id)

    await request(testApp).patch(`${API}/${id}`).set(authHeader(token)).send({ status: 'UNAVAILABLE' })
    const updateLog = await prisma.auditLog.findFirst({ where: { action: 'RESOURCE_UPDATE' } })
    expect(updateLog).not.toBeNull()
    expect((updateLog?.afterState as { status?: string })?.status).toBe('UNAVAILABLE')
  })

  it('returns 404 with the common envelope for an unknown resource', async () => {
    const token = await adminToken()
    const res = await request(testApp).get(`${API}/RES-UNKNOWN`).set(authHeader(token))
    expect(res.status).toBe(404)
    expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } })
    expect(res.body.request_id).toBeDefined()
  })
})

describe('Field Officer own-team contextualization', () => {
  it('flags resources linked to the officer own team', async () => {
    const officer = await createFieldOfficer()
    const token = await loginToken(officer.email)
    const team = await createTeam({ leaderUserId: officer.id })

    const own = await createResource({ name: 'Own team resource' })
    await prisma.resource.update({ where: { id: own.id }, data: { teamId: team.id } })

    const other = await createResource({ name: 'Other resource' })

    const res = await request(testApp).get(API).set(authHeader(token))
    expect(res.status).toBe(200)
    const ownRow = res.body.data.items.find((i: { id: string }) => i.id === own.publicId)
    const otherRow = res.body.data.items.find((i: { id: string }) => i.id === other.publicId)
    expect(ownRow.team_id).toBe(team.publicId)
    expect(ownRow.is_own_team).toBe(true)
    expect(otherRow.is_own_team).toBe(false)
  })
})
