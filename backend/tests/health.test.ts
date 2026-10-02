import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import prisma from '../src/lib/prisma'
import { testApp } from './helpers'

beforeAll(async () => {
  // health/version don't touch tables, but keep the DB lifecycle consistent
  await prisma.$queryRaw`SELECT 1`
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('GET /health', () => {
  it('returns the documented healthy envelope', async () => {
    const res = await request(testApp).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      status: 'healthy',
      database: 'connected',
    })
    expect(typeof res.body.timestamp).toBe('string')
  })
})

describe('GET /health/version', () => {
  it('returns the documented version envelope', async () => {
    const res = await request(testApp).get('/health/version')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      service: 'drcip-backend',
      version: '1.0.0',
    })
  })
})
