import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { testApp } from './helpers';
import prisma from '../src/lib/prisma';
import { publicId } from '../src/lib/publicId';
import { createAuthedUser, truncateTables } from './helpers';

describe('Users — listing', () => {
  let adminToken: string;

  beforeEach(async () => {
    await truncateTables();
    const admin = await createAuthedUser('ADMINISTRATOR');
    adminToken = admin.token;
    // seed a few users
    await createAuthedUser('FIELD_OFFICER');
    await createAuthedUser('CITIZEN');
    await createAuthedUser('DISASTER_COORDINATOR');
  });

  it('returns paginated user list', async () => {
    const res = await request(testApp)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(4);
    expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(4);
  });

  it('filters by role', async () => {
    const res = await request(testApp)
      .get('/api/v1/users?role=FIELD_OFFICER')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.every((u: Record<string, unknown>) => u.role === 'FIELD_OFFICER')).toBe(true);
  });

  it('filters by active status', async () => {
    const res = await request(testApp)
      .get('/api/v1/users?active=true')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.every((u: Record<string, unknown>) => u.is_active === true)).toBe(true);
  });

  it('searches by name/email', async () => {
    // Create a user with a known name
    const pw = await bcrypt.hash('Pass!1', 4);
    const ref = publicId('USR');
    await prisma.user.create({
      data: { publicId: ref, fullName: 'Alice Searchable', email: `alice-${Date.now()}@test.local`, passwordHash: pw, role: 'CITIZEN' },
    });

    const res = await request(testApp)
      .get('/api/v1/users?search=Alice')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.some((u: Record<string, unknown>) => u.name === 'Alice Searchable')).toBe(true);
  });

  it('returns 403 for non-admin', async () => {
    const { token } = await createAuthedUser('FIELD_OFFICER');
    const res = await request(testApp)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

describe('Users — detail', () => {
  let adminToken: string;

  beforeEach(async () => {
    await truncateTables();
    const admin = await createAuthedUser('ADMINISTRATOR');
    adminToken = admin.token;
  });

  it('returns user detail with extra fields', async () => {
    const { user } = await createAuthedUser('CITIZEN');
    const res = await request(testApp)
      .get(`/api/v1/users/${user.publicId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(user.publicId);
    expect(res.body.data).toHaveProperty('updated_at');
    expect(res.body.data).toHaveProperty('last_login_at');
    expect(res.body.data).toHaveProperty('created_by');
  });

  it('returns 404 for unknown user', async () => {
    const res = await request(testApp)
      .get('/api/v1/users/USR-DOESNOT')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('Users — provisioning', () => {
  let adminToken: string;

  beforeEach(async () => {
    await truncateTables();
    const admin = await createAuthedUser('ADMINISTRATOR');
    adminToken = admin.token;
  });

  it('creates a user with 201', async () => {
    const res = await request(testApp)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'New Officer', email: `newfo-${Date.now()}@test.local`, role: 'FIELD_OFFICER' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('New Officer');
    expect(res.body.data.role).toBe('FIELD_OFFICER');
    expect(res.body.data.is_active).toBe(true);
  });

  it('creates a USER_CREATE audit record', async () => {
    const email = `audit-user-${Date.now()}@test.local`;
    await request(testApp)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Audited User', email, role: 'CITIZEN' });

    const audit = await prisma.auditLog.findFirst({ where: { action: 'USER_CREATE' } });
    expect(audit).not.toBeNull();
    expect(audit!.entityType).toBe('USER');
  });

  it('returns 409 for duplicate email', async () => {
    const email = `dup-${Date.now()}@test.local`;
    await request(testApp)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'First', email, role: 'CITIZEN' });

    const res = await request(testApp)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Second', email, role: 'CITIZEN' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_EXISTS');
  });

  it('rejects invalid input', async () => {
    const res = await request(testApp)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '', email: 'bad', role: 'NOPE' });

    expect(res.status).toBe(400);
  });

  it('newly created user can authenticate', async () => {
    const email = `login-test-${Date.now()}@test.local`;
    await request(testApp)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Login User', email, role: 'CITIZEN' });

    const login = await request(testApp)
      .post('/api/v1/auth/login')
      .send({ email, password: 'TempPassword123!' });

    expect(login.status).toBe(200);
    expect(login.body.data.access_token).toBeDefined();
  });
});

describe('Users — role change', () => {
  let adminToken: string;
  let adminUser: { publicId: string; id: string };

  beforeEach(async () => {
    await truncateTables();
    const admin = await createAuthedUser('ADMINISTRATOR');
    adminToken = admin.token;
    adminUser = { publicId: admin.user.publicId, id: admin.user.id };
  });

  it('updates name', async () => {
    const { user } = await createAuthedUser('CITIZEN');
    const res = await request(testApp)
      .patch(`/api/v1/users/${user.publicId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Renamed' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Renamed');
  });

  it('updates role and creates audit', async () => {
    const { user } = await createAuthedUser('CITIZEN');
    const res = await request(testApp)
      .patch(`/api/v1/users/${user.publicId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'FIELD_OFFICER' });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('FIELD_OFFICER');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'USER_UPDATE', entityId: user.id },
    });
    expect(audit).not.toBeNull();
    expect(audit!.beforeState).toHaveProperty('role', 'CITIZEN');
    expect(audit!.afterState).toHaveProperty('role', 'FIELD_OFFICER');
  });

  it('rejects self role change', async () => {
    const res = await request(testApp)
      .patch(`/api/v1/users/${adminUser.publicId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'CITIZEN' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SELF_ROLE_CHANGE');
  });

  it('rejects demotion of last active admin (defense-in-depth: SELF_ROLE_CHANGE fires first)', async () => {
    // LAST_ADMINISTRATOR is defense-in-depth; SELF_ROLE_CHANGE catches the only reachable case.
    const res = await request(testApp)
      .patch(`/api/v1/users/${adminUser.publicId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'CITIZEN' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SELF_ROLE_CHANGE');
  });

  it('allows demoting admin when 2+ admins exist', async () => {
    const { user: secondAdmin } = await createAuthedUser('ADMINISTRATOR');
    const res = await request(testApp)
      .patch(`/api/v1/users/${secondAdmin.publicId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'CITIZEN' });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('CITIZEN');
  });

  it('rejects role change away from team-leading FO', async () => {
    const fo = await createAuthedUser('FIELD_OFFICER');
    await prisma.fieldTeam.create({
      data: {
        publicId: publicId('TEAM'),
        name: 'Test Team',
        leaderUserId: fo.user.id,
      },
    });

    const res = await request(testApp)
      .patch(`/api/v1/users/${fo.user.publicId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'CITIZEN' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEAM_LEADER_ROLE_CONFLICT');
  });

  it('allows role change to FIELD_OFFICER (TO)', async () => {
    const { user } = await createAuthedUser('CITIZEN');
    const res = await request(testApp)
      .patch(`/api/v1/users/${user.publicId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'FIELD_OFFICER' });

    expect(res.status).toBe(200);
  });

  it('rejects empty update', async () => {
    const { user } = await createAuthedUser('CITIZEN');
    const res = await request(testApp)
      .patch(`/api/v1/users/${user.publicId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('Users — deactivation', () => {
  let adminToken: string;
  let adminUser: { publicId: string; id: string };

  beforeEach(async () => {
    await truncateTables();
    const admin = await createAuthedUser('ADMINISTRATOR');
    adminToken = admin.token;
    adminUser = { publicId: admin.user.publicId, id: admin.user.id };
  });

  it('deactivates a user and creates audit', async () => {
    const { user } = await createAuthedUser('CITIZEN');
    const res = await request(testApp)
      .post(`/api/v1/users/${user.publicId}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.is_active).toBe(false);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'USER_DEACTIVATE', entityId: user.id },
    });
    expect(audit).not.toBeNull();
  });

  it('is idempotent on already-inactive user', async () => {
    const { user } = await createAuthedUser('CITIZEN');
    await request(testApp)
      .post(`/api/v1/users/${user.publicId}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);

    const res = await request(testApp)
      .post(`/api/v1/users/${user.publicId}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.is_active).toBe(false);

    // Only one audit for actual deactivation
    const audits = await prisma.auditLog.findMany({
      where: { action: 'USER_DEACTIVATE', entityId: user.id },
    });
    expect(audits.length).toBe(1);
  });

  it('rejects self-deactivation', async () => {
    const res = await request(testApp)
      .post(`/api/v1/users/${adminUser.publicId}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SELF_DEACTIVATION');
  });

  it('rejects deactivation of last active admin (defense-in-depth: SELF_DEACTIVATION fires first)', async () => {
    // LAST_ADMINISTRATOR is defense-in-depth; SELF_DEACTIVATION catches the only reachable case.
    const res = await request(testApp)
      .post(`/api/v1/users/${adminUser.publicId}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SELF_DEACTIVATION');
  });

  it('allows deactivating admin when 2+ admins exist', async () => {
    const { user: secondAdmin } = await createAuthedUser('ADMINISTRATOR');
    const res = await request(testApp)
      .post(`/api/v1/users/${secondAdmin.publicId}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.is_active).toBe(false);
  });
});

describe('Users — activation', () => {
  let adminToken: string;

  beforeEach(async () => {
    await truncateTables();
    const admin = await createAuthedUser('ADMINISTRATOR');
    adminToken = admin.token;
  });

  it('activates a deactivated user and creates audit', async () => {
    const { user } = await createAuthedUser('CITIZEN');
    // Deactivate first
    await request(testApp)
      .post(`/api/v1/users/${user.publicId}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);

    const res = await request(testApp)
      .post(`/api/v1/users/${user.publicId}/activate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.is_active).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'USER_ACTIVATE', entityId: user.id },
    });
    expect(audit).not.toBeNull();
  });

  it('is idempotent on already-active user', async () => {
    const { user } = await createAuthedUser('CITIZEN');
    const res = await request(testApp)
      .post(`/api/v1/users/${user.publicId}/activate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.is_active).toBe(true);

    // No audit for no-op
    const audits = await prisma.auditLog.findMany({
      where: { action: 'USER_ACTIVATE', entityId: user.id },
    });
    expect(audits.length).toBe(0);
  });
});

describe('Users — deactivated user auth', () => {
  it('rejects login for inactive user', async () => {
    await truncateTables();
    const admin = await createAuthedUser('ADMINISTRATOR');

    // Create a user
    const pw = await bcrypt.hash('Test1234!', 4);
    const ref = publicId('USR');
    const email = `inactive-${Date.now()}@test.local`;
    const user = await prisma.user.create({
      data: { publicId: ref, fullName: 'Inactive User', email, passwordHash: pw, role: 'CITIZEN' },
    });

    // Login works
    const login1 = await request(testApp)
      .post('/api/v1/auth/login')
      .send({ email, password: 'Test1234!' });
    expect(login1.status).toBe(200);

    // Deactivate
    await request(testApp)
      .post(`/api/v1/users/${ref}/deactivate`)
      .set('Authorization', `Bearer ${admin.token}`);

    // Login fails
    const login2 = await request(testApp)
      .post('/api/v1/auth/login')
      .send({ email, password: 'Test1234!' });
    expect(login2.status).toBe(401);
  });
});

describe('Users — RBAC', () => {
  beforeEach(() => truncateTables());

  it('returns 401 for unauthenticated requests', async () => {
    const res = await request(testApp).get('/api/v1/users');
    expect(res.status).toBe(401);
  });

  it('returns 403 for citizen', async () => {
    const { token } = await createAuthedUser('CITIZEN');
    const res = await request(testApp)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 for field officer', async () => {
    const { token } = await createAuthedUser('FIELD_OFFICER');
    const res = await request(testApp)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 for coordinator', async () => {
    const { token } = await createAuthedUser('DISASTER_COORDINATOR');
    const res = await request(testApp)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
