import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import prisma from '../src/lib/prisma'
import {
  testApp,
  createAuthedUser,
  createFieldOfficer,
  truncateTables,
  authHeader,
  loginToken,
  createTeam,
} from './helpers'

const API = '/api/v1/teams'
const ME_TEAM = '/api/v1/me/team'

beforeEach(async () => {
  await truncateTables()
})

// ─── Authentication & Authorization ───────────────────────────────────────────

describe('Teams — authentication & authorization', () => {
  it('rejects unauthenticated access (401)', async () => {
    const res = await request(testApp).get(API)
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('rejects a citizen on all team endpoints (403)', async () => {
    const { token } = await createAuthedUser('CITIZEN')
    const team = await createTeam()

    const calls = [
      request(testApp).get(API),
      request(testApp).post(API).send({}),
      request(testApp).get(`${API}/${team.publicId}`),
      request(testApp).patch(`${API}/${team.publicId}`).send({}),
      request(testApp).post(`${API}/${team.publicId}/members`).send({}),
      request(testApp).patch(`${API}/${team.publicId}/status`).send({}),
      request(testApp).get(ME_TEAM),
    ]
    for (const call of calls) {
      const res = await call.set(authHeader(token))
      expect(res.status).toBe(403)
    }
  })

  it('lets a Field Officer read teams but not create/update/add members', async () => {
    const officer = await createFieldOfficer()
    const token = await loginToken(officer.email)

    const list = await request(testApp).get(API).set(authHeader(token))
    expect(list.status).toBe(200)

    const create = await request(testApp).post(API).set(authHeader(token)).send({ name: 'X', leader_user_id: 'Y' })
    expect(create.status).toBe(403)

    const team = await createTeam()
    const patch = await request(testApp).patch(`${API}/${team.publicId}`).set(authHeader(token)).send({ name: 'Y' })
    expect(patch.status).toBe(403)

    const member = await request(testApp)
      .post(`${API}/${team.publicId}/members`)
      .set(authHeader(token))
      .send({ member_name: 'X', member_role: 'Y' })
    expect(member.status).toBe(403)
  })

  it('lets Coordinator/Admin perform full team management', async () => {
    for (const role of ['DISASTER_COORDINATOR', 'ADMINISTRATOR'] as const) {
      const { token } = await createAuthedUser(role)
      const officer = await createFieldOfficer()

      const createRes = await request(testApp)
        .post(API)
        .set(authHeader(token))
        .send({ name: `${role} Team`, leader_user_id: officer.publicId })
      expect(createRes.status).toBe(201)
      expect(createRes.body.data.id).toMatch(/^TEAM-/)

      const teamId = createRes.body.data.id

      const list = await request(testApp).get(API).set(authHeader(token))
      expect(list.status).toBe(200)
      expect(list.body.data.items.some((t: { id: string }) => t.id === teamId)).toBe(true)

      const detail = await request(testApp).get(`${API}/${teamId}`).set(authHeader(token))
      expect(detail.status).toBe(200)
      expect(detail.body.data.name).toBe(`${role} Team`)

      const update = await request(testApp).patch(`${API}/${teamId}`).set(authHeader(token)).send({ name: 'Updated' })
      expect(update.status).toBe(200)
      expect(update.body.data.name).toBe('Updated')
    }
  })
})

// ─── Team list scoping ────────────────────────────────────────────────────────

describe('Teams — list scoping', () => {
  it('Field Officer only sees their own team in the list', async () => {
    const officer = await createFieldOfficer()
    const ownTeam = await createTeam({ leaderUserId: officer.id })
    await createTeam() // another team led by a different officer

    const token = await loginToken(officer.email)
    const res = await request(testApp).get(API).set(authHeader(token))
    expect(res.status).toBe(200)
    expect(res.body.data.items.length).toBe(1)
    expect(res.body.data.items[0].id).toBe(ownTeam.publicId)
  })

  it('Coordinator sees all teams', async () => {
    await createTeam()
    await createTeam()
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const res = await request(testApp).get(API).set(authHeader(token))
    expect(res.body.data.items.length).toBe(2)
  })

  it('Field Officer cannot view another team detail (404)', async () => {
    const officer = await createFieldOfficer()
    const other = await createTeam() // led by a different officer
    const token = await loginToken(officer.email)

    const res = await request(testApp).get(`${API}/${other.publicId}`).set(authHeader(token))
    expect(res.status).toBe(404)
  })
})

// ─── Team CRUD & Leader Validation ───────────────────────────────────────────

describe('Teams — create validation', () => {
  it('rejects missing required fields', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const res = await request(testApp).post(API).set(authHeader(token)).send({})
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects a non-existent leader', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const res = await request(testApp).post(API).set(authHeader(token)).send({ name: 'T1', leader_user_id: 'USR-DOESNOT' })
    expect(res.status).toBe(400)
  })

  it('rejects a non-FIELD_OFFICER leader', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const admin = await createAuthedUser('ADMINISTRATOR')
    const res = await request(testApp).post(API).set(authHeader(token)).send({ name: 'T1', leader_user_id: admin.user.publicId })
    expect(res.status).toBe(400)
  })

  it('returns 409 when a Field Officer already leads another team', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const officer = await createFieldOfficer()

    await request(testApp).post(API).set(authHeader(token)).send({ name: 'T1', leader_user_id: officer.publicId })
    const res = await request(testApp).post(API).set(authHeader(token)).send({ name: 'T2', leader_user_id: officer.publicId })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('LEADER_CONFLICT')
  })

  it('creates a team and writes audit log', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const officer = await createFieldOfficer()

    const res = await request(testApp).post(API).set(authHeader(token)).send({ name: 'Alpha', leader_user_id: officer.publicId })
    expect(res.status).toBe(201)

    const audit = await prisma.auditLog.findFirst({ where: { action: 'TEAM_CREATE' } })
    expect(audit).not.toBeNull()
    expect((audit?.afterState as { name?: string })?.name).toBe('Alpha')
  })
})

