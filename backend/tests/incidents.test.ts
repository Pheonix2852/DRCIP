import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest'
import prisma from '../src/lib/prisma'
import bcrypt from 'bcryptjs'
import request from 'supertest'
import { testApp, createAuthedUser, createIncident, truncateTables, authHeader } from './helpers'

beforeAll(async () => {
  await truncateTables()

  // Seed a coordinator with incidents in known states so the list tests
  // exercise real PostGIS data end-to-end.
  const coord = await createAuthedUser('DISASTER_COORDINATOR')
  const citizen = await createAuthedUser('CITIZEN')

  await createIncident(citizen.token, {
    disaster_type: 'FLOOD',
    description: 'Heavy monsoon flooding near the river bank',
    latitude: 22.5,
    longitude: 88.4,
    people_affected: 8,
  })
  await createIncident(citizen.token, {
    disaster_type: 'FIRE',
    description: 'Industrial fire at the godown on Main Road',
    latitude: 22.6,
    longitude: 88.3,
    people_affected: 3,
  })
  const third = await createIncident(citizen.token, {
    disaster_type: 'FLOOD',
    description: 'Waterlogging after the cyclone in Salt Lake',
    latitude: 22.7,
    longitude: 88.2,
    people_affected: 12,
  })
  const thirdId = third.body.data.incident_id
  await request(testApp)
    .patch(`/api/v1/incidents/${thirdId}/triage`)
    .set('Authorization', `Bearer ${coord.token}`)
    .send({ confirmed_severity: 'HIGH', notes: 'requires boats' })

  // Third incident now has confirmedSeverity HIGH
  // Keep references for assertions
  ;(globalThis as Record<string, unknown>).__coordToken = coord.token
  ;(globalThis as Record<string, unknown>).__citizenToken = citizen.token
})

beforeEach(async () => {
  // No-op: dataset is stable per-run
})

afterAll(async () => {
  await prisma.$disconnect()
})

async function list(token: string, query: Record<string, unknown> = {}) {
  return request(testApp).get('/api/v1/incidents').query(query).set('Authorization', `Bearer ${token}`)
}

describe('GET /api/v1/incidents — filters, search, sort', () => {
  const coordToken = () => (globalThis as Record<string, unknown>).__coordToken as string

  it('returns coordinator-visible list sorted newest first by default', async () => {
    const res = await list(coordToken())
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.items.length).toBe(3)
    const created = res.body.data.items.map((i: { created_at: string }) => new Date(i.created_at).getTime())
    const sorted = [...created].sort((a, b) => b - a)
    expect(created).toEqual(sorted)
  })

  it('filters by status', async () => {
    const res = await list(coordToken(), { status: 'REPORTED' })
    expect(res.status).toBe(200)
    expect(res.body.data.items.length).toBe(2)
    expect(res.body.data.items.every((i: { status: string }) => i.status === 'REPORTED')).toBe(true)
  })

  it('filters by disaster type', async () => {
    const res = await list(coordToken(), { disaster_type: 'FIRE' })
    expect(res.body.data.items.length).toBe(1)
    expect(res.body.data.items[0].disaster_type).toBe('FIRE')
  })

  it('filters by confirmed severity', async () => {
    const res = await list(coordToken(), { severity: 'HIGH' })
    expect(res.body.data.items.length).toBe(1)
    expect(res.body.data.items[0].confirmed_severity).toBe('HIGH')
  })

  it('text search matches description (case-insensitive', async () => {
    const res = await list(coordToken(), { search: 'river' })
    expect(res.status).toBe(200)
    const items = res.body.data.items as { description: string }[]
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((i) => i.description.toLowerCase().includes('river'))).toBe(true)
  })

  it('text search matches public id', async () => {
    const resAll = await list(coordToken())
    const firstId = resAll.body.data.items[0].id
    const suffix = firstId.replace(/^INC-/, '')
    const res = await list(coordToken(), { search: suffix })
    expect(res.body.data.items.length).toBe(1)
    expect(res.body.data.items[0].id).toBe(firstId)
  })

  it('sort=oldest returns ascending createdAt', async () => {
    const res = await list(coordToken(), { sort: 'oldest' })
    const created = res.body.data.items.map((i: { created_at: string }) => new Date(i.created_at).getTime())
    const sorted = [...created].sort((a, b) => a - b)
    expect(created).toEqual(sorted)
  })

  it('paginates with limit and page', async () => {
    const res = await list(coordToken(), { limit: 2, page: 1 })
    expect(res.body.data.items.length).toBe(2)
    expect(res.body.data.pagination.total).toBe(3)
    expect(res.body.data.pagination.total_pages).toBe(2)

    const page2 = await list(coordToken(), { limit: 2, page: 2 })
    expect(page2.body.data.items.length).toBe(1)
  })

  it('rejects an oversized search term (bounded input)', async () => {
    const res = await list(coordToken(), { search: 'x'.repeat(300) })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('citizen list is scoped to the reporter', async () => {
    const citizenToken = (globalThis as Record<string, unknown>).__citizenToken as string
    const res = await list(citizenToken)
    expect(res.body.data.items.length).toBe(3)
  })
})

