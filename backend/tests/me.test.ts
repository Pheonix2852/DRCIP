import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import prisma from '../src/lib/prisma'
import { testApp, createAuthedUser, truncateTables } from './helpers'

const API = '/api/v1/me'

beforeAll(async () => {
  await truncateTables()
})

beforeEach(async () => {
  await truncateTables()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('GET /api/v1/me', () => {
  it('returns the current user profile fields', async () => {
    const { user, token } = await createAuthedUser('CITIZEN')
    const res = await request(testApp).get(API).set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const data = res.body.data
    expect(data.id).toBe(user.publicId)
    expect(data.name).toBe(user.fullName)
    expect(data.email).toBe(user.email)
    expect(data.role).toBe('CITIZEN')
    expect(data.is_active).toBe(true)
    expect(data.created_at).toBeDefined()
  })
})

describe('POST /api/v1/me/password', () => {
  it('changes the password when the current password is correct', async () => {
    const { token } = await createAuthedUser('CITIZEN')
    const res = await request(testApp)
      .post(`${API}/password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'TempPassword123!', new_password: 'TempPassword456!' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('rejects an incorrect current password', async () => {
    const { token } = await createAuthedUser('CITIZEN')
    const res = await request(testApp)
      .post(`${API}/password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'WrongPassword999!', new_password: 'TempPassword456!' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_PASSWORD')
  })
})
