import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import prisma from '../src/lib/prisma'
import request from 'supertest'
import { mockEmailLog } from '../src/services/MockEmailProvider'
import {
  testApp,
  createAuthedUser,
  createUser,
  createTeam,
  createIncident,
  createResource,
  truncateTables,
  authHeader,
} from './helpers'

// ---------------------------------------------------------------------------
// Phase 7 — Notifications
// ---------------------------------------------------------------------------

type AuthedUser = { user: { id: string; publicId: string; email: string }; token: string }

async function triage(coordToken: string, incidentId: string, severity: string) {
  return request(testApp)
    .patch(`/api/v1/incidents/${incidentId}/triage`)
    .set('Authorization', `Bearer ${coordToken}`)
    .send({ confirmed_severity: severity })
}

async function list(token: string, query: Record<string, string> = {}) {
  return request(testApp).get('/api/v1/notifications').query(query).set('Authorization', `Bearer ${token}`)
}

async function auditActions(action: string) {
  return prisma.auditLog.findMany({ where: { action } })
}

beforeAll(async () => {
  await truncateTables()
})

afterAll(async () => {
  delete process.env.MOCK_EMAIL_FAIL
  await prisma.$disconnect()
})

describe('Notification contracts', () => {
  it('rejects an unauthenticated list request', async () => {
    const res = await request(testApp).get('/api/v1/notifications')
    expect(res.status).toBe(401)
  })

  it('rejects invalid broadcast input', async () => {
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    const invalidPayloads = [
      { message: '', severity: 'HIGH', recipient_scope: 'ALL' },
      { message: 'ok', severity: 'URGENT', recipient_scope: 'ALL' },
      { message: 'ok', severity: 'HIGH', recipient_scope: 'SOMETHING' },
    ]
    for (const body of invalidPayloads) {
      const res = await request(testApp)
        .post('/api/v1/notifications/broadcast')
        .set('Authorization', `Bearer ${coord.token}`)
        .send(body)
      expect(res.status).toBe(400)
    }
  })
})

describe('Escalation notifications', () => {
  it('notifies all active coordinators + administrators when severity escalates to HIGH/CRITICAL', async () => {
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    const admin = await createAuthedUser('ADMINISTRATOR')
    const citizen = await createAuthedUser('CITIZEN')
    const incident = await createIncident(citizen.token)

    await triage(coord.token, incident.body.data.incident_id, 'CRITICAL')

    const where = { notificationType: 'INCIDENT_ESCALATION' as const, recipientUserId: { in: [coord.user.id, admin.user.id] } }
    const escalationRows = await prisma.notification.findMany({ where })
    expect(escalationRows.length).toBe(4) // 2 recipients x (IN_APP + EMAIL)
    for (const row of escalationRows) {
      expect(row.priority).toBe('CRITICAL')
      expect((row.payload as { incident_public_id: string }).incident_public_id).toBe(incident.body.data.incident_id)
      expect((row.payload as { message: string }).message).toContain(incident.body.data.incident_id)
    }
    const inApp = escalationRows.filter((r) => r.channel === 'IN_APP')
    for (const r of inApp) {
      expect(r.deliveryStatus).toBe('SENT')
      expect(r.readAt).toBeNull()
    }

    // The reporter citizen does not receive escalation rows.
    const citizenEsc = await prisma.notification.findMany({
      where: { notificationType: 'INCIDENT_ESCALATION', recipientUserId: citizen.user.id },
    })
    expect(citizenEsc.length).toBe(0)
  })

  it('does not re-notify when the same severity is re-applied', async () => {
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    const citizen = await createAuthedUser('CITIZEN')
    const incident = await createIncident(citizen.token)
    await triage(coord.token, incident.body.data.incident_id, 'HIGH')

    const where = { notificationType: 'INCIDENT_ESCALATION' as const, recipientUserId: coord.user.id, payload: { path: ['incident_public_id'], equals: incident.body.data.incident_id } }
    const before = await prisma.notification.count({ where })
    expect(before).toBeGreaterThan(0)

    await triage(coord.token, incident.body.data.incident_id, 'HIGH')
    const after = await prisma.notification.count({ where })
    expect(after).toBe(before)
  })

  it('notifies the reporter with an incident status update on triage', async () => {
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    const citizen = await createAuthedUser('CITIZEN')
    const incident = await createIncident(citizen.token)

    await triage(coord.token, incident.body.data.incident_id, 'CRITICAL')

    const rows = await prisma.notification.findMany({
      where: { notificationType: 'INCIDENT_STATUS_UPDATE', recipientUserId: citizen.user.id },
    })
    expect(rows.some((r) => (r.payload as { status: string }).status === 'TRIAGE_PENDING')).toBe(true)
  })
})

