import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import prisma from '../src/lib/prisma';
import {
  testApp,
  createAuthedUser,
  createUser,
  truncateTables,
  authHeader,
  createResource,
  createShelter,
  createTeam,
} from './helpers';
import { publicId } from '../src/lib/publicId';

const API = '/api/v1/reports';

const MINUTE = 60_000;

let reporterId = '';

beforeEach(async () => {
  await truncateTables();
  reporterId = (await createUser('CITIZEN')).id;
});

async function seedZone(name: string) {
  const ref = publicId('ZONE');
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "ResponseZone" ("id","publicId","name","geometry","isActive","createdAt","updatedAt")
    VALUES (
      gen_random_uuid(), ${ref}, ${name},
      ${JSON.stringify({ type: 'Polygon', coordinates: [[[88.2, 22.4], [88.4, 22.4], [88.4, 22.6], [88.2, 22.6], [88.2, 22.4]]] })}::jsonb,
      true, now(), now()
    )
    RETURNING id
  `;
  return { id: rows[0].id, publicId: ref };
}

interface IncidentSeed {
  disasterType?: string;
  status?: string;
  confirmedSeverity?: string | null;
  peopleAffected?: number;
  responseZoneId?: string | null;
  createdAt?: Date;
  resolvedAt?: Date | null;
}

async function seedIncident(seed: IncidentSeed) {
  const ref = publicId('INC');
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "Incident"
      ("id","publicId","reporterUserId","disasterType","description","peopleAffected","emergencyContactNumber","location","responseZoneId","confirmedSeverity","status","resolvedAt","createdAt","updatedAt")
    VALUES (
      gen_random_uuid(), ${ref}, ${reporterId}, ${(seed.disasterType ?? 'FLOOD')}::"DisasterType", 'seeded incident',
      ${seed.peopleAffected ?? 1}, '9830000000',
      ST_SetSRID(ST_MakePoint(88.3639, 22.5726), 4326)::geography,
      ${seed.responseZoneId ?? null}::uuid,
      ${seed.confirmedSeverity ?? null}::"SeverityLevel",
      ${(seed.status ?? 'REPORTED')}::"IncidentStatus",
      ${seed.resolvedAt ?? null},
      ${seed.createdAt ?? new Date()}, now()
    )
    RETURNING id
  `;
  return { id: rows[0].id, publicId: ref };
}

async function seedAssignment(
  incidentId: string,
  assignedBy: string,
  seed: { assignedAt: Date; startedAt?: Date | null; completedAt?: Date | null },
) {
  const ref = publicId('ASG');
  await prisma.$executeRaw`
    INSERT INTO "Assignment"
      ("id","publicId","incidentId","assignedBy","status","assignedAt","startedAt","completedAt","createdAt")
    VALUES (
      gen_random_uuid(), ${ref}, ${incidentId}, ${assignedBy}, 'COMPLETED'::"AssignmentStatus",
      ${seed.assignedAt}, ${seed.startedAt ?? null}, ${seed.completedAt ?? null}, now()
    )
  `;
}

async function seedTriageAudit(incidentId: string) {
  await prisma.$executeRaw`
    INSERT INTO "AuditLog" ("id","actorUserId","action","entityType","entityId","occurredAt")
    VALUES (gen_random_uuid(), ${reporterId}, 'INCIDENT_TRIAGE', 'INCIDENT', ${incidentId}, now())
  `;
}

async function analytics(token: string, query = '') {
  return request(testApp).get(`${API}/analytics${query}`).set(authHeader(token));
}

