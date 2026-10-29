import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import prisma from '../src/lib/prisma';
import { publicId } from '../src/lib/publicId';
import { queryAssignments } from '../src/lib/assignmentSerializer';
import {
  queryIncidentList,
  queryResourceList,
  queryShelterList,
  queryTeamList,
} from '../src/lib/domainQueries';
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

describe('scoped domain queries', () => {
  it('applies incident, resource, shelter, team and assignment scopes', async () => {
    const citizenA = await createAuthedUser('CITIZEN');
    const citizenB = await createAuthedUser('CITIZEN');
    const officer1 = await createAuthedUser('FIELD_OFFICER');
    const officer2 = await createAuthedUser('FIELD_OFFICER');
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');

    const team1 = await createTeam({ name: 'Team One', leaderUserId: officer1.user.id });
    const team2 = await createTeam({ name: 'Team Two', leaderUserId: officer2.user.id });

    const incidentA = await createIncident(citizenA.token, { description: 'Incident A' });
    const incidentB = await createIncident(citizenB.token, { description: 'Incident B' });
    const incidentBRecord = await prisma.incident.findUniqueOrThrow({
      where: { publicId: incidentB.body.data.incident_id },
    });

    const resource1 = await createResource({ name: 'Team One Ambulance' });
    const resource2 = await createResource({ name: 'Team Two Ambulance' });
    await prisma.$executeRaw`UPDATE "Resource" SET "teamId" = ${team1.id} WHERE "id" = ${resource1.id}`;
    await prisma.$executeRaw`UPDATE "Resource" SET "teamId" = ${team2.id} WHERE "id" = ${resource2.id}`;

    const shelter1 = await createShelter({ name: 'Shelter One' });
    const shelter2 = await createShelter({ name: 'Shelter Two' });

    const assignment = await prisma.assignment.create({
      data: {
        publicId: publicId('ASN'),
        incidentId: incidentBRecord.id,
        assignedBy: coordinator.user.id,
        status: 'ASSIGNED',
        assignedAt: new Date(),
        fieldTeamId: team1.id,
        items: { create: [{ shelterId: shelter1.id, quantity: 1 }] },
      },
    });

    const reporterIncidents = await queryIncidentList({
      scope: { kind: 'REPORTER', userId: citizenA.user.id },
      query: page,
    });
    expect(reporterIncidents.items.map((item) => item.publicId)).toEqual([
      incidentA.body.data.incident_id,
    ]);
    expect(reporterIncidents.total).toBe(1);

    const officerIncidents = await queryIncidentList({
      scope: { kind: 'FIELD_OFFICER', userId: officer1.user.id },
      query: page,
    });
    expect(officerIncidents.items.map((item) => item.publicId)).toEqual([
      incidentB.body.data.incident_id,
    ]);

    const limitedIncidents = await queryIncidentList({
      scope: { kind: 'ALL' },
      query: { page: 1, limit: 1, sort: 'newest' },
    });
    expect(limitedIncidents.items).toHaveLength(1);
    expect(limitedIncidents.total).toBe(2);

    const ownResources = await queryResourceList({
      scope: { kind: 'OWN_TEAM', userId: officer1.user.id },
      query: page,
      requesterId: officer1.user.id,
    });
    expect(ownResources.items.map((item) => item.id)).toEqual([resource1.publicId]);

    const ownShelters = await queryShelterList({
      scope: { kind: 'FIELD_OFFICER', userId: officer1.user.id },
      query: page,
    });
    expect(ownShelters.items.map((item) => item.id)).toEqual([shelter1.publicId]);
    expect(ownShelters.total).toBe(1);

    const ownTeams = await queryTeamList({
      scope: { kind: 'OWN_TEAM', userId: officer1.user.id },
      query: page,
    });
    expect(ownTeams.items.map((item) => item.publicId)).toEqual([team1.publicId]);
    expect(ownTeams.total).toBe(1);

    const ownAssignments = await queryAssignments({
      scope: { kind: 'OWN_TEAM', userId: officer1.user.id },
      query: page,
    });
    expect(ownAssignments.items.map((item) => item.id)).toEqual([assignment.publicId]);
    expect(ownAssignments.pagination.total).toBe(1);

    const otherAssignments = await queryAssignments({
      scope: { kind: 'OWN_TEAM', userId: officer2.user.id },
      query: page,
    });
    expect(otherAssignments.items).toHaveLength(0);
  });
});
