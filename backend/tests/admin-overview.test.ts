import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import prisma from '../src/lib/prisma'
import { testApp, createAuthedUser, truncateTables } from './helpers'

const API = '/api/v1/admin/overview'

beforeAll(async () => {
  await truncateTables()
})

beforeEach(async () => {
  await truncateTables()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('GET /api/v1/admin/overview', () => {
  it('returns 403 for a non-administrator', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const res = await request(testApp).get(API).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })

  it('returns 200 with the count structure for an administrator', async () => {
    const { token } = await createAuthedUser('ADMINISTRATOR')
    const res = await request(testApp).get(API).set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const data = res.body.data
    expect(typeof data.users.total).toBe('number')
    expect(typeof data.users.active).toBe('number')
    expect(data.users.by_role).toBeDefined()
    expect(typeof data.incidents.total).toBe('number')
    expect(typeof data.resources.total).toBe('number')
    expect(typeof data.teams.total).toBe('number')
    expect(typeof data.teams.active).toBe('number')
    expect(typeof data.shelters.total).toBe('number')
    expect(data.health.status).toBe('ok')
  })
})