describe('Reports — authentication & authorization', () => {
  it('rejects unauthenticated access (401)', async () => {
    const res = await request(testApp).get(`${API}/analytics`);
    expect(res.status).toBe(401);
  });

  it('rejects Citizen and Field Officer (403)', async () => {
    for (const role of ['CITIZEN', 'FIELD_OFFICER'] as const) {
      const { token } = await createAuthedUser(role);
      const res = await request(testApp).get(`${API}/analytics`).set(authHeader(token));
      expect(res.status).toBe(403);
    }
  });

  it('allows Coordinator and Administrator (200)', async () => {
    for (const role of ['DISASTER_COORDINATOR', 'ADMINISTRATOR'] as const) {
      const { token } = await createAuthedUser(role);
      const res = await request(testApp).get(`${API}/analytics`).set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }
  });

  it('guards every export endpoint too (403 for Field Officer)', async () => {
    const { token } = await createAuthedUser('FIELD_OFFICER');
    for (const path of ['/export.csv', '/export.xlsx', '/export.pdf']) {
      const res = await request(testApp).get(`${API}${path}`).set(authHeader(token));
      expect(res.status).toBe(403);
    }
  });
});

describe('Reports — empty state', () => {
  it('returns zeroed, fully-populated shapes when there is no data', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const res = await analytics(token);

    expect(res.status).toBe(200);
    expect(res.body.data.incidents).toEqual({
      total: 0,
      by_status: {},
      by_disaster_type: {},
      by_response_zone: {},
      by_severity: {},
      people_affected_total: 0,
      trend: [],
    });
    expect(res.body.data.response_times.time_to_assign_ms).toEqual({ avg: null, median: null, p90: null, count: 0 });
    expect(res.body.data.response_times.time_to_resolve_ms).toEqual({ avg: null, median: null, p90: null, count: 0 });
    expect(res.body.data.resources).toEqual({ total: 0, by_status: {}, utilization_rate: 0 });
    expect(res.body.data.teams).toEqual({ total: 0, active: 0, by_status: {} });
    expect(res.body.data.shelters).toEqual({
      total: 0,
      total_capacity: 0,
      total_occupancy: 0,
      utilization_rate: 0,
      by_status: {},
    });
    expect(res.body.data.prediction.prediction_available).toBe(false);
    expect(res.body.data.prediction.triage_ratio).toBe(0);
  });

  it('returns a successful response with zero incidents for a valid date range with no data', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const res = await analytics(token, '?date_from=2000-01-01T00:00:00.000Z&date_to=2000-01-01T23:59:59.999Z');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.incidents.total).toBe(0);
    expect(res.body.data.incidents.trend).toEqual([]);
    expect(res.body.data.prediction.triage_ratio).toBe(0);
  });
});