describe('Assignment notifications', () => {
  it('notifies only the leading Field Officer when an assignment is created', async () => {
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    const citizen = await createAuthedUser('CITIZEN')
    const officer = await createUser('FIELD_OFFICER')
    const team = await createTeam({ leaderUserId: officer.id })
    const incident = await createIncident(citizen.token)

    const res = await request(testApp)
      .post(`/api/v1/incidents/${incident.body.data.incident_id}/assignments`)
      .set('Authorization', `Bearer ${coord.token}`)
      .send({ items: [{ team_id: team.publicId, quantity: 1 }] })
    expect(res.status).toBe(201)

    const leaderRows = await prisma.notification.findMany({
      where: { notificationType: 'ASSIGNMENT_CREATED', recipientUserId: officer.id },
    })
    expect(leaderRows.length).toBe(2) // IN_APP + EMAIL (operational role channels)
    for (const r of leaderRows) {
      expect(r.priority).toBe('MEDIUM')
    }

    const citizenCreated = await prisma.notification.count({
      where: { notificationType: 'ASSIGNMENT_CREATED', recipientUserId: citizen.user.id },
    })
    expect(citizenCreated).toBe(0)

    const inResponse = await prisma.notification.findMany({
      where: { notificationType: 'INCIDENT_STATUS_UPDATE', recipientUserId: { in: [citizen.user.id, officer.id] } },
    })
    expect(inResponse.some((r) => (r.payload as { status: string }).status === 'IN_RESPONSE')).toBe(true)
  })

  it('records NOTIFICATION_DISPATCH for the pending EMAIL rows', async () => {
    // The previous scenario dispatched EMAIL rows via the mock provider.
    const dispatches = await auditActions('NOTIFICATION_DISPATCH')
    expect(dispatches.length).toBeGreaterThan(0)
    expect(mockEmailLog.length).toBeGreaterThan(0)
  })

  it('notifies reporter + team leader on assignment status transition', async () => {
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    const citizen = await createAuthedUser('CITIZEN')
    const officer = await createUser('FIELD_OFFICER')
    const team = await createTeam({ leaderUserId: officer.id })
    const incident = await createIncident(citizen.token)
    const created = await request(testApp)
      .post(`/api/v1/incidents/${incident.body.data.incident_id}/assignments`)
      .set('Authorization', `Bearer ${coord.token}`)
      .send({ items: [{ team_id: team.publicId, quantity: 1 }] })

    const patch = await request(testApp)
      .patch(`/api/v1/assignments/${created.body.data.id}/status`)
      .set('Authorization', `Bearer ${coord.token}`)
      .send({ status: 'IN_PROGRESS' })
    expect(patch.status).toBe(200)

    const rows = await prisma.notification.findMany({
      where: { notificationType: 'ASSIGNMENT_STATUS_UPDATE', recipientUserId: { in: [citizen.user.id, officer.id] } },
    })
    const inProgress = rows.filter((r) => (r.payload as { status: string }).status === 'IN_PROGRESS')
    expect(inProgress.length).toBeGreaterThanOrEqual(2) // reporter + leader, each at least IN_APP
    for (const r of inProgress) expect(r.priority).toBe('MEDIUM')
  })

  it('suppresses a notification when the same status is re-applied', async () => {
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    const citizen = await createAuthedUser('CITIZEN')
    const officer = await createUser('FIELD_OFFICER')
    const team = await createTeam({ leaderUserId: officer.id })
    const incident = await createIncident(citizen.token)
    const created = await request(testApp)
      .post(`/api/v1/incidents/${incident.body.data.incident_id}/assignments`)
      .set('Authorization', `Bearer ${coord.token}`)
      .send({ items: [{ team_id: team.publicId, quantity: 1 }] })
    await request(testApp)
      .patch(`/api/v1/assignments/${created.body.data.id}/status`)
      .set('Authorization', `Bearer ${coord.token}`)
      .send({ status: 'IN_PROGRESS' })

    const where = { notificationType: 'ASSIGNMENT_STATUS_UPDATE', recipientUserId: citizen.user.id, payload: { path: ['status'], equals: 'IN_PROGRESS' } }
    const before = await prisma.notification.count({ where })

    await request(testApp)
      .patch(`/api/v1/assignments/${created.body.data.id}/status`)
      .set('Authorization', `Bearer ${coord.token}`)
      .send({ status: 'IN_PROGRESS' })
    expect(await prisma.notification.count({ where })).toBe(before)
  })
})

