import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import prisma from '../src/lib/prisma'
import {
  testApp,
  createAuthedUser,
  createFieldOfficer,
  createResource,
  createTeam,
  createShelter,
  createIncident,
  authHeader,
  truncateTables,
  loginToken,
} from './helpers'

const API = '/api/v1/assignments'

beforeAll(async () => {
  await truncateTables()
})

beforeEach(async () => {
  await truncateTables()
})

afterAll(async () => {
  await prisma.$disconnect()
})

async function makeIncident(): Promise<string> {
  const citizen = await createAuthedUser('CITIZEN')
  const res = await createIncident(citizen.token)
  return res.body.data.incident_id as string
}

function createReq(token: string, incidentId: string, body: Record<string, unknown>) {
  return request(testApp)
    .post(`/api/v1/incidents/${incidentId}/assignments`)
    .set(authHeader(token))
    .send(body)
}

async function coordToken() {
  return (await createAuthedUser('DISASTER_COORDINATOR')).token
}

describe('Assignment authentication & authorization', () => {
  it('rejects unauthenticated access (401)', async () => {
    const incidentId = await makeIncident()
    const list = await request(testApp).get(API)
    expect(list.status).toBe(401)

    const create = await createReq('no-token', incidentId, { items: [] })
    expect(create.status).toBe(401)
    expect(create.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('denies a Citizen on every assignment endpoint (403)', async () => {
    const { token } = await createAuthedUser('CITIZEN')
    const incidentId = await makeIncident()
    const resource = await createResource()

    const create = await createReq(token, incidentId, {
      items: [{ resource_type: 'AMBULANCE', resource_id: resource.publicId, quantity: 1 }],
    })
    expect(create.status).toBe(403)
    expect(create.body.error.code).toBe('FORBIDDEN')

    expect((await request(testApp).get(API).set(authHeader(token))).status).toBe(403)
    expect((await request(testApp).get(`${API}/ASN-X`).set(authHeader(token))).status).toBe(403)
    expect((await request(testApp).patch(`${API}/ASN-X/status`).set(authHeader(token)).send({ status: 'IN_PROGRESS' })).status).toBe(403)
    expect((await request(testApp).post(`${API}/ASN-X/events`).set(authHeader(token)).send({ event_type: 'EN_ROUTE' })).status).toBe(403)
  })

  it('lets a Coordinator and Administrator create assignments', async () => {
    for (const role of ['DISASTER_COORDINATOR', 'ADMINISTRATOR'] as const) {
      const { token } = await createAuthedUser(role)
      const incidentId = await makeIncident()
      const resource = await createResource()

      const res = await createReq(token, incidentId, {
        items: [{ resource_type: 'AMBULANCE', resource_id: resource.publicId, quantity: 1 }],
      })
      expect(res.status).toBe(201)
      expect(res.body.data.id).toMatch(/^ASN-/)
      expect(res.body.data.status).toBe('ASSIGNED')
    }
  })

  it('denies a Field Officer creation and lifecycle mutations (403)', async () => {
    const officer = await createFieldOfficer()
    const token = await loginToken(officer.email)
    const incidentId = await makeIncident()
    const resource = await createResource()

    const create = await createReq(token, incidentId, {
      items: [{ resource_type: 'AMBULANCE', resource_id: resource.publicId, quantity: 1 }],
    })
    expect(create.status).toBe(403)

    const coord = await coordToken()
    const created = await createReq(coord, incidentId, {
      items: [{ resource_type: 'AMBULANCE', resource_id: resource.publicId, quantity: 1 }],
    })
    const id = created.body.data.id
    expect((await request(testApp).patch(`${API}/${id}/status`).set(authHeader(token)).send({ status: 'IN_PROGRESS' })).status).toBe(403)
    expect((await request(testApp).post(`${API}/${id}/events`).set(authHeader(token)).send({ event_type: 'EN_ROUTE' })).status).toBe(403)
  })
})

describe('Assignment creation — happy path and atomic state changes', () => {
  it('creates a mixed assignment and atomically updates resource/team/shelter/incident', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const resource = await createResource({ status: 'AVAILABLE', quantity: 5 })
    const officer = await createFieldOfficer()
    const team = await createTeam({ leaderUserId: officer.id, status: 'ACTIVE' })
    const shelter = await createShelter({ total_capacity: 100, current_occupancy: 0, status: 'AVAILABLE' })

    const res = await createReq(token, incidentId, {
      items: [
        { resource_type: 'AMBULANCE', resource_id: resource.publicId, quantity: 2 },
        { team_id: team.publicId, quantity: 1 },
        { shelter_id: shelter.publicId, quantity: 10 },
      ],
      notes: 'Mixed allocation',
    })

    expect(res.status).toBe(201)
    const data = res.body.data
    expect(data.status).toBe('ASSIGNED')
    expect(data.field_team_id).toBe(team.publicId)
    expect(data.incident_id).toBe(incidentId)
    expect(data.items).toHaveLength(3)
    const resourceItem = data.items.find((i: { resource_id: string | null }) => i.resource_id === resource.publicId)
    const teamItem = data.items.find((i: { team_id: string | null }) => i.team_id === team.publicId)
    const shelterItem = data.items.find((i: { shelter_id: string | null }) => i.shelter_id === shelter.publicId)
    expect(resourceItem.resource_type).toBe('AMBULANCE')
    expect(teamItem.resource_type).toBeNull()
    expect(shelterItem.resource_type).toBeNull()
    expect(data.events).toHaveLength(1)
    expect(data.events[0].event_type).toBe('CREATED')

    const resourceRow = await prisma.resource.findUniqueOrThrow({ where: { id: resource.id } })
    expect(resourceRow.status).toBe('ASSIGNED')
    expect(Number(resourceRow.quantity)).toBe(5)

    const teamRow = await prisma.fieldTeam.findUniqueOrThrow({ where: { id: team.id } })
    expect(teamRow.status).toBe('DEPLOYED')

    const shelterRow = await prisma.shelter.findUniqueOrThrow({ where: { id: shelter.id } })
    expect(shelterRow.currentOccupancy).toBe(10)
    expect(shelterRow.status).toBe('AVAILABLE')

    const incidentRow = await prisma.incident.findUniqueOrThrow({ where: { publicId: incidentId } })
    expect(incidentRow.status).toBe('IN_RESPONSE')

    const audit = await prisma.auditLog.findFirst({ where: { action: 'ASSIGNMENT_CREATE' } })
    expect(audit).not.toBeNull()
    expect((audit?.afterState as { public_id?: string })?.public_id).toBe(data.id)
  })

  it('marks a shelter FULL when capacity is reached', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const shelter = await createShelter({ total_capacity: 10, current_occupancy: 8, status: 'AVAILABLE' })

    const res = await createReq(token, incidentId, {
      items: [{ shelter_id: shelter.publicId, quantity: 2 }],
    })
    expect(res.status).toBe(201)

    const shelterRow = await prisma.shelter.findUniqueOrThrow({ where: { id: shelter.id } })
    expect(shelterRow.currentOccupancy).toBe(10)
    expect(shelterRow.status).toBe('FULL')
  })

  it('keeps an already IN_RESPONSE incident in response', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const first = await createResource()
    await createReq(token, incidentId, {
      items: [{ resource_type: 'AMBULANCE', resource_id: first.publicId, quantity: 1 }],
    })

    const second = await createResource()
    const res = await createReq(token, incidentId, {
      items: [{ resource_type: 'FOOD', resource_id: second.publicId, quantity: 1 }],
    })
    expect(res.status).toBe(201)
    const incidentRow = await prisma.incident.findUniqueOrThrow({ where: { publicId: incidentId } })
    expect(incidentRow.status).toBe('IN_RESPONSE')
  })
})