describe('Reports — incident aggregation', () => {
  it('groups incidents by status, type, severity and response zone', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const zone = await seedZone('North Zone');
    const day = new Date('2026-03-10T08:00:00.000Z');

    await seedIncident({ status: 'REPORTED', disasterType: 'FLOOD', confirmedSeverity: 'HIGH', peopleAffected: 4, responseZoneId: zone.id, createdAt: day });
    await seedIncident({ status: 'REPORTED', disasterType: 'FLOOD', confirmedSeverity: 'LOW', peopleAffected: 6, responseZoneId: zone.id, createdAt: new Date('2026-03-10T20:00:00.000Z') });
    await seedIncident({ status: 'RESOLVED', disasterType: 'FIRE', confirmedSeverity: null, peopleAffected: 10, createdAt: new Date('2026-03-11T05:00:00.000Z') });

    const res = await analytics(token);
    const { incidents } = res.body.data;

    expect(incidents.total).toBe(3);
    expect(incidents.people_affected_total).toBe(20);
    expect(incidents.by_status).toEqual({ REPORTED: 2, RESOLVED: 1 });
    expect(incidents.by_disaster_type).toEqual({ FLOOD: 2, FIRE: 1 });
    expect(incidents.by_severity).toEqual({ HIGH: 1, LOW: 1 });
    expect(incidents.by_response_zone).toEqual({ 'North Zone': 2 });
  });

  it('buckets the trend by UTC creation date, ascending', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    await seedIncident({ createdAt: new Date('2026-03-12T23:30:00.000Z') });
    await seedIncident({ createdAt: new Date('2026-03-11T01:00:00.000Z') });
    await seedIncident({ createdAt: new Date('2026-03-12T04:00:00.000Z') });

    const res = await analytics(token);

    expect(res.body.data.incidents.trend).toEqual([
      { date: '2026-03-11', count: 1 },
      { date: '2026-03-12', count: 2 },
    ]);
  });

  it('excludes incidents outside the requested date range', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    await seedIncident({ createdAt: new Date('2026-01-10T00:00:00.000Z') });
    await seedIncident({ createdAt: new Date('2026-02-10T00:00:00.000Z') });

    const res = await analytics(token, '?date_from=2026-02-01&date_to=2026-02-28');

    expect(res.body.data.incidents.total).toBe(1);
    expect(res.body.data.incidents.trend).toEqual([{ date: '2026-02-10', count: 1 }]);
    expect(res.body.data.filters).toEqual({
      date_from: '2026-02-01',
      date_to: '2026-02-28',
      disaster_type: null,
      response_zone_id: null,
    });
  });

  it('filters by disaster type and response zone public id', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const zone = await seedZone('South Zone');
    await seedIncident({ disasterType: 'FLOOD', responseZoneId: zone.id, createdAt: new Date('2026-03-10T00:00:00.000Z') });
    await seedIncident({ disasterType: 'FIRE', responseZoneId: zone.id, createdAt: new Date('2026-03-10T00:00:00.000Z') });
    await seedIncident({ disasterType: 'FLOOD', createdAt: new Date('2026-03-10T00:00:00.000Z') });

    const byType = await analytics(token, '?disaster_type=FLOOD');
    expect(byType.body.data.incidents.total).toBe(2);

    const byZone = await analytics(token, `?response_zone_id=${zone.publicId}`);
    expect(byZone.body.data.incidents.total).toBe(2);
  });

  it('rejects an unparseable date and an inverted range (400)', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    expect((await analytics(token, '?date_from=not-a-date')).status).toBe(400);
    expect((await analytics(token, '?date_from=2026-03-10&date_to=2026-03-01')).status).toBe(400);
  });
});