describe('PATCH /api/v1/incidents/:id/triage — RBAC', () => {
  const coordToken = () => (globalThis as Record<string, unknown>).__coordToken as string

  it('allows a DISASTER_COORDINATOR to triage', async () => {
    const created = await createIncident(coordToken(), { disaster_type: 'CYCLONE' })
    const id = created.body.data.incident_id
    const res = await request(testApp)
      .patch(`/api/v1/incidents/${id}/triage`)
      .set('Authorization', `Bearer ${coordToken()}`)
      .send({ confirmed_severity: 'MEDIUM' })
    expect(res.status).toBe(200)
    expect(res.body.data.confirmed_severity).toBe('MEDIUM')
  })

  it('rejects a FIELD_OFFICER with 403', async () => {
    const officer = await createAuthedUser('FIELD_OFFICER')
    const created = await createIncident(coordToken())
    const res = await request(testApp)
      .patch(`/api/v1/incidents/${created.body.data.incident_id}/triage`)
      .set('Authorization', `Bearer ${officer.token}`)
      .send({ confirmed_severity: 'HIGH' })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('rejects a CITIZEN with 403', async () => {
    const citizen = await createAuthedUser('CITIZEN')
    const created = await createIncident(coordToken())
    const res = await request(testApp)
      .patch(`/api/v1/incidents/${created.body.data.incident_id}/triage`)
      .set('Authorization', `Bearer ${citizen.token}`)
      .send({ confirmed_severity: 'HIGH' })
    expect(res.status).toBe(403)
  })

  it('records an AuditLog entry for the triage decision', async () => {
    const created = await createIncident(coordToken())
    const publicId = created.body.data.incident_id
    await request(testApp)
      .patch(`/api/v1/incidents/${publicId}/triage`)
      .set('Authorization', `Bearer ${coordToken()}`)
      .send({ confirmed_severity: 'CRITICAL', notes: 'fire dept esc' })
    const log = await prisma.auditLog.findFirst({
      where: { action: 'INCIDENT_TRIAGE', metadata: { path: ['incident_public_id'], equals: publicId } },
    })
    expect(log).not.toBeNull()
    const after = (log?.afterState as { confirmed_severity?: string }) ?? {}
    expect(after.confirmed_severity).toBe('CRITICAL')
  })

  it('rejects triage without a valid token', async () => {
    const created = await createIncident(coordToken())
    const res = await request(testApp)
      .patch(`/api/v1/incidents/${created.body.data.incident_id}/triage`)
      .send({ confirmed_severity: 'HIGH' })
    expect(res.status).toBe(401)
  })
})

describe('auth', () => {
  const coordToken = () => (globalThis as Record<string, unknown>).__coordToken as string

  it('returns 401 on wrong password', async () => {
    const res = await request(testApp).post('/api/v1/auth/login').send({ email: 'admin@drcip.local', password: 'wrong-password' })
    expect(res.status).toBe(401)
  })

  it('rejects incidents query with invalid enum via error envelope', async () => {
    const res = await list(coordToken(), { status: 'NOT_A_STATUS' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})