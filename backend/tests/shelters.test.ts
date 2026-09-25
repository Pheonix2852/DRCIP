import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import prisma from '../src/lib/prisma';
import { testApp, createAuthedUser, truncateTables, authHeader, createShelter } from './helpers';

const API = '/api/v1/shelters';

beforeEach(async () => { await truncateTables(); });

// ─── Authentication & Authorization ───────────────────────────────────────────

describe('Shelters — authentication & authorization', () => {
  it('rejects unauthenticated access (401)', async () => {
    const res = await request(testApp).get(API);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a citizen on all shelter endpoints (403)', async () => {
    const { token } = await createAuthedUser('CITIZEN');
    const shelter = await createShelter();

    const calls = [
      request(testApp).get(API),
      request(testApp).post(API).send({}),
      request(testApp).get(`${API}/${shelter.publicId}`),
      request(testApp).patch(`${API}/${shelter.publicId}`).send({}),
    ];
    for (const call of calls) {
      const res = await call.set(authHeader(token));
      expect(res.status).toBe(403);
    }
  });

  it('lets a Field Officer read shelters but not create/update', async () => {
    const { token } = await createAuthedUser('FIELD_OFFICER');
    const list = await request(testApp).get(API).set(authHeader(token));
    expect(list.status).toBe(200);

    const create = await request(testApp).post(API).set(authHeader(token)).send({});
    expect(create.status).toBe(403);

    const shelter = await createShelter();
    const patch = await request(testApp).patch(`${API}/${shelter.publicId}`).set(authHeader(token)).send({ name: 'X' });
    expect(patch.status).toBe(403);
  });

  it('lets Coordinator/Admin perform full CRUD', async () => {
    for (const role of ['DISASTER_COORDINATOR', 'ADMINISTRATOR'] as const) {
      const { token } = await createAuthedUser(role);

      const createRes = await request(testApp).post(API).set(authHeader(token)).send({
        name: `${role} Shelter`, latitude: 22.58, longitude: 88.37, total_capacity: 100,
      });
      expect(createRes.status).toBe(201);
      expect(createRes.body.data.shelter_id).toMatch(/^SHL-/);

      const id = createRes.body.data.shelter_id;

      const detail = await request(testApp).get(`${API}/${id}`).set(authHeader(token));
      expect(detail.status).toBe(200);
      expect(detail.body.data.name).toBe(`${role} Shelter`);

      const patch = await request(testApp).patch(`${API}/${id}`).set(authHeader(token)).send({ name: 'Updated' });
      expect(patch.status).toBe(200);
      expect(patch.body.data.name).toBe('Updated');
    }
  });
});

// ─── Create Validation ────────────────────────────────────────────────────────

describe('Shelters — create validation', () => {
  it('rejects missing required fields', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const res = await request(testApp).post(API).set(authHeader(token)).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects out-of-range coordinates', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    expect((await request(testApp).post(API).set(authHeader(token)).send({ name: 'S', latitude: 999, longitude: 88.37, total_capacity: 10 })).status).toBe(400);
    expect((await request(testApp).post(API).set(authHeader(token)).send({ name: 'S', latitude: 22.58, longitude: 999, total_capacity: 10 })).status).toBe(400);
  });

  it('rejects negative capacity', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const res = await request(testApp).post(API).set(authHeader(token)).send({ name: 'S', latitude: 22.58, longitude: 88.37, total_capacity: -1 });
    expect(res.status).toBe(400);
  });

  it('rejects occupancy > capacity on create', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const res = await request(testApp).post(API).set(authHeader(token)).send({ name: 'S', latitude: 22.58, longitude: 88.37, total_capacity: 10, current_occupancy: 50 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts capacity 0 and occupancy 0 as explicit values', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const res = await request(testApp).post(API).set(authHeader(token)).send({ name: 'S', latitude: 22.58, longitude: 88.37, total_capacity: 0, current_occupancy: 0 });
    expect(res.status).toBe(201);
  });

  it('creates with audit log', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const res = await request(testApp).post(API).set(authHeader(token)).send({ name: 'Alpha', latitude: 22.58, longitude: 88.37, total_capacity: 100 });
    expect(res.status).toBe(201);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'SHELTER_CREATE' } });
    expect(audit).not.toBeNull();
    expect((audit?.afterState as any)?.public_id).toBe(res.body.data.shelter_id);
  });
});

// ─── Update Validation ────────────────────────────────────────────────────────