describe('Incident resolve notifications', () => {
  it('notifies the reporter and assigned team leader when an incident is resolved', async () => {
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    const citizen = await createAuthedUser('CITIZEN')
    const officer = await createUser('FIELD_OFFICER')
    const team = await createTeam({ leaderUserId: officer.id })
    const incident = await createIncident(citizen.token)

    const created = await request(testApp)
      .post(`/api/v1/incidents/${incident.body.data.incident_id}/assignments`)
      .set('Authorization', `Bearer ${coord.token}`)
      .send({ items: [{ team_id: team.publicId, quantity: 1 }] })
    expect(created.status).toBe(201)

    await request(testApp)
      .patch(`/api/v1/assignments/${created.body.data.id}/status`)
      .set('Authorization', `Bearer ${coord.token}`)
      .send({ status: 'IN_PROGRESS' })

    const officerToken = await loginAs(officer.email)
    const fieldDone = await request(testApp)
      .post(`/api/v1/assignments/${created.body.data.id}/field-updates`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ event_type: 'COMPLETED', notes: 'done' })
    expect(fieldDone.status).toBe(200)

    const resolved = await request(testApp)
      .patch(`/api/v1/incidents/${incident.body.data.incident_id}/resolve`)
      .set('Authorization', `Bearer ${coord.token}`)
      .send({ notes: 'all clear' })
    expect(resolved.status).toBe(200)

    const rows = await prisma.notification.findMany({
      where: { notificationType: 'INCIDENT_STATUS_UPDATE', recipientUserId: { in: [citizen.user.id, officer.id] } },
    })
    const resolvedRows = rows.filter((r) => (r.payload as { status: string }).status === 'RESOLVED')
    expect(resolvedRows.length).toBeGreaterThanOrEqual(2)
    for (const r of resolvedRows) expect(r.priority).toBe('MEDIUM')
  })
})

describe('Team status notifications', () => {
  it('notifies coordinators + administrators on a genuine team status change', async () => {
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    const admin = await createAuthedUser('ADMINISTRATOR')
    const officer = await createUser('FIELD_OFFICER')
    const team = await createTeam({ leaderUserId: officer.id })

    const patch = await request(testApp)
      .patch(`/api/v1/teams/${team.publicId}/status`)
      .set('Authorization', `Bearer ${coord.token}`)
      .send({ status: 'DEPLOYED' })
    expect(patch.status).toBe(200)

    const rows = await prisma.notification.findMany({
      where: { notificationType: 'SYSTEM', recipientUserId: { in: [coord.user.id, admin.user.id] } },
    })
    const teamStatus = rows.filter((r) => (r.payload as { event: string }).event === 'TEAM_STATUS_UPDATE')
    expect(teamStatus.length).toBeGreaterThanOrEqual(4) // 2 recipients x 2 channels (may include other coordinators)
    for (const r of teamStatus) {
      expect(r.priority).toBe('HIGH')
      expect((r.payload as { status: string }).status).toBe('DEPLOYED')
    }
  })

  it('does not notify when the team status is unchanged', async () => {
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    const officer = await createUser('FIELD_OFFICER')
    const team = await createTeam({ leaderUserId: officer.id })
    await request(testApp)
      .patch(`/api/v1/teams/${team.publicId}/status`)
      .set('Authorization', `Bearer ${coord.token}`)
      .send({ status: 'MAINTENANCE' })

    const where = { notificationType: 'SYSTEM', recipientUserId: coord.user.id, payload: { path: ['event'], equals: 'TEAM_STATUS_UPDATE' } }
    const before = await prisma.notification.count({ where })

    await request(testApp)
      .patch(`/api/v1/teams/${team.publicId}/status`)
      .set('Authorization', `Bearer ${coord.token}`)
      .send({ status: 'MAINTENANCE' })

    expect(await prisma.notification.count({ where })).toBe(before)
  })
})

