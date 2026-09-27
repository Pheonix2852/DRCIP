import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import prisma from '../src/lib/prisma';
import { testApp, createAuthedUser, truncateTables, authHeader } from './helpers';
import { publicId } from '../src/lib/publicId';

const API = '/api/v1/response-zones';

beforeEach(async () => {
  await truncateTables();
});

async function seedZone(name: string, isActive = true) {
  const ref = publicId('ZONE');
  await prisma.$executeRaw`
    INSERT INTO "ResponseZone" ("id","publicId","name","geometry","isActive","createdAt","updatedAt")
    VALUES (
      gen_random_uuid(), ${ref}, ${name},
      ${JSON.stringify({ type: 'Polygon', coordinates: [[[88.2, 22.4], [88.4, 22.4], [88.4, 22.6], [88.2, 22.6], [88.2, 22.4]]] })}::jsonb,
      ${isActive}, now(), now()
    )
  `;
  return ref;
}

describe('Response zones — authentication & authorization', () => {
  it('rejects unauthenticated access (401)', async () => {
    const res = await request(testApp).get(API);
    expect(res.status).toBe(401);
  });

  it('rejects Citizen (403)', async () => {
    const { token } = await createAuthedUser('CITIZEN');
    const res = await request(testApp).get(API).set(authHeader(token));
    expect(res.status).toBe(403);
  });

  it('allows Field Officer, Coordinator and Administrator (200)', async () => {
    for (const role of ['FIELD_OFFICER', 'DISASTER_COORDINATOR', 'ADMINISTRATOR'] as const) {
      const { token } = await createAuthedUser(role);
      const res = await request(testApp).get(API).set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }
  });
});

describe('Response zones — listing behavior', () => {
  it('returns an empty list when no zones exist', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const res = await request(testApp).get(API).set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ items: [] });
  });

  it('returns only active zones, sorted by name', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const south = await seedZone('South Zone');
    const north = await seedZone('North Zone');
    await seedZone('Retired Zone', false);

    const res = await request(testApp).get(API).set(authHeader(token));

    expect(res.body.data.items).toEqual([
      { public_id: north, name: 'North Zone', is_active: true },
      { public_id: south, name: 'South Zone', is_active: true },
    ]);
  });

  it('returns 5 seeded demo zones with deterministic public_ids', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const zoneNames = ['North Zone', 'South Zone', 'Central Zone', 'East Zone', 'West Zone'];
    const refs: string[] = [];
    for (const name of zoneNames) {
      refs.push(await seedZone(name));
    }

    const res = await request(testApp).get(API).set(authHeader(token));

    expect(res.body.data.items).toHaveLength(5);
    expect(res.body.data.items.map((z: { name: string }) => z.name).sort()).toEqual([...zoneNames].sort());
    for (const item of res.body.data.items) {
      expect(item.public_id).toMatch(/^ZONE-/);
      expect(item.is_active).toBe(true);
    }
  });
});
