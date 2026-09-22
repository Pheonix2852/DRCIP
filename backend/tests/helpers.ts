import bcrypt from 'bcryptjs'
import prisma from '../src/lib/prisma'
import request from 'supertest'
import { createApp } from '../src/app'

export const testApp = createApp()

export type TestRole = 'CITIZEN' | 'FIELD_OFFICER' | 'DISASTER_COORDINATOR' | 'ADMINISTRATOR'

let userCounter = 0

export async function createUser(role: TestRole, email = `user-${Date.now()}-${userCounter++}@test.local`) {
  const passwordHash = await bcrypt.hash('TempPassword123!', 4)
  const user = await prisma.user.create({
    data: {
      publicId: `USR-TEST-${Date.now()}-${userCounter}`,
      email,
      fullName: `${role} Test User`,
      passwordHash,
      role,
      isActive: true,
    },
  })
  return user
}

export async function loginToken(email: string): Promise<string> {
  const res = await request(testApp)
    .post('/api/v1/auth/login')
    .send({ email, password: 'TempPassword123!' })
  if (res.status !== 200 || !res.body?.data?.access_token) {
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`)
  }
  return res.body.data.access_token
}

export async function createAuthedUser(role: TestRole) {
  const user = await createUser(role)
  const token = await loginToken(user.email)
  return { user, token }
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` }
}

export async function createIncident(token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(testApp)
    .post('/api/v1/incidents')
    .set('Authorization', `Bearer ${token}`)
    .send({
      disaster_type: 'FLOOD',
      description: 'Flooding reported near the river bank',
      latitude: 22.5726,
      longitude: 88.3639,
      people_affected: 5,
      emergency_contact_number: '9830012345',
      ...overrides,
    })
  return res
}

export async function truncateTables() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "IncidentMedia", "SeverityPrediction", "AuditLog", "Incident", "User" RESTART IDENTITY CASCADE')
}