import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { readFileSync } from 'node:fs'
import prisma from '../src/lib/prisma'
import { createApp } from '../src/app'
import { createUser, createAuthedUser, authHeader, truncateTables } from './helpers'
import { mockEmailLog, mockEmailSinkPath } from '../src/services/MockEmailProvider'

const app = createApp()

beforeAll(async () => {
  await truncateTables()
})

afterAll(async () => {
  await prisma.$disconnect()
})

beforeEach(async () => {
  await truncateTables()
  mockEmailLog.length = 0
})

describe('Session-based authentication', () => {
  it('login creates a session and returns a token with jti', async () => {
    const user = await createUser('CITIZEN')
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'TempPassword123!' })
    expect(res.status).toBe(200)
    expect(res.body.data.access_token).toBeDefined()
    expect(res.body.data.user.id).toBeDefined()

    // Session row should exist
    const sessions = await prisma.session.findMany({ where: { userId: user.id } })
    expect(sessions.length).toBe(1)
    expect(sessions[0].revokedAt).toBeNull()
    expect(sessions[0].expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('authenticated request with active session succeeds', async () => {
    const { user, token } = await createAuthedUser('CITIZEN')
    const res = await request(app)
      .get('/api/v1/me')
      .set(authHeader(token))
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBeDefined()
    expect(res.body.data.role).toBe('CITIZEN')
  })

  it('logout revokes the current session', async () => {
    const { token } = await createAuthedUser('CITIZEN')

    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set(authHeader(token))
    expect(logoutRes.status).toBe(200)

    // Token should now be rejected
    const meRes = await request(app)
      .get('/api/v1/me')
      .set(authHeader(token))
    expect(meRes.status).toBe(401)
    expect(meRes.body.error.code).toBe('SESSION_EXPIRED')
  })

  it('revoked token returns 401 on protected endpoints', async () => {
    const { token } = await createAuthedUser('FIELD_OFFICER')

    // Logout to revoke
    await request(app).post('/api/v1/auth/logout').set(authHeader(token))

    const res = await request(app)
      .get('/api/v1/me/team')
      .set(authHeader(token))
    expect(res.status).toBe(401)
  })

  it('login fails for inactive user', async () => {
    const user = await createUser('CITIZEN')
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } })

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'TempPassword123!' })
    expect(res.status).toBe(401)
  })

  it('login fails for wrong password', async () => {
    const user = await createUser('CITIZEN')
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'WrongPassword123!' })
    expect(res.status).toBe(401)
  })

  it('logout without token still returns success', async () => {
    const res = await request(app).post('/api/v1/auth/logout')
    expect(res.status).toBe(200)
  })
})

