import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { testApp } from './helpers';
import prisma from '../src/lib/prisma';
import { publicId } from '../src/lib/publicId';
import { createAuthedUser, truncateTables } from './helpers';

describe('Audit — visibility / scoping', () => {
  let adminToken: string;
  let coordToken: string;
  let foToken: string;
  let citizenToken: string;

  beforeEach(async () => {
    await truncateTables();
    const admin = await createAuthedUser('ADMINISTRATOR');
    adminToken = admin.token;
    const coord = await createAuthedUser('DISASTER_COORDINATOR');
    coordToken = coord.token;
    const fo = await createAuthedUser('FIELD_OFFICER');
    foToken = fo.token;
    const citizen = await createAuthedUser('CITIZEN');
    citizenToken = citizen.token;
  });

  it('admin can list audit logs', async () => {
    const res = await request(testApp)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('coordinator can list audit logs', async () => {
    const res = await request(testApp)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${coordToken}`);
    expect(res.status).toBe(200);
  });

  it('field officer gets 403', async () => {
    const res = await request(testApp)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${foToken}`);
    expect(res.status).toBe(403);
  });

  it('citizen gets 403', async () => {
    const res = await request(testApp)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${citizenToken}`);
    expect(res.status).toBe(403);
  });

  it('unauthenticated gets 401', async () => {
    const res = await request(testApp).get('/api/v1/audit-logs');
    expect(res.status).toBe(401);
  });

  it('detail: admin and coordinator allowed, others 403', async () => {
    // Create an audit record
    const audit = await prisma.auditLog.create({
      data: { action: 'TEST_ACTION', entityType: 'TEST', actorUserId: null },
    });

    const adminRes = await request(testApp)
      .get(`/api/v1/audit-logs/${audit.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(200);

    const coordRes = await request(testApp)
      .get(`/api/v1/audit-logs/${audit.id}`)
      .set('Authorization', `Bearer ${coordToken}`);
    expect(coordRes.status).toBe(200);

    const foRes = await request(testApp)
      .get(`/api/v1/audit-logs/${audit.id}`)
      .set('Authorization', `Bearer ${foToken}`);
    expect(foRes.status).toBe(403);

    const citRes = await request(testApp)
      .get(`/api/v1/audit-logs/${audit.id}`)
      .set('Authorization', `Bearer ${citizenToken}`);
    expect(citRes.status).toBe(403);
  });

  it('detail returns 404 for unknown log', async () => {
    const res = await request(testApp)
      .get('/api/v1/audit-logs/nonexistent-id')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe('Audit — admin ops create records', () => {
  let adminToken: string;

  beforeEach(async () => {
    await truncateTables();
    const admin = await createAuthedUser('ADMINISTRATOR');
    adminToken = admin.token;
  });

  it('USER_CREATE audit exists after provisioning', async () => {
    const email = `audit-create-${Date.now()}@test.local`;
    await request(testApp)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Audited Create', email, role: 'CITIZEN' });

    const res = await request(testApp)
      .get('/api/v1/audit-logs?action=USER_CREATE')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.items[0].action).toBe('USER_CREATE');
    expect(res.body.data.items[0].entity_type).toBe('USER');
  });

  it('USER_UPDATE audit exists after role change', async () => {
    const { user } = await createAuthedUser('CITIZEN');
    await request(testApp)
      .patch(`/api/v1/users/${user.publicId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'FIELD_OFFICER' });

    const res = await request(testApp)
      .get(`/api/v1/audit-logs?action=USER_UPDATE&entity_type=USER`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.some((l: Record<string, unknown>) => l.action === 'USER_UPDATE')).toBe(true);
  });

  it('USER_DEACTIVATE audit exists after deactivation', async () => {
    const { user } = await createAuthedUser('CITIZEN');
    await request(testApp)
      .post(`/api/v1/users/${user.publicId}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);

    const res = await request(testApp)
      .get('/api/v1/audit-logs?action=USER_DEACTIVATE')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Audit — filtering', () => {
  let adminToken: string;

  beforeEach(async () => {
    await truncateTables();
    const admin = await createAuthedUser('ADMINISTRATOR');
    adminToken = admin.token;
  });

  it('filters by action', async () => {
    const res = await request(testApp)
      .get('/api/v1/audit-logs?action=USER_CREATE')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.every((l: Record<string, unknown>) => l.action === 'USER_CREATE')).toBe(true);
  });

  it('filters by entity_type', async () => {
    const res = await request(testApp)
      .get('/api/v1/audit-logs?entity_type=USER')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.every((l: Record<string, unknown>) => l.entity_type === 'USER')).toBe(true);
  });

  it('filters by actor_user_id (public ID)', async () => {
    // Create a user to generate an audit with actor
    const { user } = await createAuthedUser('CITIZEN');
    await request(testApp)
      .patch(`/api/v1/users/${user.publicId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Name' });

    // Get the actor's public ID from the admin
    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMINISTRATOR' } });
    const res = await request(testApp)
      .get(`/api/v1/audit-logs?actor_user_id=${adminUser!.publicId}&entity_type=USER`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.every((l: Record<string, unknown>) => l.actor_user_id === adminUser!.id)).toBe(true);
  });

  it('searches by action/entity_type', async () => {
    const res = await request(testApp)
      .get('/api/v1/audit-logs?search=USER')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  it('filters by time range (from/to)', async () => {
    const res = await request(testApp)
      .get(`/api/v1/audit-logs?from=2020-01-01T00:00:00Z&to=2099-12-31T23:59:59Z`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  it('returns empty for actor_user_id that resolves to no user', async () => {
    const res = await request(testApp)
      .get('/api/v1/audit-logs?actor_user_id=USR-DOESNOT')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
  });
});

describe('Audit — read-only surface', () => {
  it('POST /api/v1/audit-logs returns 404 (no create endpoint)', async () => {
    await truncateTables();
    const admin = await createAuthedUser('ADMINISTRATOR');
    const res = await request(testApp)
      .post('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ action: 'FAKE' });
    expect(res.status).toBe(404);
  });

  it('DELETE /api/v1/audit-logs/:id returns 404 (no delete endpoint)', async () => {
    await truncateTables();
    const admin = await createAuthedUser('ADMINISTRATOR');
    const audit = await prisma.auditLog.create({
      data: { action: 'TEST_ACTION', entityType: 'TEST', actorUserId: null },
    });
    const res = await request(testApp)
      .delete(`/api/v1/audit-logs/${audit.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(404);
  });
});