describe('Reports — response times', () => {
  it('computes assign, start, complete and resolve durations', async () => {
    const { token, user: coordinator } = await createAuthedUser('DISASTER_COORDINATOR');
    const created = new Date('2026-03-10T00:00:00.000Z');
    const { id } = await seedIncident({ createdAt: created, status: 'RESOLVED', resolvedAt: new Date(created.getTime() + 60 * MINUTE) });

    await seedAssignment(id, coordinator.id, {
      assignedAt: new Date(created.getTime() + 10 * MINUTE),
      startedAt: new Date(created.getTime() + 20 * MINUTE),
      completedAt: new Date(created.getTime() + 15 * MINUTE),
    });

    const res = await analytics(token);
    const times = res.body.data.response_times;

    expect(times.time_to_assign_ms).toEqual({ avg: 10 * MINUTE, median: 10 * MINUTE, p90: 10 * MINUTE, count: 1 });
    expect(times.time_to_first_response_ms).toEqual({ avg: 20 * MINUTE, median: 20 * MINUTE, p90: 20 * MINUTE, count: 1 });
    expect(times.time_to_complete_ms).toEqual({ avg: 5 * MINUTE, median: 5 * MINUTE, p90: 5 * MINUTE, count: 1 });
    expect(times.time_to_resolve_ms).toEqual({ avg: 60 * MINUTE, median: 60 * MINUTE, p90: 60 * MINUTE, count: 1 });
  });

  it('uses only the first assignment and first non-null start per incident', async () => {
    const { token, user: coordinator } = await createAuthedUser('DISASTER_COORDINATOR');
    const created = new Date('2026-03-10T00:00:00.000Z');
    const { id } = await seedIncident({ createdAt: created });

    await seedAssignment(id, coordinator.id, {
      assignedAt: new Date(created.getTime() + 10 * MINUTE),
      startedAt: new Date(created.getTime() + 30 * MINUTE),
      completedAt: new Date(created.getTime() + 40 * MINUTE),
    });
    await seedAssignment(id, coordinator.id, {
      assignedAt: new Date(created.getTime() + 20 * MINUTE),
      startedAt: new Date(created.getTime() + 25 * MINUTE),
      completedAt: new Date(created.getTime() + 50 * MINUTE),
    });

    const times = (await analytics(token)).body.data.response_times;

    expect(times.time_to_assign_ms.count).toBe(1);
    expect(times.time_to_assign_ms.avg).toBe(10 * MINUTE);
    expect(times.time_to_first_response_ms.count).toBe(1);
    expect(times.time_to_first_response_ms.avg).toBe(25 * MINUTE);
    expect(times.time_to_complete_ms.count).toBe(2);
  });

  it('keeps later assignment timestamps eligible for an in-range incident', async () => {
    const { token, user: coordinator } = await createAuthedUser('DISASTER_COORDINATOR');
    const created = new Date('2026-03-10T00:00:00.000Z');
    const { id } = await seedIncident({ createdAt: created });

    // Assigned well after date_to, but the incident itself is in range.
    await seedAssignment(id, coordinator.id, { assignedAt: new Date('2026-06-01T00:00:00.000Z') });

    const times = (await analytics(token, '?date_from=2026-03-01&date_to=2026-03-31')).body.data.response_times;

    expect(times.time_to_assign_ms.count).toBe(1);
    expect(times.time_to_assign_ms.avg).toBe(new Date('2026-06-01T00:00:00.000Z').getTime() - created.getTime());
  });

  it('computes median and p90 across a set', async () => {
    const { token, user: coordinator } = await createAuthedUser('DISASTER_COORDINATOR');
    const base = new Date('2026-03-10T00:00:00.000Z');
    for (const offset of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const { id } = await seedIncident({ createdAt: base });
      await seedAssignment(id, coordinator.id, { assignedAt: new Date(base.getTime() + offset * MINUTE) });
    }

    const stat = (await analytics(token)).body.data.response_times.time_to_assign_ms;

    expect(stat.count).toBe(10);
    expect(stat.avg).toBe(5.5 * MINUTE);
    expect(stat.median).toBe(5.5 * MINUTE);
    expect(stat.p90).toBe(9 * MINUTE);
  });
});

describe('Reports — current snapshot', () => {
  it('ignores the incident date filter for resources, teams and shelters', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    await seedIncident({ createdAt: new Date('2020-01-01T00:00:00.000Z') });
    await createResource({ status: 'ASSIGNED' });
    await createTeam({ status: 'ACTIVE' });
    await createShelter({ total_capacity: 200, current_occupancy: 50 });

    const res = await analytics(token, '?date_from=2026-01-01&date_to=2026-01-31');

    expect(res.body.data.incidents.total).toBe(0);
    expect(res.body.data.resources.total).toBe(1);
    expect(res.body.data.teams.total).toBe(1);
    expect(res.body.data.shelters.total).toBe(1);
    expect(res.body.data.shelters.total_capacity).toBe(200);
  });

  it('computes resource utilization as ASSIGNED + DEPLOYED over total', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    await createResource({ status: 'ASSIGNED' });
    await createResource({ status: 'DEPLOYED' });
    await createResource({ status: 'AVAILABLE' });
    await createResource({ status: 'MAINTENANCE' });

    const { resources } = (await analytics(token)).body.data;

    expect(resources.total).toBe(4);
    expect(resources.by_status).toEqual({ ASSIGNED: 1, DEPLOYED: 1, AVAILABLE: 1, MAINTENANCE: 1 });
    expect(resources.utilization_rate).toBeCloseTo(0.5, 5);
  });

  it('returns zero shelter utilization instead of NaN when capacity is zero', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    await createShelter({ total_capacity: 0, current_occupancy: 0 });

    const { shelters } = (await analytics(token)).body.data;

    expect(shelters.utilization_rate).toBe(0);
  });

  it('counts active teams', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    await createTeam({ status: 'ACTIVE' });
    await createTeam({ status: 'DEPLOYED' });

    const { teams } = (await analytics(token)).body.data;

    expect(teams.total).toBe(2);
    expect(teams.active).toBe(1);
  });
});

