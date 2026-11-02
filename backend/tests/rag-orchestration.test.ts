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
import { ragToolHandlers } from '../src/services/ragTools';
import {
  createAuthedUser,
  createIncident,
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

let restoreAuditCreate: (() => void) | undefined;

// Prisma delegates are proxies whose property descriptors report the real
// methods as undefined, so vi.spyOn cannot restore them. Assign and restore
// the delegate method directly instead.
function failNextAuditWrite() {
  const original = prisma.auditLog.create;
  (prisma.auditLog as unknown as { create: typeof original }).create = vi
    .fn()
    .mockRejectedValueOnce(new Error('audit unavailable')) as typeof original;
  restoreAuditCreate = () => {
    (prisma.auditLog as unknown as { create: typeof original }).create =
      original;
    restoreAuditCreate = undefined;
  };
}

beforeEach(async () => {
  await truncateTables();
});

afterEach(() => {
  restoreAuditCreate?.();
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

  it('accepts a provider proposal that carries a provider call id', async () => {
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    await createShelter({ name: 'Provider Id Shelter' });
    const service = new RagService(
      providerWith([
        {
          id: 'fc_provider_call_1',
          tool: 'get_shelter_capacity',
          arguments: { limit: 10 },
        },
      ]),
    );

    const result = await service.query('Shelters?', {
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
      requestId: 'req-rag-provider-id',
    });

    expect(result.tool_calls).toEqual([
      expect.objectContaining({
        tool: 'get_shelter_capacity',
        outcome: 'SUCCESS',
      }),
    ]);
    expect(result.live_evidence).toHaveLength(1);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'RAG_TOOL_CALL' },
    });
    expect(audit?.metadata).toMatchObject({
      authorization: 'ALLOWED',
      outcome: 'SUCCESS',
    });
  });

  it('keeps document citations separate from live evidence', async () => {
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    await createShelter({ name: 'Mixed Evidence Shelter' });
    const service = new RagService({
      query: vi.fn().mockResolvedValue({
        status: 'GROUNDED',
        answer: 'Document answer with live context.',
        citations: [{ title: 'Flood Response Guide', page: 3 }],
        tool_invocations: [
          { tool: 'get_shelter_capacity', arguments: { limit: 10 } },
        ],
      }),
    });

    const result = await service.query('Shelters?', {
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
      requestId: 'req-rag-mixed',
    });

    expect(result.citations).toEqual([
      { title: 'Flood Response Guide', page: 3 },
    ]);
    expect(result.live_evidence).toEqual([
      expect.objectContaining({
        evidence_type: 'LIVE_OPERATIONAL_DATA',
        tool: 'get_shelter_capacity',
      }),
    ]);
    expect(JSON.stringify(result.citations)).not.toContain(
      'LIVE_OPERATIONAL_DATA',
    );
  });

  it('does not restore initial document citations when continuation omits them', async () => {
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    await createShelter({ name: 'Live Only Shelter' });
    const service = new RagService({
      query: vi.fn().mockResolvedValue({
        status: 'GROUNDED',
        answer: 'Document answer.',
        citations: [{ title: 'Flood Response Guide', page: 3 }],
        tool_invocations: [
          { tool: 'get_shelter_capacity', arguments: { limit: 1 } },
        ],
      }),
      continue: vi.fn().mockResolvedValue({
        status: 'GROUNDED',
        answer: '11 ambulances are available.',
        citations: [],
      }),
    });

    const result = await service.query('How many ambulances?', {
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
      requestId: 'req-rag-live-only',
    });

    expect(result.answer).toBe('11 ambulances are available.');
    expect(result.citations).toEqual([]);
    expect(result.live_evidence).toHaveLength(1);
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

  it('executes exactly four tool calls in one turn', async () => {
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    await createShelter({ name: 'Four Calls Shelter' });
    const invocations = Array.from({ length: 4 }, () => ({
      tool: 'get_shelter_capacity',
      arguments: { limit: 1 },
    }));
    const service = new RagService(providerWith(invocations));

    const result = await service.query('Shelters?', {
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
      requestId: 'req-rag-4-allowed',
    });

    expect(result.tool_calls).toHaveLength(4);
    expect(result.tool_calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool: 'get_shelter_capacity',
          outcome: 'SUCCESS',
        }),
      ]),
    );
    expect(
      await prisma.auditLog.count({ where: { action: 'RAG_TOOL_CALL' } }),
    ).toBe(4);
    const turnAudit = await prisma.auditLog.findFirst({
      where: { action: 'RAG_QUERY' },
    });
    expect(turnAudit?.metadata).toMatchObject({
      requested_tool_calls: 4,
    });
    expect(turnAudit?.metadata).not.toHaveProperty('tool_limit_exceeded');
  });

  it('records an execution failure as an allowed but unavailable call', async () => {
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    const service = new RagService(
      providerWith([
        { tool: 'get_active_incidents', arguments: { limit: 10 } },
      ]),
    );

    vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    const result = await service.query('Any incidents?', {
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
      requestId: 'req-rag-exec-fail',
    });

    expect(result.tool_calls).toEqual([
      expect.objectContaining({
        tool: 'get_active_incidents',
        outcome: 'UNAVAILABLE',
        returned_count: 0,
      }),
    ]);
    expect(result.live_evidence).toBeUndefined();

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'RAG_TOOL_CALL' },
    });
    expect(audit?.metadata).toMatchObject({
      tool: 'get_active_incidents',
      authorization: 'ALLOWED',
      outcome: 'UNAVAILABLE',
      error_code: null,
    });
  });

  it('classifies a thrown execution error as an allowed call', async () => {
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    const service = new RagService(
      providerWith([
        { tool: 'get_shelter_capacity', arguments: { limit: 10 } },
      ]),
    );
    vi.spyOn(
      ragToolHandlers,
      'get_shelter_capacity',
    ).mockRejectedValueOnce(new Error('unexpected failure'));

    const result = await service.query('Shelters?', {
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
      requestId: 'req-rag-thrown',
    });

    expect(result.tool_calls).toEqual([
      expect.objectContaining({
        tool: 'get_shelter_capacity',
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
      tool: 'get_shelter_capacity',
      authorization: 'ALLOWED',
      outcome: 'ERROR',
      error_code: 'EXECUTION_ERROR',
    });
  });

  it('audits an unverifiable tool context without executing tools', async () => {
    const citizen = await createAuthedUser('CITIZEN');
    const service = new RagService(
      providerWith([
        { tool: 'get_shelter_capacity', arguments: { limit: 10 } },
      ]),
    );

    const result = await service.query('Shelters?', {
      userId: citizen.user.id,
      userRole: 'ADMINISTRATOR',
      requestId: 'req-rag-context-fail',
    });

    expect(result.rag_version).toBe('rag-v2');
    expect(result.tool_calls).toEqual([]);
    expect(result.live_evidence).toBeUndefined();

    const turnAudit = await prisma.auditLog.findFirst({
      where: { action: 'RAG_QUERY' },
    });
    expect(turnAudit?.metadata).toMatchObject({
      tool_context_error: 'INVALID_CONTEXT',
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

    failNextAuditWrite();

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

  it('returns the provider response when the turn audit cannot be written', async () => {
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    const service = new RagService(providerWith([]));

    failNextAuditWrite();

    const result = await service.query('Document question?', {
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
      requestId: 'req-rag-turn-audit-fail',
    });

    expect(result).toEqual({
      status: 'GROUNDED',
      answer: 'Document answer.',
      citations: [],
      tool_calls: [],
      rag_version: 'rag-v1',
    });
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

function providerWithContinuation(
  toolInvocations: unknown[],
  continuation: RagProviderResult | Error,
) {
  return {
    query: vi.fn().mockResolvedValue({
      status: 'ABSTAINED',
      answer: '',
      citations: [],
      tool_invocations:
        toolInvocations as RagProviderResult['tool_invocations'],
    }),
    continue:
      continuation instanceof Error
        ? vi.fn().mockRejectedValue(continuation)
        : vi.fn().mockResolvedValue(continuation),
  };
}

describe('RAG tool continuation', () => {
  it('passes the approved tool definitions to the provider', async () => {
    const provider = {
      query: vi.fn().mockResolvedValue({
        status: 'ABSTAINED',
        answer: '',
        citations: [],
      }),
    };
    const service = new RagService(provider);

    await service.query('What now?');

    const options = provider.query.mock.calls[0][1];
    expect(options.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'get_active_incidents',
      'get_nearby_ambulances',
      'get_available_rescue_teams',
      'get_shelter_capacity',
      'get_resource_stock',
      'get_current_assignments',
    ]);
  });

  it('withholds live tool definitions from citizens', async () => {
    const citizen = await createAuthedUser('CITIZEN');
    const provider = {
      query: vi.fn().mockResolvedValue({
        status: 'GROUNDED',
        answer: 'Document answer.',
        citations: [{ title: 'Flood Guide', page: 3 }],
      }),
    };
    const service = new RagService(provider);

    const result = await service.query('What is the flood guidance?', {
      userId: citizen.user.id,
      userRole: 'CITIZEN',
    });

    expect(provider.query.mock.calls[0][1].tools).toEqual([]);
    expect(result.rag_version).toBe('rag-v1');
    expect(result.citations).toEqual([{ title: 'Flood Guide', page: 3 }]);
  });


  it('continues with tool-result envelopes and uses the synthesized answer', async () => {
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    await createShelter({
      name: 'Continuation Shelter',
      total_capacity: 100,
      current_occupancy: 20,
    });
    const provider = providerWithContinuation(
      [{ tool: 'get_shelter_capacity', arguments: { limit: 10 } }],
      {
        status: 'ABSTAINED',
        answer: 'The total shelter capacity is 100.',
        citations: [],
      },
    );
    const service = new RagService(provider);

    const result = await service.query('What is the total shelter capacity?', {
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
      requestId: 'req-rag-continuation',
    });

    expect(result.status).toBe('GROUNDED');
    expect(result.answer).toBe('The total shelter capacity is 100.');
    expect(result.tool_calls).toHaveLength(1);
    expect(result.live_evidence).toHaveLength(1);

    const [, toolResults] = provider.continue.mock.calls[0];
    expect(toolResults[0]).toMatchObject({
      call_id: 'call_1',
      tool: 'get_shelter_capacity',
      outcome: 'SUCCESS',
      returned_count: 1,
      truncated: false,
      total: 1,
    });
    expect(toolResults[0].aggregate).toMatchObject({
      shelter_count: 1,
      counted_shelters: 1,
      unknown_capacity_count: 0,
      total_capacity: 100,
      current_occupancy: 20,
      available_capacity: 80,
    });
    expect(toolResults[0].aggregate.as_of).toEqual(toolResults[0].as_of);
  });

  it('forwards the total matching count to the continuation', async () => {
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    const citizen = await createAuthedUser('CITIZEN');
    await Promise.all(
      Array.from({ length: 35 }, (_, i) =>
        createIncident(citizen.token, {
          description: `Continuation Incident ${i}`,
        }),
      ),
    );
    const provider = providerWithContinuation(
      [{ tool: 'get_active_incidents', arguments: { limit: 10 } }],
      {
        status: 'ABSTAINED',
        answer: 'Showing 10 of 35 active incidents.',
        citations: [],
      },
    );
    const service = new RagService(provider);

    const result = await service.query('List active incidents.', {
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
      requestId: 'req-rag-total',
    });

    expect(result.status).toBe('GROUNDED');
    const [, toolResults] = provider.continue.mock.calls[0];
    expect(toolResults[0]).toMatchObject({
      tool: 'get_active_incidents',
      outcome: 'SUCCESS',
      returned_count: 10,
      truncated: true,
      total: 35,
    });
    expect(toolResults[0].records).toHaveLength(10);
  });

  it('aggregates every authorized shelter even when the record list is capped', async () => {
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    await createShelter({ name: 'A', total_capacity: 10 });
    await createShelter({ name: 'B', total_capacity: 20 });
    await createShelter({ name: 'C', total_capacity: 30 });
    const provider = providerWithContinuation(
      [{ tool: 'get_shelter_capacity', arguments: { limit: 1 } }],
      { status: 'ABSTAINED', answer: 'Total is 60.', citations: [] },
    );
    const service = new RagService(provider);

    await service.query('Total shelter capacity?', {
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
      requestId: 'req-rag-aggregate',
    });

    const [, toolResults] = provider.continue.mock.calls[0];
    expect(toolResults[0]).toMatchObject({
      returned_count: 1,
      truncated: true,
      total: 3,
    });
    expect(toolResults[0].aggregate).toMatchObject({
      shelter_count: 3,
      counted_shelters: 3,
      total_capacity: 60,
      available_capacity: 60,
    });
  });

  it('ignores recursive tool proposals from a continuation response', async () => {
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    await createShelter({ name: 'Recursive Shelter' });
    const provider = providerWithContinuation(
      [{ tool: 'get_shelter_capacity', arguments: { limit: 1 } }],
      {
        status: 'ABSTAINED',
        answer: 'Answer.',
        citations: [],
        tool_invocations: [
          { tool: 'get_shelter_capacity', arguments: { limit: 1 } },
        ],
      },
    );
    const service = new RagService(provider);

    const result = await service.query('Shelters?', {
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
      requestId: 'req-rag-recursive',
    });

    expect(result.tool_calls).toHaveLength(1);
    expect(
      await prisma.auditLog.count({ where: { action: 'RAG_TOOL_CALL' } }),
    ).toBe(1);
    const turnAudit = await prisma.auditLog.findFirst({
      where: { action: 'RAG_QUERY' },
    });
    expect(turnAudit?.metadata).toMatchObject({
      recursive_tool_calls_ignored: 1,
    });
  });

  it('falls back to live evidence when continuation synthesis fails', async () => {
    const coordinator = await createAuthedUser('DISASTER_COORDINATOR');
    await createShelter({ name: 'Fallback Shelter' });
    const provider = providerWithContinuation(
      [{ tool: 'get_shelter_capacity', arguments: { limit: 10 } }],
      new Error('synthesis unavailable'),
    );
    const service = new RagService(provider);

    const result = await service.query('Shelters?', {
      userId: coordinator.user.id,
      userRole: 'DISASTER_COORDINATOR',
      requestId: 'req-rag-continuation-fail',
    });

    expect(result.status).toBe('GROUNDED');
    expect(result.answer).toContain('Live operational data was retrieved');
    expect(result.live_evidence).toHaveLength(1);
  });
});