describe('Emergency broadcast', () => {
  it('broadcasts to COORDINATORS scope with requested severity and NOTIFICATION_BROADCAST audit', async () => {
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    const admin = await createAuthedUser('ADMINISTRATOR')
    const officer = await createUser('FIELD_OFFICER')
    const citizen = await createAuthedUser('CITIZEN')

    const res = await request(testApp)
      .post('/api/v1/notifications/broadcast')
      .set('Authorization', `Bearer ${coord.token}`)
      .send({ message: 'Heavy rainfall expected', severity: 'CRITICAL', recipient_scope: 'COORDINATORS' })
    expect(res.status).toBe(201)
    expect(res.body.data.severity).toBe('CRITICAL')
    expect(res.body.data.recipient_scope).toBe('COORDINATORS')

    const rows = await prisma.notification.findMany({
      where: { notificationType: 'EMERGENCY_BROADCAST', recipientUserId: { in: [coord.user.id, admin.user.id, officer.id, citizen.user.id] } },
    })
    const coordRows = rows.filter((r) => r.recipientUserId === coord.user.id)
    const adminRows = rows.filter((r) => r.recipientUserId === admin.user.id)
    expect(coordRows.length).toBe(2) // IN_APP + EMAIL
    expect(adminRows.length).toBe(2)
    expect(rows.some((r) => r.recipientUserId === officer.id)).toBe(false) // FIELD_OFFICERS excluded
    expect(rows.some((r) => r.recipientUserId === citizen.user.id)).toBe(false) // citizens excluded
    for (const r of rows) expect(r.priority).toBe('CRITICAL')

    const broadcasts = await auditActions('NOTIFICATION_BROADCAST')
    expect(broadcasts.some((a) => (a.afterState as { recipient_scope?: string })?.recipient_scope === 'COORDINATORS')).toBe(true)
  })

  it('broadcasts to CITIZENS scope in-app only', async () => {
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    const citizen = await createAuthedUser('CITIZEN')

    const res = await request(testApp)
      .post('/api/v1/notifications/broadcast')
      .set('Authorization', `Bearer ${coord.token}`)
      .send({ message: 'Stay indoors', severity: 'MEDIUM', recipient_scope: 'CITIZENS' })
    expect(res.status).toBe(201)

    const rows = await prisma.notification.findMany({
      where: { notificationType: 'EMERGENCY_BROADCAST', recipientUserId: citizen.user.id },
    })
    expect(rows.length).toBe(1) // citizens are IN_APP only
    expect(rows[0].channel).toBe('IN_APP')
  })

  it('broadcast to ALL includes administrators', async () => {
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    const admin = await createAuthedUser('ADMINISTRATOR')

    const res = await request(testApp)
      .post('/api/v1/notifications/broadcast')
      .set('Authorization', `Bearer ${coord.token}`)
      .send({ message: 'All-hands', severity: 'HIGH', recipient_scope: 'ALL' })
    expect(res.status).toBe(201)

    expect(res.body.data.notification_ids.length).toBeGreaterThanOrEqual(4)
    const adminRows = await prisma.notification.count({
      where: { notificationType: 'EMERGENCY_BROADCAST', recipientUserId: admin.user.id },
    })
    expect(adminRows).toBe(2)
  })

  it('excludes deactivated users from broadcast recipients', async () => {
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    const admin = await createUser('ADMINISTRATOR')
    await prisma.user.update({ where: { id: admin.id }, data: { isActive: false } })

    const res = await request(testApp)
      .post('/api/v1/notifications/broadcast')
      .set('Authorization', `Bearer ${coord.token}`)
      .send({ message: 'Check', severity: 'LOW', recipient_scope: 'ALL' })
    expect(res.status).toBe(201)

    const adminRows = await prisma.notification.count({
      where: { notificationType: 'EMERGENCY_BROADCAST', recipientUserId: admin.id },
    })
    expect(adminRows).toBe(0)
  })

  it('rejects broadcast from citizens and field officers', async () => {
    const citizen = await createAuthedUser('CITIZEN')
    const officer = await createAuthedUser('FIELD_OFFICER')

    for (const u of [citizen, officer]) {
      const res = await request(testApp)
        .post('/api/v1/notifications/broadcast')
        .set('Authorization', `Bearer ${u.token}`)
        .send({ message: 'nope', severity: 'HIGH', recipient_scope: 'ALL' })
      expect(res.status).toBe(403)
    }
  })

  it('allows ADMINISTRATOR to broadcast to FIELD_OFFICERS scope targeting field officers only', async () => {
    const admin = await createAuthedUser('ADMINISTRATOR')
    const officer = await createAuthedUser('FIELD_OFFICER')
    const coord = await createUser('DISASTER_COORDINATOR')
    const citizen = await createUser('CITIZEN')

    const res = await request(testApp)
      .post('/api/v1/notifications/broadcast')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ message: 'Field coordination', severity: 'MEDIUM', recipient_scope: 'FIELD_OFFICERS' })
    expect(res.status).toBe(201)
    expect(res.body.data.recipient_scope).toBe('FIELD_OFFICERS')

    const rows = await prisma.notification.findMany({
      where: { notificationType: 'EMERGENCY_BROADCAST', payload: { path: ['message'], equals: 'Field coordination' } },
    })
    expect(rows.some((r) => r.recipientUserId === officer.user.id)).toBe(true)
    expect(rows.some((r) => r.recipientUserId === admin.user.id)).toBe(false)
    expect(rows.some((r) => r.recipientUserId === coord.id)).toBe(false)
    expect(rows.some((r) => r.recipientUserId === citizen.id)).toBe(false)
    for (const r of rows) expect(r.priority).toBe('MEDIUM')
  })
})

