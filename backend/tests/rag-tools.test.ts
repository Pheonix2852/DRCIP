import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import prisma from '../src/lib/prisma';
import { publicId } from '../src/lib/publicId';
import {
  authorizeRagTool,
  resolveRagToolContext,
} from '../src/services/ragToolAuthorization';
import { executeRagTool } from '../src/services/ragTools';
import {
  createAuthedUser,
  createIncident,
  createResource,
  createShelter,
  createTeam,
  truncateTables,
} from './helpers';

const page = { page: 1, limit: 10, sort: 'newest' as const };

beforeAll(async () => {
  await truncateTables();
});

beforeEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function expectAuthError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ name: 'RagToolAuthorizationError', code });
}

function expectIso(value: string) {
  expect(new Date(value).toISOString()).toBe(value);
}

describe('RAG tool authorization', () => {
  it('denies citizens and unverified identities', async () => {
    const citizen = await createAuthedUser('CITIZEN');
    const citizenCtx = await resolveRagToolContext({
      userId: citizen.user.id,
      userRole: 'CITIZEN',
    });
    await expectAuthError(
      authorizeRagTool(citizenCtx, 'get_active_incidents', { limit: 10 }),
      'FORBIDDEN',
    );

    await expectAuthError(
      resolveRagToolContext({ userId: '00000000-0000-0000-0000-000000000000', userRole: 'ADMINISTRATOR' }),
      'INVALID_CONTEXT',
    );
    await expectAuthError(resolveRagToolContext({ userRole: 'ADMINISTRATOR' }), 'INVALID_CONTEXT');
    await expectAuthError(
      resolveRagToolContext({ userId: citizen.user.id, userRole: 'ADMINISTRATOR' }),
      'INVALID_CONTEXT',
    );

    await prisma.user.update({ where: { id: citizen.user.id }, data: { isActive: false } });
    await expectAuthError(
      resolveRagToolContext({ userId: citizen.user.id, userRole: 'CITIZEN' }),
      'INVALID_CONTEXT',
    );
  });

  it('requires a led team for field officers and denies staff-only tools', async () => {
    const officer = await createAuthedUser('FIELD_OFFICER');
    await expectAuthError(
      resolveRagToolContext({ userId: officer.user.id, userRole: 'FIELD_OFFICER' }),
      'SCOPE_UNVERIFIED',
    );

    await createTeam({ leaderUserId: officer.user.id });
    const ctx = await resolveRagToolContext({
      userId: officer.user.id,
      userRole: 'FIELD_OFFICER',
    });
    await expectAuthError(
      authorizeRagTool(ctx, 'get_resource_stock', { limit: 10 }),
      'FORBIDDEN',
    );

    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    const coordinatorCtx = await resolveRagToolContext({
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
    });
    await expect(authorizeRagTool(coordinatorCtx, 'get_resource_stock', { limit: 10 })).resolves.toEqual({
      kind: 'ALL',
    });
  });

  it('rejects a nearby ambulance search away from the officer active assignment', async () => {
    const officer = await createAuthedUser('FIELD_OFFICER');
    const citizen = await createAuthedUser('CITIZEN');
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    const team = await createTeam({ leaderUserId: officer.user.id });
    const incident = await createIncident(citizen.token);
    const incidentRecord = await prisma.incident.findUniqueOrThrow({
      where: { publicId: incident.body.data.incident_id },
    });
    await prisma.assignment.create({
      data: {
        publicId: publicId('ASN'),
        incidentId: incidentRecord.id,
        assignedBy: coordinator.user.id,
        status: 'ASSIGNED',
        assignedAt: new Date(),
        fieldTeamId: team.id,
      },
    });

    const ctx = await resolveRagToolContext({
      userId: officer.user.id,
      userRole: 'FIELD_OFFICER',
    });
    await expect(
      authorizeRagTool(ctx, 'get_nearby_ambulances', {
        latitude: 22.5726,
        longitude: 88.3639,
        radius_km: 10,
        limit: 10,
      }),
    ).resolves.toEqual({ kind: 'ALL' });

    await expectAuthError(
      authorizeRagTool(ctx, 'get_nearby_ambulances', {
        latitude: 28.6139,
        longitude: 77.209,
        radius_km: 10,
        limit: 10,
      }),
      'FORBIDDEN',
    );
  });
});