describe('Assignment creation — validation (422)', () => {
  it('returns 404 for an unknown incident', async () => {
    const token = await coordToken()
    const resource = await createResource()
    const res = await createReq(token, 'INC-NOPE', {
      items: [{ resource_type: 'AMBULANCE', resource_id: resource.publicId, quantity: 1 }],
    })
    expect(res.status).toBe(404)
  })

  it('rejects an empty item list (400)', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const res = await createReq(token, incidentId, { items: [] })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects an item referencing more than one entity (400)', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const resource = await createResource()
    const shelter = await createShelter()
    const res = await createReq(token, incidentId, {
      items: [{ resource_type: 'AMBULANCE', resource_id: resource.publicId, shelter_id: shelter.publicId, quantity: 1 }],
    })
    expect(res.status).toBe(400)
  })

  it('rejects a Field Team item carrying a resource_type (400)', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const res = await createReq(token, incidentId, {
      items: [{ resource_type: 'RESCUE_TEAM', team_id: 'TEAM-X', quantity: 1 }],
    })
    expect(res.status).toBe(400)
  })

  it('rejects a Shelter item carrying a resource_type (400)', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const res = await createReq(token, incidentId, {
      items: [{ resource_type: 'SHELTER', shelter_id: 'SHL-X', quantity: 1 }],
    })
    expect(res.status).toBe(400)
  })

  it('rejects a Field Team item whose quantity is not 1 (400)', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const res = await createReq(token, incidentId, {
      items: [{ team_id: 'TEAM-X', quantity: 2 }],
    })
    expect(res.status).toBe(400)
  })

  it('rejects a Shelter item with a fractional quantity (400)', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const res = await createReq(token, incidentId, {
      items: [{ shelter_id: 'SHL-X', quantity: 1.5 }],
    })
    expect(res.status).toBe(400)
  })

  it('rejects quantity above resource stock (422)', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const resource = await createResource({ quantity: 1 })
    const res = await createReq(token, incidentId, {
      items: [{ resource_type: 'AMBULANCE', resource_id: resource.publicId, quantity: 5 }],
    })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('INSUFFICIENT_QUANTITY')
  })

  it('rejects an unavailable resource (422)', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const resource = await createResource({ status: 'UNAVAILABLE' })
    const res = await createReq(token, incidentId, {
      items: [{ resource_type: 'AMBULANCE', resource_id: resource.publicId, quantity: 1 }],
    })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('RESOURCE_UNAVAILABLE')
  })

  it('rejects an inactive team (422)', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const officer = await createFieldOfficer()
    const team = await createTeam({ leaderUserId: officer.id, status: 'UNAVAILABLE' })
    const res = await createReq(token, incidentId, {
      items: [{ team_id: team.publicId, quantity: 1 }],
    })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('TEAM_UNAVAILABLE')
  })

  it('rejects shelter capacity overflow (422)', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const shelter = await createShelter({ total_capacity: 10, current_occupancy: 9, status: 'AVAILABLE' })
    const res = await createReq(token, incidentId, {
      items: [{ shelter_id: shelter.publicId, quantity: 5 }],
    })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('SHELTER_CAPACITY_EXCEEDED')
  })

  it('rejects unknown references (422)', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const res = await createReq(token, incidentId, {
      items: [{ resource_type: 'AMBULANCE', resource_id: 'RES-UNKNOWN', quantity: 1 }],
    })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('INVALID_REFERENCE')
  })

  it('regression: reproduces the browser 422 — mixed payload referencing nonexistent RES-001/TEAM-001/SHL-001', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const res = await createReq(token, incidentId, {
      items: [
        { resource_type: 'AMBULANCE', resource_id: 'RES-001', quantity: 1 },
        { team_id: 'TEAM-001', quantity: 1 },
        { shelter_id: 'SHL-001', quantity: 20 },
      ],
    })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('INVALID_REFERENCE')
    expect(res.body.error.message).toBe('Unknown resource RES-001')

    const incident = await prisma.incident.findUnique({ where: { publicId: incidentId }, select: { status: true } })
    expect(incident?.status).toBe('REPORTED')
  })

  it('rejects an unknown Field Team reference (422) with a specific message', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const res = await createReq(token, incidentId, {
      items: [{ team_id: 'TEAM-001', quantity: 1 }],
    })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('INVALID_REFERENCE')
    expect(res.body.error.message).toBe('Unknown field team TEAM-001')
  })

  it('rejects an unknown Shelter reference (422) with a specific message', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const res = await createReq(token, incidentId, {
      items: [{ shelter_id: 'SHL-001', quantity: 20 }],
    })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('INVALID_REFERENCE')
    expect(res.body.error.message).toBe('Unknown shelter SHL-001')
  })

  it('rejects more than one Field Team item (422)', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const t1 = await createTeam()
    const t2 = await createTeam()
    const res = await createReq(token, incidentId, {
      items: [
        { team_id: t1.publicId, quantity: 1 },
        { team_id: t2.publicId, quantity: 1 },
      ],
    })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('MULTIPLE_TEAMS')
  })

  it('rejects assignment to a resolved incident (422)', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    await prisma.incident.update({ where: { publicId: incidentId }, data: { status: 'RESOLVED' } })
    const resource = await createResource()
    const res = await createReq(token, incidentId, {
      items: [{ resource_type: 'AMBULANCE', resource_id: resource.publicId, quantity: 1 }],
    })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('INCIDENT_RESOLVED')
  })
})

