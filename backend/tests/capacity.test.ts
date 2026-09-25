import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { testApp, createAuthedUser, truncateTables, authHeader, createResource, createShelter, createTeam } from './helpers';

const API = '/api/v1/capacity';

beforeEach(async () => { await truncateTables(); });

describe('Capacity — authentication & authorization', () => {
  it('rejects unauthenticated access (401)', async () => {
    const res = await request(testApp).get(API);
    expect(res.status).toBe(401);
  });

  it('rejects Citizen and Field Officer (403)', async () => {
    for (const role of ['CITIZEN', 'FIELD_OFFICER'] as const) {
      const { token } = await createAuthedUser(role);
      const res = await request(testApp).get(API).set(authHeader(token));
      expect(res.status).toBe(403);
    }
  });

  it('allows Coordinator and Administrator (200)', async () => {
    for (const role of ['DISASTER_COORDINATOR', 'ADMINISTRATOR'] as const) {
      const { token } = await createAuthedUser(role);
      const res = await request(testApp).get(API).set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }
  });
});

describe('Capacity — aggregation behavior', () => {
  it('returns zeros (not null/NaN) when there is no data', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const res = await request(testApp).get(API).set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      available_resources: 0,
      active_teams: 0,
      available_shelter_capacity: 0,
    });
  });

  it('counts only AVAILABLE resources', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    await createResource({ status: 'AVAILABLE' });
    await createResource({ status: 'AVAILABLE' });
    await createResource({ status: 'DEPLOYED' });
    await createResource({ status: 'UNAVAILABLE' });

    const res = await request(testApp).get(API).set(authHeader(token));
    expect(res.body.data.available_resources).toBe(2);
  });

  it('counts only ACTIVE teams', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    await createTeam({ status: 'ACTIVE' });
    await createTeam({ status: 'DEPLOYED' });
    await createTeam({ status: 'UNAVAILABLE' });

    const res = await request(testApp).get(API).set(authHeader(token));
    expect(res.body.data.active_teams).toBe(1);
  });

  it('sums available capacity across AVAILABLE shelters only', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    await createShelter({ status: 'AVAILABLE', total_capacity: 100, current_occupancy: 20 }); // 80
    await createShelter({ status: 'AVAILABLE', total_capacity: 50, current_occupancy: 50 });  // 0
    await createShelter({ status: 'FULL', total_capacity: 100, current_occupancy: 100 });     // excluded
    await createShelter({ status: 'UNAVAILABLE', total_capacity: 100, current_occupancy: 0 }); // excluded

    const res = await request(testApp).get(API).set(authHeader(token));
    expect(res.body.data.available_shelter_capacity).toBe(80);
  });

  it('handles a zero-capacity shelter without producing NaN', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    await createShelter({ status: 'AVAILABLE', total_capacity: 0, current_occupancy: 0 });

    const res = await request(testApp).get(API).set(authHeader(token));
    expect(res.body.data.available_shelter_capacity).toBe(0);
  });

  it('combines all three signals in a single response', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    await createResource({ status: 'AVAILABLE' });
    await createTeam({ status: 'ACTIVE' });
    await createShelter({ status: 'AVAILABLE', total_capacity: 200, current_occupancy: 50 });

    const res = await request(testApp).get(API).set(authHeader(token));
    expect(res.body.data).toEqual({
      available_resources: 1,
      active_teams: 1,
      available_shelter_capacity: 150,
    });
  });

  it('reflects REST state immediately (no stale cache)', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const first = await request(testApp).get(API).set(authHeader(token));
    expect(first.body.data.available_resources).toBe(0);

    await createResource({ status: 'AVAILABLE' });
    const second = await request(testApp).get(API).set(authHeader(token));
    expect(second.body.data.available_resources).toBe(1);
  });
});