describe('RAG live tools', () => {
  it('scopes active incidents to the officer assignments and excludes resolved incidents', async () => {
    const officer1 = await createAuthedUser('FIELD_OFFICER');
    const officer2 = await createAuthedUser('FIELD_OFFICER');
    const citizen = await createAuthedUser('CITIZEN');
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    const team1 = await createTeam({ leaderUserId: officer1.user.id });
    await createTeam({ leaderUserId: officer2.user.id });

    const incidentA = await createIncident(citizen.token, { description: 'Incident A' });
    const incidentB = await createIncident(citizen.token, { description: 'Incident B' });
    const recordB = await prisma.incident.findUniqueOrThrow({
      where: { publicId: incidentB.body.data.incident_id },
    });
    await prisma.assignment.create({
      data: {
        publicId: publicId('ASN'),
        incidentId: recordB.id,
        assignedBy: coordinator.user.id,
        status: 'ASSIGNED',
        assignedAt: new Date(),
        fieldTeamId: team1.id,
      },
    });

    const ctx1 = await resolveRagToolContext({
      userId: officer1.user.id,
      userRole: 'FIELD_OFFICER',
    });
    const own = await executeRagTool(ctx1, 'get_active_incidents', { limit: 10 });
    expect(own.outcome).toBe('SUCCESS');
    expect(own.records.map((record) => record.incident_id)).toEqual([
      incidentB.body.data.incident_id,
    ]);
    expectIso(own.as_of);

    const ctx2 = await resolveRagToolContext({
      userId: officer2.user.id,
      userRole: 'FIELD_OFFICER',
    });
    const other = await executeRagTool(ctx2, 'get_active_incidents', { limit: 10 });
    expect(other.outcome).toBe('EMPTY');
    expect(other.records).toEqual([]);

    await prisma.incident.update({
      where: { publicId: incidentA.body.data.incident_id },
      data: { status: 'RESOLVED' },
    });
    const coordinatorCtx = await resolveRagToolContext({
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
    });
    const staff = await executeRagTool(coordinatorCtx, 'get_active_incidents', { limit: 10 });
    expect(staff.records.map((record) => record.incident_id)).toEqual([
      incidentB.body.data.incident_id,
    ]);
  });

  it('returns only nearby available ambulances and denies stock to field officers', async () => {
    const officer = await createAuthedUser('FIELD_OFFICER');
    const citizen = await createAuthedUser('CITIZEN');
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    const team = await createTeam({ leaderUserId: officer.user.id });
    const incident = await createIncident(citizen.token);
    const incidentRecord = await prisma.incident.findUniqueOrThrow({
      where: { publicId: incident.body.data.incident_id },
    });
    await prisma.assignment.create({
      data: {
        publicId: publicId('ASN'),
        incidentId: incidentRecord.id,
        assignedBy: coordinator.user.id,
        status: 'IN_PROGRESS',
        assignedAt: new Date(),
        fieldTeamId: team.id,
      },
    });

    const near = await createResource({ name: 'Near Ambulance' });
    const far = await createResource({
      name: 'Far Ambulance',
      latitude: 28.6139,
      longitude: 77.209,
    });
    await createResource({ name: 'Near Vehicle', resource_type: 'VEHICLE' });
    await createResource({ name: 'Near Unavailable', status: 'DEPLOYED' });

    const ctx = await resolveRagToolContext({
      userId: officer.user.id,
      userRole: 'FIELD_OFFICER',
    });
    const result = await executeRagTool(ctx, 'get_nearby_ambulances', {
      latitude: 22.5726,
      longitude: 88.3639,
      radius_km: 10,
      status: 'AVAILABLE',
      limit: 10,
    });
    expect(result.outcome).toBe('SUCCESS');
    expect(result.records.map((record) => record.resource_id)).toEqual([near.publicId]);
    expect(result.records.some((record) => record.resource_id === far.publicId)).toBe(false);

    await expectAuthError(
      executeRagTool(ctx, 'get_resource_stock', { limit: 10 }),
      'FORBIDDEN',
    );

    const coordinatorCtx = await resolveRagToolContext({
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
    });
    const stock = await executeRagTool(coordinatorCtx, 'get_resource_stock', { limit: 10 });
    expect(stock.outcome).toBe('SUCCESS');
    expect(stock.records.length).toBeGreaterThan(0);
  });

  it('filters teams by capability and status without widening officer scope', async () => {
    const officer1 = await createAuthedUser('FIELD_OFFICER');
    const officer2 = await createAuthedUser('FIELD_OFFICER');
    const officer3 = await createAuthedUser('FIELD_OFFICER');
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    const team1 = await createTeam({
      name: 'Medical Team',
      leaderUserId: officer1.user.id,
      capability_profile: { medical: true },
    });
    await createTeam({ name: 'Plain Team', leaderUserId: officer2.user.id });
    await createTeam({
      name: 'Suspended Medical Team',
      leaderUserId: officer3.user.id,
      status: 'UNAVAILABLE',
      capability_profile: { medical: true },
    });

    const ctx = await resolveRagToolContext({
      userId: officer1.user.id,
      userRole: 'FIELD_OFFICER',
    });
    const own = await executeRagTool(ctx, 'get_available_rescue_teams', {
      capability: ' medical ',
      limit: 10,
    });
    expect(own.records.map((record) => record.team_id)).toEqual([team1.publicId]);
    expect(own.records[0].capability_profile).toEqual({ medical: true });

    const coordinatorCtx = await resolveRagToolContext({
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
    });
    const staff = await executeRagTool(coordinatorCtx, 'get_available_rescue_teams', {
      capability: 'medical',
      limit: 10,
    });
    expect(staff.records.map((record) => record.team_id)).toEqual([team1.publicId]);
  });

  it('scopes shelters to active assignments and computes available capacity', async () => {
    const officer = await createAuthedUser('FIELD_OFFICER');
    const citizen = await createAuthedUser('CITIZEN');
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    const team = await createTeam({ leaderUserId: officer.user.id });

    const activeIncident = await createIncident(citizen.token, { description: 'Active' });
    const resolvedIncident = await createIncident(citizen.token, { description: 'Resolved' });
    const activeRecord = await prisma.incident.findUniqueOrThrow({
      where: { publicId: activeIncident.body.data.incident_id },
    });
    const resolvedRecord = await prisma.incident.findUniqueOrThrow({
      where: { publicId: resolvedIncident.body.data.incident_id },
    });
    await prisma.incident.update({ where: { id: resolvedRecord.id }, data: { status: 'RESOLVED' } });

    const activeShelter = await createShelter({
      name: 'Active Shelter',
      total_capacity: 100,
      current_occupancy: 40,
    });
    const resolvedShelter = await createShelter({ name: 'Resolved Shelter' });
    const unassignedShelter = await createShelter({ name: 'Unassigned Shelter' });

    await prisma.assignment.create({
      data: {
        publicId: publicId('ASN'),
        incidentId: activeRecord.id,
        assignedBy: coordinator.user.id,
        status: 'ASSIGNED',
        assignedAt: new Date(),
        fieldTeamId: team.id,
        items: { create: [{ shelterId: activeShelter.id, quantity: 1 }] },
      },
    });
    await prisma.assignment.create({
      data: {
        publicId: publicId('ASN'),
        incidentId: resolvedRecord.id,
        assignedBy: coordinator.user.id,
        status: 'COMPLETED',
        assignedAt: new Date(),
        fieldTeamId: team.id,
        items: { create: [{ shelterId: resolvedShelter.id, quantity: 1 }] },
      },
    });

    const ctx = await resolveRagToolContext({
      userId: officer.user.id,
      userRole: 'FIELD_OFFICER',
    });
    const result = await executeRagTool(ctx, 'get_shelter_capacity', { limit: 10 });
    expect(result.outcome).toBe('SUCCESS');
    expect(result.records.map((record) => record.shelter_id)).toEqual([activeShelter.publicId]);
    expect(result.records[0]).toMatchObject({
      available_capacity: 60,
      total_capacity: 100,
      current_occupancy: 40,
    });
    expect(result.records.some((record) => record.shelter_id === unassignedShelter.publicId)).toBe(false);
  });

  it('scopes assignments and filters by trimmed incident id', async () => {
    const officer = await createAuthedUser('FIELD_OFFICER');
    const otherOfficer = await createAuthedUser('FIELD_OFFICER');
    const citizen = await createAuthedUser('CITIZEN');
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    const team = await createTeam({ leaderUserId: officer.user.id });
    await createTeam({ leaderUserId: otherOfficer.user.id });

    const incidentA = await createIncident(citizen.token, { description: 'A' });
    const incidentB = await createIncident(citizen.token, { description: 'B' });
    const recordA = await prisma.incident.findUniqueOrThrow({
      where: { publicId: incidentA.body.data.incident_id },
    });
    const recordB = await prisma.incident.findUniqueOrThrow({
      where: { publicId: incidentB.body.data.incident_id },
    });
    const assignmentA = await prisma.assignment.create({
      data: {
        publicId: publicId('ASN'),
        incidentId: recordA.id,
        assignedBy: coordinator.user.id,
        status: 'ASSIGNED',
        assignedAt: new Date(),
        fieldTeamId: team.id,
      },
    });
    await prisma.assignment.create({
      data: {
        publicId: publicId('ASN'),
        incidentId: recordB.id,
        assignedBy: coordinator.user.id,
        status: 'ASSIGNED',
        assignedAt: new Date(),
        fieldTeamId: team.id,
      },
    });

    const ctx = await resolveRagToolContext({
      userId: officer.user.id,
      userRole: 'FIELD_OFFICER',
    });
    const filtered = await executeRagTool(ctx, 'get_current_assignments', {
      incident_id: `  ${incidentA.body.data.incident_id}  `,
      limit: 10,
    });
    expect(filtered.records.map((record) => record.assignment_id)).toEqual([
      assignmentA.publicId,
    ]);
    expect(filtered.records[0]).not.toHaveProperty('assigned_by');
    expect(filtered.records[0]).not.toHaveProperty('notes');

    const all = await executeRagTool(ctx, 'get_current_assignments', { limit: 10 });
    expect(all.records).toHaveLength(2);
  });
});