describe('Assignment creation — atomic rollback', () => {
  it('rolls back all state when a later item fails', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const available = await createResource({ status: 'AVAILABLE' })
    const unavailable = await createResource({ status: 'UNAVAILABLE' })

    const res = await createReq(token, incidentId, {
      items: [
        { resource_type: 'AMBULANCE', resource_id: available.publicId, quantity: 1 },
        { resource_type: 'AMBULANCE', resource_id: unavailable.publicId, quantity: 1 },
      ],
    })
    expect(res.status).toBe(422)

    const availableRow = await prisma.resource.findUniqueOrThrow({ where: { id: available.id } })
    expect(availableRow.status).toBe('AVAILABLE')

    const assignmentCount = await prisma.assignment.count()
    expect(assignmentCount).toBe(0)

    const incidentRow = await prisma.incident.findUniqueOrThrow({ where: { publicId: incidentId } })
    expect(incidentRow.status).toBe('REPORTED')
  })
})

describe('Assignment list & detail', () => {
  it('lists and filters assignments for a coordinator', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const resource = await createResource()
    const created = await createReq(token, incidentId, {
      items: [{ resource_type: 'AMBULANCE', resource_id: resource.publicId, quantity: 1 }],
    })

    const list = await request(testApp).get(API).set(authHeader(token))
    expect(list.status).toBe(200)
    expect(list.body.data.items).toHaveLength(1)

    const filtered = await request(testApp).get(API).query({ incident_id: incidentId }).set(authHeader(token))
    expect(filtered.body.data.items).toHaveLength(1)

    const none = await request(testApp).get(API).query({ incident_id: 'INC-NOPE' }).set(authHeader(token))
    expect(none.body.data.items).toHaveLength(0)

    const detail = await request(testApp).get(`${API}/${created.body.data.id}`).set(authHeader(token))
    expect(detail.status).toBe(200)
    expect(detail.body.data.id).toBe(created.body.data.id)
  })

  it('scopes Field Officer access to their own team and returns 404 otherwise', async () => {
    const coord = await coordToken()
    const incidentId = await makeIncident()

    const ownOfficer = await createFieldOfficer()
    const ownToken = await loginToken(ownOfficer.email)
    const ownTeam = await createTeam({ leaderUserId: ownOfficer.id })
    const ownRes = await createReq(coord, incidentId, {
      items: [{ team_id: ownTeam.publicId, quantity: 1 }],
    })

    const otherOfficer = await createFieldOfficer()
    const otherToken = await loginToken(otherOfficer.email)
    const otherTeam = await createTeam({ leaderUserId: otherOfficer.id })
    await createReq(coord, incidentId, {
      items: [{ team_id: otherTeam.publicId, quantity: 1 }],
    })

    const ownList = await request(testApp).get(API).set(authHeader(ownToken))
    expect(ownList.body.data.items).toHaveLength(1)
    expect(ownList.body.data.items[0].field_team_id).toBe(ownTeam.publicId)

    const meList = await request(testApp).get('/api/v1/me/assignments').set(authHeader(ownToken))
    expect(meList.status).toBe(200)
    expect(meList.body.data.items).toHaveLength(1)

    const ownDetail = await request(testApp).get(`${API}/${ownRes.body.data.id}`).set(authHeader(ownToken))
    expect(ownDetail.status).toBe(200)

    const otherDetail = await request(testApp).get(`${API}/${ownRes.body.data.id}`).set(authHeader(otherToken))
    expect(otherDetail.status).toBe(404)
  })

  it('denies /me/assignments to a coordinator (403)', async () => {
    const token = await coordToken()
    expect((await request(testApp).get('/api/v1/me/assignments').set(authHeader(token))).status).toBe(403)
  })
})