describe('Password reset flow', () => {
  it('returns generic response regardless of email existence', async () => {
    const res1 = await request(app)
      .post('/api/v1/auth/password-reset/request')
      .send({ email: 'nonexistent@test.local' })
    expect(res1.status).toBe(200)
    expect(res1.body.data.message).toBe('If the email exists, a reset link will be sent')

    const user = await createUser('CITIZEN')
    const res2 = await request(app)
      .post('/api/v1/auth/password-reset/request')
      .send({ email: user.email })
    expect(res2.status).toBe(200)
    expect(res2.body.data.message).toBe('If the email exists, a reset link will be sent')

    // A token should be stored for the valid email
    const tokens = await prisma.passwordResetToken.findMany({ where: { userId: user.id } })
    expect(tokens.length).toBe(1)
    expect(tokens[0].usedAt).toBeNull()
    expect(tokens[0].expiresAt.getTime()).toBeGreaterThan(Date.now())

    // Mock email must contain the actual reset URL for manual/local testing
    const last = mockEmailLog[mockEmailLog.length - 1]
    expect(last.recipientEmail).toBe(user.email)
    expect(last.body).toMatch(/\/#\/reset-password\?token=\w+/)

    // Stored token remains hashed (no plaintext)
    const rawToken = last.body.match(/token=([0-9a-f]{64})/)?.[1]
    expect(rawToken).toBeDefined()
    const stored = await prisma.passwordResetToken.findMany({ where: { userId: user.id } })
    const { createHash } = await import('crypto')
    expect(stored[0].tokenHash).not.toBe(rawToken)
    expect(stored[0].tokenHash).toBe(createHash('sha256').update(rawToken!).digest('hex'))

    // Response never contains the token
    expect(res2.body.data.token).toBeUndefined()
    expect(JSON.stringify(res2.body)).not.toContain(rawToken!)
  })

  it('full reset flow: request → email link → confirm → login, old session invalidated, link single-use', async () => {
    const { user, token: sessionToken } = await createAuthedUser('CITIZEN')

    // An authenticated session exists before the reset
    const pre = await request(app).get('/api/v1/me').set(authHeader(sessionToken))
    expect(pre.status).toBe(200)

    // Request a reset
    const reqRes = await request(app)
      .post('/api/v1/auth/password-reset/request')
      .send({ email: user.email })
    expect(reqRes.status).toBe(200)
    expect(reqRes.body.data.token).toBeUndefined()

    // Read the reset URL out of the mock email (same step a manual tester does)
    const last = mockEmailLog[mockEmailLog.length - 1]
    const rawToken = last.body.match(/token=([0-9a-f]{64})/)?.[1]
    expect(rawToken).toBeDefined()
    expect(last.body).toContain('#/reset-password?token=')

    // The dev-only sink file also has it (what the manual tester opens)
    const sink = readFileSync(mockEmailSinkPath(), 'utf8')
    expect(sink).toContain(user.email)
    expect(sink).toContain(`token=${rawToken}`)

    // Confirm with the new password
    const confirmRes = await request(app)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: rawToken, password: 'NewPass123!' })
    expect(confirmRes.status).toBe(200)

    // Existing authenticated session is now invalidated
    const afterReset = await request(app).get('/api/v1/me').set(authHeader(sessionToken))
    expect(afterReset.status).toBe(401)
    expect(afterReset.body.error.code).toBe('SESSION_EXPIRED')

    // Old password fails
    const oldLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'TempPassword123!' })
    expect(oldLogin.status).toBe(401)

    // New password succeeds
    const newLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'NewPass123!' })
    expect(newLogin.status).toBe(200)

    // Reusing the same reset link fails (single-use)
    const reuse = await request(app)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: rawToken, password: 'AnotherPass123!' })
    expect(reuse.status).toBe(400)
    expect(reuse.body.error.code).toBe('INVALID_TOKEN')

    // Token is consumed
    const tokenRow = await prisma.passwordResetToken.findMany({ where: { userId: user.id } })
    expect(tokenRow.length).toBe(1)
    expect(tokenRow[0].usedAt).not.toBeNull()
  })

  it('accepts a valid reset token and updates password', async () => {
    const user = await createUser('CITIZEN')

    // Manually create a reset token
    const { randomBytes, createHash } = await import('crypto')
    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    })

    const res = await request(app)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: rawToken, password: 'NewPass123!' })
    expect(res.status).toBe(200)

    // Previous sessions should be revoked
    const sessions = await prisma.session.findMany({ where: { userId: user.id } })
    expect(sessions.length).toBe(0)

    // Old password should no longer work
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'TempPassword123!' })
    expect(loginRes.status).toBe(401)

    // New password should work
    const loginRes2 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'NewPass123!' })
    expect(loginRes2.status).toBe(200)

    // Token should be consumed
    const tokenRow = await prisma.passwordResetToken.findUnique({ where: { tokenHash } })
    expect(tokenRow?.usedAt).not.toBeNull()
  })

  it('rejects an invalid token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: 'invalid-token', password: 'NewPass123!' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_TOKEN')
  })

  it('rejects an expired token', async () => {
    const user = await createUser('CITIZEN')
    const { createHash } = await import('crypto')
    const rawToken = 'expired-token-123'
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() - 1000), // Already expired
      },
    })

    const res = await request(app)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: rawToken, password: 'NewPass123!' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_TOKEN')
  })

  it('rejects a used token', async () => {
    const user = await createUser('CITIZEN')
    const { createHash } = await import('crypto')
    const rawToken = 'used-token-123'
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        usedAt: new Date(),
      },
    })

    const res = await request(app)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: rawToken, password: 'NewPass123!' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_TOKEN')
  })

  it('rejects a weak new password', async () => {
    const user = await createUser('CITIZEN')
    const { randomBytes, createHash } = await import('crypto')
    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    })

    const res = await request(app)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: rawToken, password: 'weak' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('Password change (authenticated)', () => {
  it('changes password when current is correct', async () => {
    const { user, token } = await createAuthedUser('CITIZEN')
    const res = await request(app)
      .post('/api/v1/me/password')
      .set(authHeader(token))
      .send({ current_password: 'TempPassword123!', new_password: 'NewSecure123!' })
    expect(res.status).toBe(200)

    // Old password rejected
    const loginOld = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'TempPassword123!' })
    expect(loginOld.status).toBe(401)

    // New password works
    const loginNew = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'NewSecure123!' })
    expect(loginNew.status).toBe(200)
  })

  it('rejects incorrect current password', async () => {
    const { token } = await createAuthedUser('CITIZEN')
    const res = await request(app)
      .post('/api/v1/me/password')
      .set(authHeader(token))
      .send({ current_password: 'WrongPassword123!', new_password: 'NewSecure123!' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_PASSWORD')
  })

  it('rejects weak new password', async () => {
    const { token } = await createAuthedUser('CITIZEN')
    const res = await request(app)
      .post('/api/v1/me/password')
      .set(authHeader(token))
      .send({ current_password: 'TempPassword123!', new_password: 'weak' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('invalidates other sessions but keeps current session alive', async () => {
    const { user, token: token1 } = await createAuthedUser('CITIZEN')

    // Create a second session by logging in again
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'TempPassword123!' })
    const token2 = loginRes.body.data.access_token

    // Both tokens should work
    const me1 = await request(app).get('/api/v1/me').set(authHeader(token1))
    const me2 = await request(app).get('/api/v1/me').set(authHeader(token2))
    expect(me1.status).toBe(200)
    expect(me2.status).toBe(200)

    // Change password from session 1
    const changeRes = await request(app)
      .post('/api/v1/me/password')
      .set(authHeader(token1))
      .send({ current_password: 'TempPassword123!', new_password: 'NewSecure123!' })
    expect(changeRes.status).toBe(200)

    // Session 1 (current) should still work
    const me1After = await request(app).get('/api/v1/me').set(authHeader(token1))
    expect(me1After.status).toBe(200)

    // Session 2 should be revoked
    const me2After = await request(app).get('/api/v1/me').set(authHeader(token2))
    expect(me2After.status).toBe(401)
  })
})

describe('Profile endpoint', () => {
  it('returns the authenticated user profile', async () => {
    const { user, token } = await createAuthedUser('CITIZEN')
    const res = await request(app)
      .get('/api/v1/me')
      .set(authHeader(token))
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(user.publicId)
    expect(res.body.data.role).toBe('CITIZEN')
    expect(res.body.data.email).toBe(user.email)
    expect(res.body.data.is_active).toBe(true)
    expect(res.body.data.last_login_at).toBeDefined()
  })

  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/v1/me')
    expect(res.status).toBe(401)
  })
})