describe('Channel grouping and unread semantics', () => {
  it('exposes one logical_key shared by the IN_APP and EMAIL rows of the same broadcast', async () => {
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    await request(testApp)
      .post('/api/v1/notifications/broadcast')
      .set('Authorization', `Bearer ${coord.token}`)
      .send({ message: 'Group me', severity: 'HIGH', recipient_scope: 'COORDINATORS' })

    const res = await list(coord.token)
    const broadcast = res.body.data.items.filter(
      (i: { notification_type: string }) => i.notification_type === 'EMERGENCY_BROADCAST',
    )
    expect(broadcast.length).toBe(2) // IN_APP + EMAIL
    const keys = new Set(broadcast.map((i: { logical_key: string }) => i.logical_key))
    expect(keys.size).toBe(1)
    const channels = new Set(broadcast.map((i: { channel: string }) => i.channel))
    expect(channels.has('IN_APP')).toBe(true)
    expect(channels.has('EMAIL')).toBe(true)
    // Each channel row keeps its own identity (needed for per-channel delivery status).
    expect(new Set(broadcast.map((i: { public_id: string }) => i.public_id)).size).toBe(2)
  })

  it('unread_only returns only IN_APP rows so the badge never counts email as unread', async () => {
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    await request(testApp)
      .post('/api/v1/notifications/broadcast')
      .set('Authorization', `Bearer ${coord.token}`)
      .send({ message: 'Badge check', severity: 'HIGH', recipient_scope: 'COORDINATORS' })

    const unread = await list(coord.token, { unread_only: 'true', limit: '100' })
    expect(unread.status).toBe(200)
    expect(unread.body.data.items.length).toBeGreaterThan(0)
    for (const item of unread.body.data.items) expect(item.channel).toBe('IN_APP')

    const inAppUnread = await prisma.notification.count({
      where: { recipientUserId: coord.user.id, channel: 'IN_APP', readAt: null },
    })
    expect(unread.body.data.pagination.total).toBe(inAppUnread)
  })
})