describe('Shelters — update validation', () => {
  it('rejects an empty update', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const shelter = await createShelter();
    const res = await request(testApp).patch(`${API}/${shelter.publicId}`).set(authHeader(token)).send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown shelter', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const res = await request(testApp).patch(`${API}/SHL-UNKNOWN`).set(authHeader(token)).send({ name: 'X' });
    expect(res.status).toBe(404);
  });

  it('rejects occupancy > capacity on update', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const shelter = await createShelter({ total_capacity: 10 });
    const res = await request(testApp).patch(`${API}/${shelter.publicId}`).set(authHeader(token)).send({ current_occupancy: 50 });
    expect(res.status).toBe(400);
  });

  it('updates and writes audit log', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const shelter = await createShelter({ name: 'Before' });
    const res = await request(testApp).patch(`${API}/${shelter.publicId}`).set(authHeader(token)).send({ name: 'After' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('After');
    const audit = await prisma.auditLog.findFirst({ where: { action: 'SHELTER_UPDATE' } });
    expect(audit).not.toBeNull();
  });
});

// ─── PostGIS Spatial ──────────────────────────────────────────────────────────

describe('Shelters — spatial persistence & nearby filtering', () => {
  it('round-trips coordinates through PostGIS', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const res = await request(testApp).post(API).set(authHeader(token)).send({
      name: 'Geo Shelter', latitude: 22.5726, longitude: 88.3639, total_capacity: 50,
    });
    expect(res.status).toBe(201);
    const detail = await request(testApp).get(`${API}/${res.body.data.shelter_id}`).set(authHeader(token));
    expect(detail.body.data.latitude).toBeCloseTo(22.5726, 6);
    expect(detail.body.data.longitude).toBeCloseTo(88.3639, 6);
  });

  it('filters by ST_DWithin radius', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const near = await createShelter({ name: 'Near', latitude: 22.5726, longitude: 88.3639 });
    const far = await createShelter({ name: 'Far', latitude: 19.076, longitude: 72.8777 });

    const res = await request(testApp)
      .get(API)
      .query({ nearby_lat: 22.57, nearby_lng: 88.36, nearby_radius_km: 10 })
      .set(authHeader(token));
    expect(res.status).toBe(200);
    const ids = res.body.data.items.map((i: any) => i.id);
    expect(ids).toContain(near.publicId);
    expect(ids).not.toContain(far.publicId);
  });

  it('rejects incomplete nearby filters', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const res = await request(testApp).get(API).query({ nearby_lat: 22.57 }).set(authHeader(token));
    expect(res.status).toBe(400);
  });
});

// ─── Filters ──────────────────────────────────────────────────────────────────

describe('Shelters — filters, pagination & sorting', () => {
  it('filters by status and search', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    await createShelter({ name: 'Shelter Alpha', status: 'AVAILABLE' });
    await createShelter({ name: 'Shelter Beta', status: 'FULL' });

    const byStatus = await request(testApp).get(API).query({ status: 'FULL' }).set(authHeader(token));
    expect(byStatus.body.data.items.length).toBe(1);
    expect(byStatus.body.data.items[0].status).toBe('FULL');

    const bySearch = await request(testApp).get(API).query({ search: 'alpha' }).set(authHeader(token));
    expect(bySearch.body.data.items.length).toBe(1);
    expect(bySearch.body.data.items[0].name).toBe('Shelter Alpha');
  });

  it('filters by min_available_capacity', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    await createShelter({ name: 'Full', total_capacity: 10, current_occupancy: 10 });
    await createShelter({ name: 'Open', total_capacity: 100, current_occupancy: 10 });

    const res = await request(testApp).get(API).query({ min_available_capacity: 50 }).set(authHeader(token));
    expect(res.body.data.items.length).toBe(1);
    expect(res.body.data.items[0].name).toBe('Open');
  });

  it('paginates and sorts', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    await createShelter({ name: 'S1' });
    await createShelter({ name: 'S2' });
    await createShelter({ name: 'S3' });

    const page1 = await request(testApp).get(API).query({ limit: 2, page: 1, sort: 'oldest' }).set(authHeader(token));
    expect(page1.body.data.items.length).toBe(2);
    expect(page1.body.data.pagination.total).toBe(3);
    expect(page1.body.data.pagination.total_pages).toBe(2);

    const page2 = await request(testApp).get(API).query({ limit: 2, page: 2, sort: 'oldest' }).set(authHeader(token));
    expect(page2.body.data.items.length).toBe(1);
  });
});

// ─── Not-Found & Error Cases ─────────────────────────────────────────────────

describe('Shelters — not-found & error cases', () => {
  it('returns 404 with common envelope for unknown shelter', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const res = await request(testApp).get(`${API}/SHL-UNKNOWN`).set(authHeader(token));
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    expect(res.body.request_id).toBeDefined();
  });

  it('returns correct error envelope on validation failure', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const res = await request(testApp).post(API).set(authHeader(token)).send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.request_id).toBeDefined();
  });
});