describe('RAG tool validation and degraded outcomes', () => {
  it('rejects malformed arguments before touching data', async () => {
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    const ctx = await resolveRagToolContext({
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
    });

    await expect(executeRagTool(ctx, 'get_active_incidents', { limit: 51 })).rejects.toBeTruthy();
    await expect(
      executeRagTool(ctx, 'get_active_incidents', { limit: 10, unexpected: true }),
    ).rejects.toBeTruthy();
    await expect(
      executeRagTool(ctx, 'get_shelter_capacity', { latitude: 22.57, limit: 10 }),
    ).rejects.toBeTruthy();
    await expect(
      executeRagTool(ctx, 'get_nearby_ambulances', {
        latitude: 22.57,
        longitude: 88.36,
        radius_km: 101,
        limit: 10,
      }),
    ).rejects.toBeTruthy();
    await expect(
      executeRagTool(ctx, 'get_current_assignments', { incident_id: '   ', limit: 10 }),
    ).rejects.toBeTruthy();
  });

  it('reports EMPTY, truncation and a stable as_of timestamp', async () => {
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    const citizen = await createAuthedUser('CITIZEN');
    const ctx = await resolveRagToolContext({
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
    });

    const empty = await executeRagTool(ctx, 'get_active_incidents', { limit: 10 });
    expect(empty.outcome).toBe('EMPTY');
    expect(empty.returned_count).toBe(0);
    expect(empty.truncated).toBe(false);
    expectIso(empty.as_of);

    for (let i = 0; i < 3; i += 1) {
      await createIncident(citizen.token, { description: `Incident ${i}` });
    }
    const truncated = await executeRagTool(ctx, 'get_active_incidents', { limit: 2 });
    expect(truncated.outcome).toBe('SUCCESS');
    expect(truncated.returned_count).toBe(2);
    expect(truncated.records).toHaveLength(2);
    expect(truncated.truncated).toBe(true);
  });

  it('returns UNAVAILABLE when the domain query fails and stays read-only', async () => {
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    const citizen = await createAuthedUser('CITIZEN');
    await createIncident(citizen.token);
    await createResource({ name: 'Ambulance' });
    await createShelter({ name: 'Shelter' });
    await createTeam({ name: 'Team' });
    const ctx = await resolveRagToolContext({
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
    });

    const countsBefore = await Promise.all([
      prisma.incident.count(),
      prisma.resource.count(),
      prisma.shelter.count(),
      prisma.fieldTeam.count(),
      prisma.assignment.count(),
    ]);

    const spy = vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('database unavailable'));
    const degraded = await executeRagTool(ctx, 'get_active_incidents', { limit: 10 });
    spy.mockRestore();
    if (degraded.outcome !== 'UNAVAILABLE') {
      throw new Error('expected UNAVAILABLE outcome');
    }
    expect(degraded.records).toEqual([]);
    expect(degraded.message).toBeTruthy();
    expectIso(degraded.as_of);

    await executeRagTool(ctx, 'get_active_incidents', { limit: 10 });
    await executeRagTool(ctx, 'get_nearby_ambulances', {
      latitude: 22.5726,
      longitude: 88.3639,
      radius_km: 10,
      limit: 10,
    });
    await executeRagTool(ctx, 'get_available_rescue_teams', { limit: 10 });
    await executeRagTool(ctx, 'get_shelter_capacity', { limit: 10 });
    await executeRagTool(ctx, 'get_resource_stock', { limit: 10 });
    await executeRagTool(ctx, 'get_current_assignments', { limit: 10 });

    const countsAfter = await Promise.all([
      prisma.incident.count(),
      prisma.resource.count(),
      prisma.shelter.count(),
      prisma.fieldTeam.count(),
      prisma.assignment.count(),
    ]);
    expect(countsAfter).toEqual(countsBefore);
  });
});
