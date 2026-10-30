import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import prisma from '../src/lib/prisma';
import { RagService } from '../src/services/RagService';
import type { RagProviderResult } from '../src/services/RagProvider';
import {
  createAuthedUser,
  createShelter,
  createTeam,
  truncateTables,
} from './helpers';

function providerWith(
  toolInvocations: unknown[],
  status: RagProviderResult['status'] = 'GROUNDED',
) {
  return {
    query: vi.fn().mockResolvedValue({
      status,
      answer: 'Document answer.',
      citations: [],
      tool_invocations:
        toolInvocations as RagProviderResult['tool_invocations'],
    }),
  };
}

beforeEach(async () => {
  await truncateTables();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RAG live-tool orchestration', () => {
  it('executes an authorized live tool and records an audit trail', async () => {
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    await createShelter({
      name: 'Open Shelter',
      total_capacity: 100,
      current_occupancy: 20,
    });

    const service = new RagService(
      providerWith([
        { tool: 'get_shelter_capacity', arguments: { limit: 10 } },
      ]),
    );

    const result = await service.query('Which shelters have space?', {
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
      incidentId: 'INC-TEST-1',
      requestId: 'req-rag-1',
    });

    expect(result.rag_version).toBe('rag-v2');
    expect(result.tool_calls).toEqual([
      expect.objectContaining({
        tool: 'get_shelter_capacity',
        outcome: 'SUCCESS',
        returned_count: 1,
        truncated: false,
      }),
    ]);
    expect(result.live_evidence).toEqual([
      expect.objectContaining({
        evidence_type: 'LIVE_OPERATIONAL_DATA',
        tool: 'get_shelter_capacity',
      }),
    ]);

    const audits = await prisma.auditLog.findMany({
      orderBy: { occurredAt: 'asc' },
    });
    const toolAudit = audits.find((entry) => entry.action === 'RAG_TOOL_CALL');
    expect(toolAudit?.actorUserId).toBe(coordinator.user.id);
    expect(toolAudit?.metadata).toMatchObject({
      request_id: 'req-rag-1',
      incident_id: 'INC-TEST-1',
      tool: 'get_shelter_capacity',
      authorization: 'ALLOWED',
      outcome: 'SUCCESS',
    });
    expect(audits.some((entry) => entry.action === 'RAG_QUERY')).toBe(true);

    const serialized = JSON.stringify(audits);
    expect(serialized).not.toContain('Which shelters have space?');
    expect(serialized).not.toContain('Open Shelter');
  });

  it('denies every live tool to a citizen without returning evidence', async () => {
    const citizen = await createAuthedUser('CITIZEN');
    const service = new RagService(
      providerWith([
        { tool: 'get_active_incidents', arguments: { limit: 10 } },
      ]),
    );

    const result = await service.query('Any incidents?', {
      userId: citizen.user.id,
      userRole: 'CITIZEN',
      requestId: 'req-rag-2',
    });

    expect(result.tool_calls).toEqual([
      expect.objectContaining({
        tool: 'get_active_incidents',
        outcome: 'ERROR',
        returned_count: 0,
        truncated: false,
      }),
    ]);
    expect(result.live_evidence).toBeUndefined();

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'RAG_TOOL_CALL' },
    });
    expect(audit?.metadata).toMatchObject({
      tool: 'get_active_incidents',
      authorization: 'DENIED',
      outcome: 'ERROR',
      error_code: 'FORBIDDEN',
    });
  });

  it('denies staff-only resource stock to a field officer', async () => {
    const officer = await createAuthedUser('FIELD_OFFICER');
    await createTeam({ leaderUserId: officer.user.id });
    const service = new RagService(
      providerWith([{ tool: 'get_resource_stock', arguments: { limit: 10 } }]),
    );

    const result = await service.query('How much stock is left?', {
      userId: officer.user.id,
      userRole: 'FIELD_OFFICER',
      requestId: 'req-rag-3',
    });

    expect(result.tool_calls).toEqual([
      expect.objectContaining({
        tool: 'get_resource_stock',
        outcome: 'ERROR',
      }),
    ]);
    expect(result.live_evidence).toBeUndefined();

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'RAG_TOOL_CALL' },
    });
    expect(audit?.metadata).toMatchObject({
      authorization: 'DENIED',
      error_code: 'FORBIDDEN',
    });
  });

  it('rejects invalid tool arguments before execution', async () => {
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    const service = new RagService(
      providerWith([
        { tool: 'get_shelter_capacity', arguments: { limit: 999 } },
      ]),
    );

    const result = await service.query('Shelters?', {
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
      requestId: 'req-rag-4',
    });

    expect(result.tool_calls).toEqual([
      expect.objectContaining({
        tool: 'get_shelter_capacity',
        outcome: 'ERROR',
      }),
    ]);
    expect(result.live_evidence).toBeUndefined();

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'RAG_TOOL_CALL' },
    });
    expect(audit?.metadata).toMatchObject({
      authorization: 'DENIED',
      error_code: 'INVALID_ARGUMENTS',
    });
  });

  it('rejects a turn requesting more than four tool calls', async () => {
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    const invocations = Array.from({ length: 5 }, () => ({
      tool: 'get_shelter_capacity',
      arguments: { limit: 1 },
    }));
    const service = new RagService(providerWith(invocations));

    const result = await service.query('Shelters?', {
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
      requestId: 'req-rag-5',
    });

    expect(result.rag_version).toBe('rag-v2');
    expect(result.tool_calls).toEqual([]);
    expect(result.live_evidence).toBeUndefined();

    const turnAudit = await prisma.auditLog.findFirst({
      where: { action: 'RAG_QUERY' },
    });
    expect(turnAudit?.metadata).toMatchObject({
      tool_limit_exceeded: true,
      requested_tool_calls: 5,
    });
    expect(
      await prisma.auditLog.count({ where: { action: 'RAG_TOOL_CALL' } }),
    ).toBe(0);
  });

  it('does not return live evidence when the tool audit cannot be written', async () => {
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    await createShelter({ name: 'Audit Shelter' });
    const service = new RagService(
      providerWith([
        { tool: 'get_shelter_capacity', arguments: { limit: 10 } },
      ]),
    );

    vi.spyOn(prisma.auditLog, 'create').mockRejectedValue(
      new Error('audit unavailable'),
    );

    const result = await service.query('Shelters?', {
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
      requestId: 'req-rag-6',
    });

    expect(result.tool_calls).toEqual([
      expect.objectContaining({
        tool: 'get_shelter_capacity',
        outcome: 'ERROR',
        returned_count: 0,
      }),
    ]);
    expect(result.live_evidence).toBeUndefined();
  });

  it('keeps RAG 1.0 behavior when no authenticated context is supplied', async () => {
    const service = new RagService(
      providerWith([
        { tool: 'get_shelter_capacity', arguments: { limit: 10 } },
      ]),
    );

    const result = await service.query('Shelters?');

    expect(result).toEqual({
      status: 'GROUNDED',
      answer: 'Document answer.',
      citations: [],
      tool_calls: [],
      rag_version: 'rag-v1',
    });
    expect(await prisma.auditLog.count()).toBe(0);
  });
});