describe('Reports — prediction degradation', () => {
  it('reports triage count and ratio, and flags prediction metrics as unavailable', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const incA = await seedIncident({ confirmedSeverity: 'CRITICAL' });
    const incB = await seedIncident({ confirmedSeverity: 'CRITICAL' });
    await seedTriageAudit(incA.id);
    await seedTriageAudit(incB.id);

    const { prediction } = (await analytics(token)).body.data;

    expect(prediction.triage_count).toBe(2);
    expect(prediction.triage_ratio).toBe(1);
    expect(prediction.severity_distribution).toEqual({ CRITICAL: 2 });
    expect(prediction.prediction_available).toBe(false);
    expect(prediction.degraded_message).toContain('Prediction outputs are not currently persisted');
  });

  it('returns a zero triage ratio when no incidents exist', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    // A stray audit record for a target incident outside the empty window must
    // not count: triage_count is scoped to the filtered incident set.
    await prisma.$executeRaw`
      INSERT INTO "AuditLog" ("id","actorUserId","action","entityType","entityId","occurredAt")
      VALUES (gen_random_uuid(), ${reporterId}, 'INCIDENT_TRIAGE', 'INCIDENT', gen_random_uuid(), now())
    `;

    expect((await analytics(token)).body.data.prediction.triage_ratio).toBe(0);
  });

  it('caps triage ratio at 100% when one incident has multiple triage audits', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const { id } = await seedIncident({ confirmedSeverity: 'HIGH' });
    // Insert two INCIDENT_TRIAGE records for the same incident
    await prisma.$executeRaw`
      INSERT INTO "AuditLog" ("id","actorUserId","action","entityType","entityId","occurredAt")
      VALUES (gen_random_uuid(), ${reporterId}, 'INCIDENT_TRIAGE', 'INCIDENT', ${id}, now())
    `;
    await prisma.$executeRaw`
      INSERT INTO "AuditLog" ("id","actorUserId","action","entityType","entityId","occurredAt")
      VALUES (gen_random_uuid(), ${reporterId}, 'INCIDENT_TRIAGE', 'INCIDENT', ${id}, now())
    `;

    const { prediction } = (await analytics(token)).body.data;

    expect(prediction.triage_count).toBe(1);
    expect(prediction.triage_ratio).toBe(1);
  });
});

describe('Reports — exports', () => {
  it('streams a CSV with a header and metric rows', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    await seedIncident({ createdAt: new Date('2026-03-10T00:00:00.000Z'), peopleAffected: 3 });

    const res = await request(testApp).get(`${API}/export.csv`).set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toBe('attachment; filename="drcip-report.csv"');
    expect(res.text.split('\r\n')[0]).toBe('Section,Metric,Value');
    expect(res.text).toContain('Incident Summary,Total incidents,1');
    expect(res.text).toContain('Prediction & Triage,Prediction metrics available,No');
  });

  it('streams a real XLSX workbook', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const res = await request(testApp)
      .get(`${API}/export.xlsx`)
      .set(authHeader(token))
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toBe('attachment; filename="drcip-report.xlsx"');
    expect((res.body as Buffer).subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it('streams a real PDF', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const res = await request(testApp)
      .get(`${API}/export.pdf`)
      .set(authHeader(token))
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="drcip-report.pdf"');
    expect((res.body as Buffer).subarray(0, 4).toString('latin1')).toBe('%PDF');
  });
});