describe('Admin overview and leader-candidates', () => {
  it('admin overview returns user counts and role breakdown', async () => {
    const { token } = await createAuthedUser('ADMINISTRATOR')
    const res = await request(app)
      .get('/api/v1/admin/overview')
      .set(authHeader(token))
    expect(res.status).toBe(200)
    expect(res.body.data.users).toBeDefined()
    expect(res.body.data.users.total).toBeGreaterThanOrEqual(1)
    expect(res.body.data.users.active).toBeGreaterThanOrEqual(1)
    expect(res.body.data.rag.status).toBe('deferred')
    expect(res.body.data.configuration.status).toBe('ok')
  })

  it('coordinator is denied admin overview', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const res = await request(app)
      .get('/api/v1/admin/overview')
      .set(authHeader(token))
    expect(res.status).toBe(403)
  })

  it('leader-candidates returns eligible FOs', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR')
    const res = await request(app)
      .get('/api/v1/admin/leader-candidates')
      .set(authHeader(token))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('citizen is denied leader-candidates', async () => {
    const { token } = await createAuthedUser('CITIZEN')
    const res = await request(app)
      .get('/api/v1/admin/leader-candidates')
      .set(authHeader(token))
    expect(res.status).toBe(403)
  })
})

describe('Health and version endpoints', () => {
  it('GET /health returns healthy status', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('healthy')
    expect(res.body.database).toBe('connected')
  })

  it('GET /health/version returns version info', async () => {
    const res = await request(app).get('/health/version')
    expect(res.status).toBe(200)
    expect(res.body.service).toBe('drcip-backend')
    expect(res.body.version).toBeDefined()
  })
})
