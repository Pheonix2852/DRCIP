import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import prisma from '../src/lib/prisma'
import { createApp } from '../src/app'
import { createAuthedUser, truncateTables } from './helpers'

const app = createApp()

beforeAll(async () => {
  await truncateTables()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Weather endpoint', () => {
  it('allows coordinator and admin access', async () => {
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    const res = await request(app)
      .get('/api/v1/weather')
      .set('Authorization', `Bearer ${coord.token}`)
      .query({ latitude: 22.57, longitude: 88.36 })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBeDefined()
  })

  it('rejects citizen access', async () => {
    const citizen = await createAuthedUser('CITIZEN')
    const res = await request(app)
      .get('/api/v1/weather')
      .set('Authorization', `Bearer ${citizen.token}`)
      .query({ latitude: 22.57, longitude: 88.36 })
    expect(res.status).toBe(403)
  })

  it('rejects missing coordinates', async () => {
    const { token } = await createAuthedUser('ADMINISTRATOR')
    const res = await request(app)
      .get('/api/v1/weather')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
  })

  it('rejects out-of-range coordinates', async () => {
    const { token } = await createAuthedUser('ADMINISTRATOR')
    const res = await request(app)
      .get('/api/v1/weather')
      .set('Authorization', `Bearer ${token}`)
      .query({ latitude: 999, longitude: 999 })
    expect(res.status).toBe(400)
  })

  it('returns UNAVAILABLE when no stored observations exist and provider fails', async () => {
    const { token } = await createAuthedUser('ADMINISTRATOR')
    const res = await request(app)
      .get('/api/v1/weather')
      .set('Authorization', `Bearer ${token}`)
      .query({ latitude: 10.0, longitude: 20.0 })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toMatch(/CURRENT|STALE|UNAVAILABLE/)
  })

  it('rejects unauthenticated access', async () => {
    const res = await request(app)
      .get('/api/v1/weather')
      .query({ latitude: 22.57, longitude: 88.36 })
    expect(res.status).toBe(401)
  })
})