// ─── Team Update ─────────────────────────────────────────────────────────────

describe('Teams — update validation', () => {
  it('rejects an empty update', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const team = await createTeam()
    const res = await request(testApp).patch(`${API}/${team.publicId}`).set(authHeader(token)).send({})
    expect(res.status).toBe(400)
  })

  it('rejects immutable fields (leader_user_id on update)', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const team = await createTeam()
    const res = await request(testApp).patch(`${API}/${team.publicId}`).set(authHeader(token)).send({ leader_user_id: 'USR-X' })
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown team', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const res = await request(testApp).patch(`${API}/TEAM-UNKNOWN`).set(authHeader(token)).send({ name: 'X' })
    expect(res.status).toBe(404)
  })

  it('updates team and writes audit log', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const team = await createTeam({ name: 'Before' })

    const res = await request(testApp).patch(`${API}/${team.publicId}`).set(authHeader(token)).send({ name: 'After' })
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('After')

    const audit = await prisma.auditLog.findFirst({ where: { action: 'TEAM_UPDATE' } })
    expect(audit).not.toBeNull()
    expect((audit?.afterState as { name?: string })?.name).toBe('After')
  })
})

// ─── Team Status ─────────────────────────────────────────────────────────────

describe('Teams — status update', () => {
  it('Coordinator can update team status', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const team = await createTeam()

    const res = await request(testApp).patch(`${API}/${team.publicId}/status`).set(authHeader(token)).send({ status: 'DEPLOYED' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('DEPLOYED')
  })

  it('rejects invalid status', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const team = await createTeam()

    const res = await request(testApp).patch(`${API}/${team.publicId}/status`).set(authHeader(token)).send({ status: 'NOPE' })
    expect(res.status).toBe(400)
  })

  it('Field Officer can update their own team status', async () => {
    const officer = await createFieldOfficer()
    const team = await createTeam({ leaderUserId: officer.id })

    const token = await loginToken(officer.email)
    const res = await request(testApp).patch(`${API}/${team.publicId}/status`).set(authHeader(token)).send({ status: 'MAINTENANCE' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('MAINTENANCE')
  })

  it('Field Officer cannot update another team status', async () => {
    const officer1 = await createFieldOfficer()
    const officer2 = await createFieldOfficer()
    const team2 = await createTeam({ leaderUserId: officer2.id })

    const token = await loginToken(officer1.email)
    const res = await request(testApp).patch(`${API}/${team2.publicId}/status`).set(authHeader(token)).send({ status: 'UNAVAILABLE' })
    expect(res.status).toBe(403)
  })

  it('writes audit log on status update', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const team = await createTeam()

    await request(testApp).patch(`${API}/${team.publicId}/status`).set(authHeader(token)).send({ status: 'UNAVAILABLE' })
    const audit = await prisma.auditLog.findFirst({ where: { action: 'TEAM_STATUS_UPDATE' } })
    expect(audit).not.toBeNull()
    expect((audit?.afterState as { status?: string })?.status).toBe('UNAVAILABLE')
  })
})

// ─── Members ─────────────────────────────────────────────────────────────────

describe('Teams — members', () => {
  it('Coordinator can add members', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const team = await createTeam()

    const res = await request(testApp)
      .post(`${API}/${team.publicId}/members`)
      .set(authHeader(token))
      .send({ member_name: 'John Doe', member_role: 'Paramedic' })
    expect(res.status).toBe(201)
    expect(res.body.data.member_name).toBe('John Doe')
  })

  it('rejects missing member fields', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const team = await createTeam()

    const res = await request(testApp).post(`${API}/${team.publicId}/members`).set(authHeader(token)).send({})
    expect(res.status).toBe(400)
  })

  it('returns 404 when adding member to unknown team', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const res = await request(testApp)
      .post(`${API}/TEAM-UNKNOWN/members`)
      .set(authHeader(token))
      .send({ member_name: 'X', member_role: 'Y' })
    expect(res.status).toBe(404)
  })

  it('writes audit log on member add', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const team = await createTeam()

    await request(testApp)
      .post(`${API}/${team.publicId}/members`)
      .set(authHeader(token))
      .send({ member_name: 'Jane', member_role: 'Medic' })

    const audit = await prisma.auditLog.findFirst({ where: { action: 'TEAM_MEMBER_ADD' } })
    expect(audit).not.toBeNull()
  })
})