describe('Assignment lifecycle transitions', () => {
  async function setupAssigned() {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const resource = await createResource({ status: 'AVAILABLE' })
    const officer = await createFieldOfficer()
    const team = await createTeam({ leaderUserId: officer.id, status: 'ACTIVE' })
    const shelter = await createShelter({ total_capacity: 50, current_occupancy: 0 })
    const created = await createReq(token, incidentId, {
      items: [
        { resource_type: 'AMBULANCE', resource_id: resource.publicId, quantity: 1 },
        { team_id: team.publicId, quantity: 1 },
        { shelter_id: shelter.publicId, quantity: 4 },
      ],
    })
    return { token, id: created.body.data.id as string, resource, team, shelter }
  }

  it('transitions ASSIGNED -> IN_PROGRESS and records startedAt + event', async () => {
    const { token, id } = await setupAssigned()
    const res = await request(testApp).patch(`${API}/${id}/status`).set(authHeader(token)).send({ status: 'IN_PROGRESS' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('IN_PROGRESS')
    expect(res.body.data.started_at).not.toBeNull()

    const events = await prisma.assignmentEvent.findMany({ where: { assignment: { publicId: id } } })
    expect(events.some((e) => e.eventType === 'IN_PROGRESS')).toBe(true)

    const audit = await prisma.auditLog.findFirst({ where: { action: 'ASSIGNMENT_STATUS_UPDATE' } })
    expect((audit?.afterState as { status?: string })?.status).toBe('IN_PROGRESS')
  })

  it('cancels from ASSIGNED and reverses resource/team/shelter state', async () => {
    const { token, id, resource, team, shelter } = await setupAssigned()
    const res = await request(testApp).patch(`${API}/${id}/status`).set(authHeader(token)).send({ status: 'CANCELLED', notes: 'No longer needed' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('CANCELLED')

    expect((await prisma.resource.findUniqueOrThrow({ where: { id: resource.id } })).status).toBe('AVAILABLE')
    expect((await prisma.fieldTeam.findUniqueOrThrow({ where: { id: team.id } })).status).toBe('ACTIVE')
    expect((await prisma.shelter.findUniqueOrThrow({ where: { id: shelter.id } })).currentOccupancy).toBe(0)
  })

  it('cancels from IN_PROGRESS and reverses state', async () => {
    const { token, id, resource, team, shelter } = await setupAssigned()
    await request(testApp).patch(`${API}/${id}/status`).set(authHeader(token)).send({ status: 'IN_PROGRESS' })
    const res = await request(testApp).patch(`${API}/${id}/status`).set(authHeader(token)).send({ status: 'CANCELLED' })
    expect(res.status).toBe(200)

    expect((await prisma.resource.findUniqueOrThrow({ where: { id: resource.id } })).status).toBe('AVAILABLE')
    expect((await prisma.fieldTeam.findUniqueOrThrow({ where: { id: team.id } })).status).toBe('ACTIVE')
    expect((await prisma.shelter.findUniqueOrThrow({ where: { id: shelter.id } })).currentOccupancy).toBe(0)
  })

  it('rejects an invalid transition (422)', async () => {
    const { token, id } = await setupAssigned()
    await request(testApp).patch(`${API}/${id}/status`).set(authHeader(token)).send({ status: 'CANCELLED' })
    const res = await request(testApp).patch(`${API}/${id}/status`).set(authHeader(token)).send({ status: 'IN_PROGRESS' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('INVALID_TRANSITION')
  })

  it('rejects COMPLETED from ASSIGNED via PATCH status (422)', async () => {
    const { token, id } = await setupAssigned()
    const res = await request(testApp).patch(`${API}/${id}/status`).set(authHeader(token)).send({ status: 'COMPLETED' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('INVALID_TRANSITION')
  })
})

describe('Assignment operational events', () => {
  it('records an operational event and audit entry', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const resource = await createResource()
    const created = await createReq(token, incidentId, {
      items: [{ resource_type: 'AMBULANCE', resource_id: resource.publicId, quantity: 1 }],
    })

    const res = await request(testApp)
      .post(`${API}/${created.body.data.id}/events`)
      .set(authHeader(token))
      .send({ event_type: 'EN_ROUTE', notes: 'Team en route' })
    expect(res.status).toBe(201)
    expect(res.body.data.event_type).toBe('EN_ROUTE')

    const events = await prisma.assignmentEvent.findMany({ where: { assignment: { publicId: created.body.data.id } } })
    expect(events.some((e) => e.eventType === 'EN_ROUTE')).toBe(true)

    const audit = await prisma.auditLog.findFirst({ where: { action: 'ASSIGNMENT_EVENT_RECORD' } })
    expect(audit).not.toBeNull()
  })

  it('rejects CREATED as a manual event type (400)', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const resource = await createResource()
    const created = await createReq(token, incidentId, {
      items: [{ resource_type: 'AMBULANCE', resource_id: resource.publicId, quantity: 1 }],
    })
    const res = await request(testApp)
      .post(`${API}/${created.body.data.id}/events`)
      .set(authHeader(token))
      .send({ event_type: 'CREATED' })
    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// Phase 5 — Field updates, assignment completion, incident resolution
// ---------------------------------------------------------------------------

const FIELD_API = (id: string) => `${API}/${id}/field-updates`

async function setupForFieldUpdate() {
  const token = await coordToken()
  const incidentId = await makeIncident()
  const resource = await createResource({ status: 'AVAILABLE', quantity: 5 })
  const officer = await createFieldOfficer()
  const team = await createTeam({ leaderUserId: officer.id, status: 'ACTIVE' })
  const shelter = await createShelter({ total_capacity: 100, current_occupancy: 0 })
  const created = await createReq(token, incidentId, {
    items: [
      { resource_type: 'AMBULANCE', resource_id: resource.publicId, quantity: 2 },
      { team_id: team.publicId, quantity: 1 },
      { shelter_id: shelter.publicId, quantity: 10 },
    ],
  })
  const officerToken = await loginToken(officer.email)
  return {
    coordToken: token,
    officerToken,
    officer,
    incidentId,
    resource,
    team,
    shelter,
    assignmentId: created.body.data.id as string,
  }
}

describe('Field updates — event-only (EN_ROUTE / ARRIVED / BLOCKED)', () => {
  it('records EN_ROUTE and does not change assignment status', async () => {
    const { officerToken, assignmentId, resource, team, shelter } = await setupForFieldUpdate()
    const res = await request(testApp)
      .post(FIELD_API(assignmentId))
      .set(authHeader(officerToken))
      .send({ event_type: 'EN_ROUTE', notes: 'Team en route' })
    expect(res.status).toBe(201)
    expect(res.body.data.event_type).toBe('EN_ROUTE')

    const detail = await request(testApp).get(`${API}/${assignmentId}`).set(authHeader(officerToken))
    expect(detail.body.data.status).toBe('ASSIGNED')
    expect(detail.body.data.events.some((e: { event_type: string }) => e.event_type === 'EN_ROUTE')).toBe(true)

    const resourceRow = await prisma.resource.findUniqueOrThrow({ where: { id: resource.id } })
    expect(resourceRow.status).toBe('ASSIGNED')
    const teamRow = await prisma.fieldTeam.findUniqueOrThrow({ where: { id: team.id } })
    expect(teamRow.status).toBe('DEPLOYED')
    const shelterRow = await prisma.shelter.findUniqueOrThrow({ where: { id: shelter.id } })
    expect(shelterRow.currentOccupancy).toBe(10)

    const audit = await prisma.auditLog.findFirst({ where: { action: 'ASSIGNMENT_FIELD_UPDATE' } })
    expect(audit).not.toBeNull()
  })

  it('records ARRIVED event', async () => {
    const { officerToken, assignmentId } = await setupForFieldUpdate()
    const res = await request(testApp)
      .post(FIELD_API(assignmentId))
      .set(authHeader(officerToken))
      .send({ event_type: 'ARRIVED' })
    expect(res.status).toBe(201)
  })

  it('records BLOCKED event', async () => {
    const { officerToken, assignmentId } = await setupForFieldUpdate()
    const res = await request(testApp)
      .post(FIELD_API(assignmentId))
      .set(authHeader(officerToken))
      .send({ event_type: 'BLOCKED', notes: 'Road flooded' })
    expect(res.status).toBe(201)
  })
})

describe('Field updates — IN_PROGRESS transition', () => {
  it('transitions ASSIGNED → IN_PROGRESS via field update', async () => {
    const { officerToken, assignmentId, resource, team, shelter } = await setupForFieldUpdate()
    const res = await request(testApp)
      .post(FIELD_API(assignmentId))
      .set(authHeader(officerToken))
      .send({ event_type: 'IN_PROGRESS', notes: 'Starting operations' })
    expect(res.status).toBe(201)

    const detail = await request(testApp).get(`${API}/${assignmentId}`).set(authHeader(officerToken))
    expect(detail.body.data.status).toBe('IN_PROGRESS')
    expect(detail.body.data.started_at).not.toBeNull()

    const events = await prisma.assignmentEvent.findMany({ where: { assignment: { publicId: assignmentId } } })
    expect(events.some((e) => e.eventType === 'IN_PROGRESS')).toBe(true)

    const resourceRow = await prisma.resource.findUniqueOrThrow({ where: { id: resource.id } })
    expect(resourceRow.status).toBe('ASSIGNED')
    const teamRow = await prisma.fieldTeam.findUniqueOrThrow({ where: { id: team.id } })
    expect(teamRow.status).toBe('DEPLOYED')
    const shelterRow = await prisma.shelter.findUniqueOrThrow({ where: { id: shelter.id } })
    expect(shelterRow.currentOccupancy).toBe(10)
  })

  it('rejects COMPLETED from ASSIGNED (422)', async () => {
    const { officerToken, assignmentId } = await setupForFieldUpdate()
    const res = await request(testApp)
      .post(FIELD_API(assignmentId))
      .set(authHeader(officerToken))
      .send({ event_type: 'COMPLETED' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('INVALID_TRANSITION')
  })
})

describe('Field updates — COMPLETED transition + resource release', () => {
  it('COMPLETED from IN_PROGRESS releases resource/team/shelter', async () => {
    const { officerToken, assignmentId, resource, team, shelter } = await setupForFieldUpdate()

    await request(testApp)
      .post(FIELD_API(assignmentId))
      .set(authHeader(officerToken))
      .send({ event_type: 'IN_PROGRESS' })

    const res = await request(testApp)
      .post(FIELD_API(assignmentId))
      .set(authHeader(officerToken))
      .send({ event_type: 'COMPLETED', notes: 'Area cleared' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('COMPLETED')
    expect(res.body.data.completed_at).not.toBeNull()

    const resourceRow = await prisma.resource.findUniqueOrThrow({ where: { id: resource.id } })
    expect(resourceRow.status).toBe('AVAILABLE')
    const teamRow = await prisma.fieldTeam.findUniqueOrThrow({ where: { id: team.id } })
    expect(teamRow.status).toBe('ACTIVE')
    const shelterRow = await prisma.shelter.findUniqueOrThrow({ where: { id: shelter.id } })
    expect(shelterRow.currentOccupancy).toBe(0)

    const events = await prisma.assignmentEvent.findMany({ where: { assignment: { publicId: assignmentId } } })
    expect(events.some((e) => e.eventType === 'COMPLETED')).toBe(true)

    const audit = await prisma.auditLog.findFirst({ where: { action: 'ASSIGNMENT_FIELD_COMPLETE' } })
    expect(audit).not.toBeNull()
  })

  it('rejects COMPLETED on a COMPLETED assignment (422)', async () => {
    const { officerToken, assignmentId } = await setupForFieldUpdate()
    await request(testApp).post(FIELD_API(assignmentId)).set(authHeader(officerToken)).send({ event_type: 'IN_PROGRESS' })
    await request(testApp).post(FIELD_API(assignmentId)).set(authHeader(officerToken)).send({ event_type: 'COMPLETED' })

    const res = await request(testApp)
      .post(FIELD_API(assignmentId))
      .set(authHeader(officerToken))
      .send({ event_type: 'COMPLETED' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('INVALID_TRANSITION')
  })
})

describe('Field updates — RBAC and scoping', () => {
  it('rejects unauthenticated access (401)', async () => {
    const { assignmentId } = await setupForFieldUpdate()
    const res = await request(testApp)
      .post(FIELD_API(assignmentId))
      .send({ event_type: 'EN_ROUTE' })
    expect(res.status).toBe(401)
  })

  it('rejects a Coordinator submitting field updates (403)', async () => {
    const { coordToken: token, assignmentId } = await setupForFieldUpdate()
    const res = await request(testApp)
      .post(FIELD_API(assignmentId))
      .set(authHeader(token))
      .send({ event_type: 'EN_ROUTE' })
    expect(res.status).toBe(403)
  })

  it('rejects a Field Officer on another teams assignment (404)', async () => {
    const { assignmentId } = await setupForFieldUpdate()
    const otherOfficer = await createFieldOfficer()
    const otherToken = await loginToken(otherOfficer.email)
    const res = await request(testApp)
      .post(FIELD_API(assignmentId))
      .set(authHeader(otherToken))
      .send({ event_type: 'EN_ROUTE' })
    expect(res.status).toBe(404)
  })

  it('rejects field update on a CANCELLED assignment (422)', async () => {
    const { coordToken: token, officerToken, assignmentId } = await setupForFieldUpdate()
    await request(testApp).patch(`${API}/${assignmentId}/status`).set(authHeader(token)).send({ status: 'CANCELLED' })
    const res = await request(testApp)
      .post(FIELD_API(assignmentId))
      .set(authHeader(officerToken))
      .send({ event_type: 'EN_ROUTE' })
    expect(res.status).toBe(422)
  })
})

describe('Coordinator/Admin COMPLETED via PATCH status', () => {
  it('COMPLETED from IN_PROGRESS via PATCH status releases resources', async () => {
    const { coordToken: token, assignmentId, resource, team, shelter } = await setupForFieldUpdate()
    await request(testApp).patch(`${API}/${assignmentId}/status`).set(authHeader(token)).send({ status: 'IN_PROGRESS' })

    const res = await request(testApp)
      .patch(`${API}/${assignmentId}/status`)
      .set(authHeader(token))
      .send({ status: 'COMPLETED', notes: 'Admin override' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('COMPLETED')
    expect(res.body.data.completed_at).not.toBeNull()

    const resourceRow = await prisma.resource.findUniqueOrThrow({ where: { id: resource.id } })
    expect(resourceRow.status).toBe('AVAILABLE')
    const teamRow = await prisma.fieldTeam.findUniqueOrThrow({ where: { id: team.id } })
    expect(teamRow.status).toBe('ACTIVE')
    const shelterRow = await prisma.shelter.findUniqueOrThrow({ where: { id: shelter.id } })
    expect(shelterRow.currentOccupancy).toBe(0)
  })
})

describe('Incident resolution', () => {
  const RESOLVE_API = '/api/v1/incidents'

  async function setupResolution() {
    const { coordToken: token, incidentId, assignmentId, officerToken, resource, team, shelter } = await setupForFieldUpdate()
    return { token, incidentId, assignmentId, officerToken, resource, team, shelter }
  }

  it('resolves an IN_RESPONSE incident after all assignments completed', async () => {
    const { token, incidentId, assignmentId, officerToken } = await setupResolution()
    await request(testApp).post(FIELD_API(assignmentId)).set(authHeader(officerToken)).send({ event_type: 'IN_PROGRESS' })
    await request(testApp).post(FIELD_API(assignmentId)).set(authHeader(officerToken)).send({ event_type: 'COMPLETED' })

    const res = await request(testApp)
      .patch(`${RESOLVE_API}/${incidentId}/resolve`)
      .set(authHeader(token))
      .send({ notes: 'All teams completed. Incident resolved.' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('RESOLVED')
    expect(res.body.data.resolved_at).not.toBeNull()

    const incidentRow = await prisma.incident.findUniqueOrThrow({ where: { publicId: incidentId } })
    expect(incidentRow.status).toBe('RESOLVED')
    expect(incidentRow.resolvedAt).not.toBeNull()

    const audit = await prisma.auditLog.findFirst({ where: { action: 'INCIDENT_RESOLVE' } })
    expect(audit).not.toBeNull()
  })

  it('rejects resolution with active assignments (422)', async () => {
    const { token, incidentId } = await setupResolution()
    const res = await request(testApp)
      .patch(`${RESOLVE_API}/${incidentId}/resolve`)
      .set(authHeader(token))
      .send({ notes: 'Trying too early.' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('ASSIGNMENTS_ACTIVE')
  })

  it('rejects resolution when no assignments exist (422)', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    await prisma.incident.update({ where: { publicId: incidentId }, data: { status: 'IN_RESPONSE' } })

    const res = await request(testApp)
      .patch(`${RESOLVE_API}/${incidentId}/resolve`)
      .set(authHeader(token))
      .send({ notes: 'No assignments were made.' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('NO_ASSIGNMENTS')
  })

  it('rejects resolution when incident is not IN_RESPONSE (400)', async () => {
    const token = await coordToken()
    const incidentId = await makeIncident()
    const res = await request(testApp)
      .patch(`${RESOLVE_API}/${incidentId}/resolve`)
      .set(authHeader(token))
      .send({ notes: 'Trying on REPORTED incident.' })
    expect(res.status).toBe(400)
  })

  it('rejects Field Officer resolving (403)', async () => {
    const { officerToken, incidentId } = await setupResolution()
    const res = await request(testApp)
      .patch(`${RESOLVE_API}/${incidentId}/resolve`)
      .set(authHeader(officerToken))
      .send({ notes: 'Not allowed.' })
    expect(res.status).toBe(403)
  })

  it('rejects resolution without notes (400)', async () => {
    const { token, incidentId, assignmentId, officerToken } = await setupResolution()
    await request(testApp).post(FIELD_API(assignmentId)).set(authHeader(officerToken)).send({ event_type: 'IN_PROGRESS' })
    await request(testApp).post(FIELD_API(assignmentId)).set(authHeader(officerToken)).send({ event_type: 'COMPLETED' })
    const res = await request(testApp)
      .patch(`${RESOLVE_API}/${incidentId}/resolve`)
      .set(authHeader(token))
      .send({})
    expect(res.status).toBe(400)
  })

  it('rejects resolution with empty notes (400)', async () => {
    const { token, incidentId, assignmentId, officerToken } = await setupResolution()
    await request(testApp).post(FIELD_API(assignmentId)).set(authHeader(officerToken)).send({ event_type: 'IN_PROGRESS' })
    await request(testApp).post(FIELD_API(assignmentId)).set(authHeader(officerToken)).send({ event_type: 'COMPLETED' })
    const res = await request(testApp)
      .patch(`${RESOLVE_API}/${incidentId}/resolve`)
      .set(authHeader(token))
      .send({ notes: '   ' })
    expect(res.status).toBe(400)
  })
})
