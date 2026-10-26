import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../src/lib/prisma';
import request from 'supertest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock('../src/services/RagService', () => ({
  RagService: vi.fn().mockImplementation(() => ({ query: queryMock })),
}));

import {
  authHeader,
  createAuthedUser,
  createIncident,
  testApp,
  truncateTables,
} from './helpers';

const groundedResponse = {
  status: 'GROUNDED',
  answer: 'Follow the approved evacuation guidance.',
  citations: [{ title: 'disaster-response.pdf', page: 15, section: 'Evacuation' }],
  tool_calls: [],
  rag_version: 'rag-v1',
};

const abstainedResponse = {
  status: 'ABSTAINED',
  answer:
    'I could not find sufficient support in the approved DRCIP knowledge base to answer that reliably.',
  citations: [],
  tool_calls: [],
  rag_version: 'rag-v1',
};

const unavailableResponse = {
  status: 'UNAVAILABLE',
  answer: 'RAG service is temporarily unavailable. Please try again later.',
  citations: [],
  tool_calls: [],
  rag_version: 'rag-v1',
};

let citizenToken: string;
let fieldOfficerToken: string;
let coordinatorToken: string;
let administratorToken: string;

beforeAll(async () => {
  await truncateTables();
  citizenToken = (await createAuthedUser('CITIZEN')).token;
  fieldOfficerToken = (await createAuthedUser('FIELD_OFFICER')).token;
  coordinatorToken = (await createAuthedUser('DISASTER_COORDINATOR')).token;
  administratorToken = (await createAuthedUser('ADMINISTRATOR')).token;
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue(groundedResponse);
});

describe('POST /api/v1/rag/query authentication and authorization', () => {
  it('returns 401 without authentication', async () => {
    const res = await request(testApp)
      .post('/api/v1/rag/query')
      .send({ query: 'What should we do?' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('allows all four authenticated roles', async () => {
    const tokens = [
      citizenToken,
      fieldOfficerToken,
      coordinatorToken,
      administratorToken,
    ];

    for (const token of tokens) {
      const res = await request(testApp)
        .post('/api/v1/rag/query')
        .set(authHeader(token))
        .send({ query: 'What should we do?' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('GROUNDED');
    }

    expect(queryMock).toHaveBeenCalledTimes(tokens.length);
  });
});

describe('POST /api/v1/rag/query validation', () => {
  it('rejects a missing query', async () => {
    const res = await request(testApp)
      .post('/api/v1/rag/query')
      .set(authHeader(citizenToken))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rejects queries shorter than 3 characters', async () => {
    for (const query of ['   ', 'ok']) {
      const res = await request(testApp)
        .post('/api/v1/rag/query')
        .set(authHeader(citizenToken))
        .send({ query });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rejects queries longer than 500 characters', async () => {
    const res = await request(testApp)
      .post('/api/v1/rag/query')
      .set(authHeader(citizenToken))
      .send({ query: 'x'.repeat(501) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('accepts a query at the 500 character limit', async () => {
    const res = await request(testApp)
      .post('/api/v1/rag/query')
      .set(authHeader(citizenToken))
      .send({ query: 'x'.repeat(500) });

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('rejects unexpected fields', async () => {
    const res = await request(testApp)
      .post('/api/v1/rag/query')
      .set(authHeader(citizenToken))
      .send({ query: 'Valid question', model: 'attacker-supplied' });

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('accepts an incident the caller may view', async () => {
    const incidentRes = await createIncident(citizenToken);
    expect(incidentRes.status).toBe(201);

    const res = await request(testApp)
      .post('/api/v1/rag/query')
      .set(authHeader(citizenToken))
      .send({
        query: 'What does the guidance say?',
        incident_id: incidentRes.body.data.incident_id,
      });

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith('What does the guidance say?');
  });

  it('does not expose another citizen incident through incident context', async () => {
    const incidentRes = await createIncident(citizenToken);
    const otherCitizen = await createAuthedUser('CITIZEN');

    const res = await request(testApp)
      .post('/api/v1/rag/query')
      .set(authHeader(otherCitizen.token))
      .send({
        query: 'What does the guidance say?',
        incident_id: incidentRes.body.data.incident_id,
      });

    expect(res.status).toBe(404);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown incident reference', async () => {
    const res = await request(testApp)
      .post('/api/v1/rag/query')
      .set(authHeader(fieldOfficerToken))
      .send({ query: 'What does the guidance say?', incident_id: 'INC-NOT-REAL' });

    expect(res.status).toBe(404);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/rag/query response contract', () => {
  it('returns the stable grounded envelope', async () => {
    const res = await request(testApp)
      .post('/api/v1/rag/query')
      .set(authHeader(citizenToken))
      .send({ query: 'What should we do?' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: groundedResponse,
    });
  });

  it('preserves abstention instead of converting it to a normal answer', async () => {
    queryMock.mockResolvedValue(abstainedResponse);

    const res = await request(testApp)
      .post('/api/v1/rag/query')
      .set(authHeader(citizenToken))
      .send({ query: 'Unsupported question' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ABSTAINED');
    expect(res.body.data.citations).toEqual([]);
  });

  it('returns UNAVAILABLE for a degraded provider', async () => {
    queryMock.mockResolvedValue(unavailableResponse);

    const res = await request(testApp)
      .post('/api/v1/rag/query')
      .set(authHeader(citizenToken))
      .send({ query: 'What should we do?' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('UNAVAILABLE');
  });

  it('does not leak provider-specific fields or credentials', async () => {
    const res = await request(testApp)
      .post('/api/v1/rag/query')
      .set(authHeader(citizenToken))
      .send({ query: 'What should we do?' });

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('model');
    expect(serialized).not.toContain('chunks_retrieved');
    expect(serialized).not.toContain('excerpt');
    expect(serialized).not.toContain('test-rag-secret-key');
  });
});
