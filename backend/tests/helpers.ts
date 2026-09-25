import bcrypt from 'bcryptjs'
import prisma from '../src/lib/prisma'
import request from 'supertest'
import { createApp } from '../src/app'
import { publicId } from '../src/lib/publicId'
import type { TeamStatus } from '@drcip/contracts'

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
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AssignmentEvent", "AssignmentItem", "Assignment", "AllocationRecommendationItem", "AllocationRecommendation", "IncidentMedia", "SeverityPrediction", "AuditLog", "Incident", "Resource", "FieldTeamMember", "FieldTeam", "Shelter", "User" RESTART IDENTITY CASCADE',
  )
}

// ---------------------------------------------------------------------------
// Phase 3 factories
// ---------------------------------------------------------------------------

export async function createFieldOfficer(email?: string) {
  return createUser('FIELD_OFFICER', email)
}

export async function createResource(
  overrides: {
    resource_type?: string
    name?: string
    status?: string
    quantity?: number
    unit?: string | null
    capacity?: number | null
    capability_profile?: Record<string, unknown>
    latitude?: number | null
    longitude?: number | null
    contact_reference?: string | null
  } = {},
) {
  const o = {
    resource_type: 'AMBULANCE',
    name: 'Test Resource',
    status: 'AVAILABLE',
    quantity: 1,
    unit: null,
    capacity: null,
    capability_profile: {},
    latitude: 22.5726,
    longitude: 88.3639,
    contact_reference: null,
    ...overrides,
  }
  const ref = publicId('RES')
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "Resource"
      ("id","publicId","resourceType","name","status","quantity","unit","capacity","capabilityProfile","location","contactReference","createdAt","updatedAt")
    VALUES (
      gen_random_uuid(), ${ref}, ${o.resource_type}::"ResourceType", ${o.name}, ${o.status}::"ResourceStatus",
      ${o.quantity}, ${o.unit}, ${o.capacity}, ${JSON.stringify(o.capability_profile)}::jsonb,
      ST_SetSRID(ST_MakePoint(${o.longitude}, ${o.latitude}), 4326)::geography,
      ${o.contact_reference}, now(), now()
    )
    RETURNING id
  `
  return { id: rows[0].id, publicId: ref }
}

export async function createShelter(
  overrides: {
    name?: string
    latitude?: number
    longitude?: number
    total_capacity?: number
    current_occupancy?: number
    status?: string
    capabilities?: Record<string, unknown>
  } = {},
) {
  const o = {
    name: 'Test Shelter',
    latitude: 22.58,
    longitude: 88.37,
    total_capacity: 100,
    current_occupancy: 0,
    status: 'AVAILABLE',
    capabilities: {},
    ...overrides,
  }
  const ref = publicId('SHL')
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "Shelter"
      ("id","publicId","name","location","totalCapacity","currentOccupancy","status","capabilities","createdAt","updatedAt")
    VALUES (
      gen_random_uuid(), ${ref}, ${o.name},
      ST_SetSRID(ST_MakePoint(${o.longitude}, ${o.latitude}), 4326)::geography,
      ${o.total_capacity}, ${o.current_occupancy}, ${o.status}::"ShelterStatus",
      ${JSON.stringify(o.capabilities)}::jsonb, now(), now()
    )
    RETURNING id
  `
  return { id: rows[0].id, publicId: ref }
}

export async function createTeam(
  overrides: {
    name?: string
    status?: TeamStatus
    capability_profile?: Record<string, unknown>
    leaderUserId?: string
  } = {},
) {
  let leaderUserId = overrides.leaderUserId
  if (!leaderUserId) {
    const officer = await createFieldOfficer()
    leaderUserId = officer.id
  }
  return prisma.fieldTeam.create({
    data: {
      publicId: publicId('TEAM'),
      name: overrides.name ?? 'Test Team',
      leaderUserId,
      status: overrides.status ?? 'ACTIVE',
      capabilityProfile: overrides.capability_profile ?? {},
    },
  })
}