describe('List and ownership isolation', () => {
  it('lists only the caller\'s own notifications with filters', async () => {
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    const citizenA = await createAuthedUser('CITIZEN')
    const citizenB = await createAuthedUser('CITIZEN')
    const aInc = await createIncident(citizenA.token)
    await triage(coord.token, aInc.body.data.incident_id, 'HIGH')
    const bInc = await createIncident(citizenB.token)
    await triage(coord.token, bInc.body.data.incident_id, 'HIGH')

    const aList = await list(citizenA.token)
    expect(aList.status).toBe(200)
    expect(Array.isArray(aList.body.data.items)).toBe(true)
    for (const item of aList.body.data.items) {
      expect(item.incident_public_id).toBe(aInc.body.data.incident_id)
    }
    expect(aList.body.data.pagination.total).toBeGreaterThan(0)

    // A's list must not include B's notification.
    expect(aList.body.data.items.every((i: { notification_type: string }) => i.notification_type)).toBe(true)
    const allB = await prisma.notification.count({
      where: { recipientUserId: citizenB.user.id, payload: { path: ['incident_public_id'], equals: bInc.body.data.incident_id } },
    })
    expect(allB).toBeGreaterThan(0)
    const leaked = await prisma.notification.count({
      where: { recipientUserId: citizenA.user.id, payload: { path: ['incident_public_id'], equals: bInc.body.data.incident_id } },
    })
    expect(leaked).toBe(0)

    const unread = await list(citizenA.token, { unread_only: 'true' })
    expect(unread.body.data.pagination.total).toBeGreaterThanOrEqual(1)

    const byType = await list(citizenA.token, { notification_type: 'INCIDENT_STATUS_UPDATE' })
    expect(byType.body.data.items.every((i: { notification_type: string }) => i.notification_type === 'INCIDENT_STATUS_UPDATE')).toBe(true)
  })

  it('returns a NotificationSummary shape per item', async () => {
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    const citizen = await createAuthedUser('CITIZEN')
    const incident = await createIncident(citizen.token)
    await triage(coord.token, incident.body.data.incident_id, 'HIGH')

    const res = await list(citizen.token)
    const item = res.body.data.items.find((i: { notification_type: string }) => i.notification_type === 'INCIDENT_STATUS_UPDATE')
    expect(item).toBeTruthy()
    expect(item.id).toMatch(/^NTF-/)
    expect(item.public_id).toBe(item.id)
    expect(typeof item.logical_key).toBe('string')
    expect(item.logical_key.length).toBeGreaterThan(0)
    expect(['IN_APP', 'EMAIL', 'SMS']).toContain(item.channel)
    expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(item.priority)
    expect(typeof item.message).toBe('string')
    expect(['PENDING', 'SENT', 'FAILED']).toContain(item.delivery_status)
    expect(item.created_at).toBeTruthy()
  })
})

