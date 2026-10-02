import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import { createUser, createAuthedUser, authHeader, truncateTables } from './helpers'
import prisma from '../src/lib/prisma'

// Snapshot of the env vitest injects (NODE_ENV=test, JWT_SECRET=test-jwt-secret-key)
const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  JWT_SECRET: process.env.JWT_SECRET,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
}

function restoreEnv() {
  if (originalEnv.NODE_ENV === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalEnv.NODE_ENV
  if (originalEnv.JWT_SECRET === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalEnv.JWT_SECRET
  if (originalEnv.CORS_ORIGIN === undefined) delete process.env.CORS_ORIGIN
  else process.env.CORS_ORIGIN = originalEnv.CORS_ORIGIN
}

beforeEach(() => {
  // Fresh module registry for every env-sensitive assertion so
  // module-level fail-safes re-evaluate against the mutated env.
  vi.resetModules()
})

afterEach(() => {
  restoreEnv()
  vi.resetModules()
})

describe('JWT_SECRET production fail-safe', () => {
  it('production + missing JWT_SECRET -> startup/config error', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.JWT_SECRET

    await expect(import('../src/lib/auth')).rejects.toThrow(/FATAL: JWT_SECRET is not set/)
  })

  it('production + empty JWT_SECRET -> startup/config error', async () => {
    process.env.NODE_ENV = 'production'
    process.env.JWT_SECRET = ''

    await expect(import('../src/lib/auth')).rejects.toThrow(/FATAL: JWT_SECRET is not set/)
  })

  it('production + whitespace-only JWT_SECRET -> startup/config error', async () => {
    process.env.NODE_ENV = 'production'
    process.env.JWT_SECRET = '   '

    await expect(import('../src/lib/auth')).rejects.toThrow(/FATAL: JWT_SECRET is not set/)
  })

  it('production + valid JWT_SECRET -> module loads and tokens still sign/verify', async () => {
    process.env.NODE_ENV = 'production'
    process.env.JWT_SECRET = 'prod-test-secret-value-32-chars-min'

    const auth = await import('../src/lib/auth')
    const token = await auth.signToken({
      sub: 'usr_1',
      email: 'x@test.local',
      role: 'CITIZEN',
      name: 'Test',
      jti: 'SES-PROD-TEST',
    })
    const payload = await auth.verifyToken(token)
    expect(payload?.sub).toBe('usr_1')
    expect(payload?.jti).toBe('SES-PROD-TEST')
  })

  it('test/dev + missing JWT_SECRET -> historical non-production default retained', async () => {
    process.env.NODE_ENV = 'test'
    delete process.env.JWT_SECRET

    const auth = await import('../src/lib/auth')
    // Module must load (no throw) and behave as before: tokens sign/verify
    const token = await auth.signToken({
      sub: 'usr_2',
      email: 'y@test.local',
      role: 'FIELD_OFFICER',
      name: 'Officer',
      jti: 'SES-DEV-TEST',
    })
    const payload = await auth.verifyToken(token)
    expect(payload?.sub).toBe('usr_2')
  })
})

describe('CORS_ORIGIN production fail-safe', () => {
  it('production + missing CORS_ORIGIN -> startup/config error', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.CORS_ORIGIN

    expect(() => createApp()).toThrow(/FATAL: CORS_ORIGIN must be set in production/)
  })

  it('production + empty CORS_ORIGIN -> startup/config error', () => {
    process.env.NODE_ENV = 'production'
    process.env.CORS_ORIGIN = ''

    expect(() => createApp()).toThrow(/FATAL: CORS_ORIGIN must be set in production/)
  })

  it('production + whitespace/commas-only CORS_ORIGIN -> startup/config error', () => {
    process.env.NODE_ENV = 'production'
    process.env.CORS_ORIGIN = ' , , '

    expect(() => createApp()).toThrow(/FATAL: CORS_ORIGIN must be set in production/)
  })

  it('production + valid CORS_ORIGIN -> app starts and configured origin is accepted', async () => {
    process.env.NODE_ENV = 'production'
    process.env.JWT_SECRET = 'prod-test-secret-value-32-chars-min'
    process.env.CORS_ORIGIN = 'https://ops.example.com'

    const app = createApp()

    const res = await request(app)
      .get('/health/version')
      .set('Origin', 'https://ops.example.com')
    expect(res.status).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBe('https://ops.example.com')

    // Unknown origin must not receive the configured origin header
    const denied = await request(app)
      .get('/health/version')
      .set('Origin', 'https://evil.example.com')
    expect(denied.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('production + comma-separated CORS_ORIGIN -> both configured origins accepted', async () => {
    process.env.NODE_ENV = 'production'
    process.env.JWT_SECRET = 'prod-test-secret-value-32-chars-min'
    process.env.CORS_ORIGIN = 'https://ops.example.com,https://admin.example.com'

    const app = createApp()

    const a = await request(app)
      .get('/health/version')
      .set('Origin', 'https://ops.example.com')
    expect(a.headers['access-control-allow-origin']).toBe('https://ops.example.com')

    const b = await request(app)
      .get('/health/version')
      .set('Origin', 'https://admin.example.com')
    expect(b.headers['access-control-allow-origin']).toBe('https://admin.example.com')
  })

  it('non-production + missing CORS_ORIGIN -> historical "*" default retained', async () => {
    process.env.NODE_ENV = 'test'
    delete process.env.CORS_ORIGIN

    const app = createApp()
    const res = await request(app)
      .get('/health/version')
      .set('Origin', 'http://localhost:5173')
    expect(res.status).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBe('*')
  })
})

describe('Authenticated requests unaffected by config fail-safes', () => {
  beforeAll(async () => {
    await truncateTables()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('login + authenticated /api/v1/me still works under the standard test config', async () => {
    // Uses helpers.testApp, built at file load with vitest's test env
    // (NODE_ENV=test, JWT_SECRET=test-jwt-secret-key, CORS_ORIGIN unset).
    const user = await createUser('CITIZEN')
    const { token } = await createAuthedUser('CITIZEN')

    const login = await request(createApp())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'TempPassword123!' })
    expect(login.status).toBe(200)
    expect(login.body.data.access_token).toBeDefined()

    const me = await request(createApp())
      .get('/api/v1/me')
      .set(authHeader(token))
    expect(me.status).toBe(200)
    expect(me.body.data.role).toBe('CITIZEN')
  })
})