// ─── GET /me/team ────────────────────────────────────────────────────────────

describe('Teams — /me/team', () => {
  it('Field Officer sees their own team', async () => {
    const officer = await createFieldOfficer()
    const team = await createTeam({ leaderUserId: officer.id })

    const token = await loginToken(officer.email)
    const res = await request(testApp).get(ME_TEAM).set(authHeader(token))
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(team.publicId)
  })

  it('Field Officer with no team gets 404', async () => {
    const officer = await createFieldOfficer()
    const token = await loginToken(officer.email)

    const res = await request(testApp).get(ME_TEAM).set(authHeader(token))
    expect(res.status).toBe(404)
  })

  it('Coordinator is denied /me/team (Field Officer operations only)', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const res = await request(testApp).get(ME_TEAM).set(authHeader(token))
    expect(res.status).toBe(403)
  })
})

// ─── Not-Found & Error Cases ─────────────────────────────────────────────────

describe('Teams — not-found & error cases', () => {
  it('returns 404 for unknown team detail', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const res = await request(testApp).get(`${API}/TEAM-UNKNOWN`).set(authHeader(token))
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('returns correct error envelope on validation failure', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const res = await request(testApp).post(API).set(authHeader(token)).send({})
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBeDefined()
    expect(res.body.request_id).toBeDefined()
  })
})