describe('Mark as read', () => {
  it('marks the caller\'s IN_APP notification read, idempotently, without touching delivery_status', async () => {
    const citizen = await createAuthedUser('CITIZEN')
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    const incident = await createIncident(citizen.token)
    await triage(coord.token, incident.body.data.incident_id, 'HIGH')

    const target = await prisma.notification.findFirstOrThrow({
      where: { recipientUserId: citizen.user.id, notificationType: 'INCIDENT_STATUS_UPDATE', channel: 'IN_APP' },
    })

    const first = await request(testApp)
      .post(`/api/v1/notifications/${target.publicId}/read`)
      .set('Authorization', `Bearer ${citizen.token}`)
    expect(first.status).toBe(200)
    expect(first.body.data.read_at).toBeTruthy()
    expect(first.body.data.delivery_status).toBe('SENT')

    const afterFirst = await prisma.notification.findUniqueOrThrow({ where: { id: target.id } })
    const readAt = afterFirst.readAt

    const second = await request(testApp)
      .post(`/api/v1/notifications/${target.publicId}/read`)
      .set('Authorization', `Bearer ${citizen.token}`)
    expect(second.status).toBe(200)
    expect(second.body.data.read_at).toBe(readAt?.toISOString() ?? null)
  })

  it('never sets read_at on EMAIL rows and blocks cross-owner access with 404', async () => {
    const citizen = await createAuthedUser('CITIZEN')
    const outsider = await createAuthedUser('CITIZEN')
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    const admin = await createAuthedUser('ADMINISTRATOR')

    const res = await request(testApp)
      .post('/api/v1/notifications/broadcast')
      .set('Authorization', `Bearer ${coord.token}`)
      .send({ message: 'Scoped', severity: 'HIGH', recipient_scope: 'ALL' })
    expect(res.status).toBe(201)

    const email = await prisma.notification.findFirstOrThrow({
      where: { recipientUserId: admin.user.id, notificationType: 'EMERGENCY_BROADCAST', channel: 'EMAIL' },
    })
    const emailRead = await request(testApp)
      .post(`/api/v1/notifications/${email.publicId}/read`)
      .set('Authorization', `Bearer ${admin.token}`)
    expect(emailRead.status).toBe(200)
    expect(emailRead.body.data.read_at).toBeNull()

    const inApp = await prisma.notification.findFirstOrThrow({
      where: { recipientUserId: admin.user.id, notificationType: 'EMERGENCY_BROADCAST', channel: 'IN_APP' },
    })
    const forbidden = await request(testApp)
      .post(`/api/v1/notifications/${inApp.publicId}/read`)
      .set('Authorization', `Bearer ${outsider.token}`)
    expect(forbidden.status).toBe(404)

    const missing = await request(testApp)
      .post('/api/v1/notifications/NTF-NOPE/read')
      .set('Authorization', `Bearer ${citizen.token}`)
    expect(missing.status).toBe(404)
  })

  it('records NO NOTIFICATION_READ audit rows', async () => {
    const reads = await auditActions('NOTIFICATION_READ')
    expect(reads.length).toBe(0)
  })
})

describe('Provider failure does not roll back the domain operation', () => {
  it('marks EMAIL delivery FAILED but keeps the assignment and IN_APP notification intact', async () => {
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    const citizen = await createAuthedUser('CITIZEN')
    const officer = await createUser('FIELD_OFFICER')
    const team = await createTeam({ leaderUserId: officer.id })
    const incident = await createIncident(citizen.token)

    process.env.MOCK_EMAIL_FAIL = 'true'
    try {
      const created = await request(testApp)
        .post(`/api/v1/incidents/${incident.body.data.incident_id}/assignments`)
        .set('Authorization', `Bearer ${coord.token}`)
        .send({ items: [{ team_id: team.publicId, quantity: 1 }] })
      expect(created.status).toBe(201)

      const leaderRows = await prisma.notification.findMany({
        where: { notificationType: 'ASSIGNMENT_CREATED', recipientUserId: officer.id },
      })
      const inApp = leaderRows.find((r) => r.channel === 'IN_APP')!
      const email = leaderRows.find((r) => r.channel === 'EMAIL')!
      expect(inApp.deliveryStatus).toBe('SENT')
      expect(email.deliveryStatus).toBe('FAILED')
      expect(email.sentAt).toBeNull()

      const failedDispatches = await prisma.auditLog.findMany({
        where: { action: 'NOTIFICATION_DISPATCH', entityId: email.id },
      })
      expect(failedDispatches.length).toBe(1)
      expect((failedDispatches[0].afterState as { delivery_status: string }).delivery_status).toBe('FAILED')

      // Domain operation still committed.
      const assignment = await prisma.assignment.findFirstOrThrow({
        where: { incident: { publicId: incident.body.data.incident_id } },
      })
      expect(assignment.status).toBe('ASSIGNED')
    } finally {
      delete process.env.MOCK_EMAIL_FAIL
    }
  })

  it('records NOTIFICATION_DISPATCH for successful deliveries', async () => {
    const success = await prisma.auditLog.findMany({
      where: { action: 'NOTIFICATION_DISPATCH' },
    })
    expect(success.length).toBeGreaterThan(0)
    expect(success.some((a) => (a.afterState as { delivery_status: string }).delivery_status === 'SENT')).toBe(true)
  })
})

async function loginAs(email: string): Promise<string> {
  const res = await request(testApp).post('/api/v1/auth/login').send({ email, password: 'TempPassword123!' })
  if (res.status !== 200 || !res.body?.data?.access_token) throw new Error(`login failed for ${email}: ${JSON.stringify(res.body)}`)
  return res.body.data.access_token
}