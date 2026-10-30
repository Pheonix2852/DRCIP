import {
  RAG_TOOL_LIMITS,
  ragToolInvocationSchema,
  ragToolNameSchema,
  type RagLiveEvidence,
  type RagQueryResponse,
  type RagToolCall,
  type RagToolName,
} from '@drcip/contracts';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { HostedRagProvider } from './HostedRagProvider';
import { MockRagProvider } from './MockRagProvider';
import {
  RAG_VERSION,
  RAG_VERSION_V2,
  RagProvider,
  RagProviderResult,
  ragUnavailable,
} from './RagProvider';
import {
  authorizeRagTool,
  RagToolAuthorizationError,
  resolveRagToolContext,
  type RagToolAuthorization,
  type RagToolContext,
} from './ragToolAuthorization';
import { runRagTool } from './ragTools';

export function createRagProvider(): RagProvider {
  return process.env.RAG_PROVIDER?.trim().toLowerCase() === 'mock'
    ? new MockRagProvider()
    : new HostedRagProvider();
}

export interface RagQueryContext {
  userId?: string;
  userRole?: string;
  incidentId?: string;
  requestId?: string;
}

interface RagAuditEntry {
  actorUserId?: string;
  action: 'RAG_QUERY' | 'RAG_TOOL_CALL';
  entityType: 'RAG' | 'RAG_TOOL';
  metadata: Record<string, unknown>;
}

// Audit writes never carry the user's question, tool arguments or tool records.
// A failed tool audit is fail-closed: the live result is replaced with ERROR so
// no un-audited operational data is returned. A failed turn audit is
// best-effort and does not change the response.
async function writeAudit(entry: RagAuditEntry): Promise<boolean> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: null,
        metadata: entry.metadata as Prisma.InputJsonValue,
      },
    });
    return true;
  } catch {
    return false;
  }
}

async function auditTurn(
  context: RagQueryContext | undefined,
  response: RagQueryResponse,
  startedAt: number,
  extra: Record<string, unknown> = {},
): Promise<void> {
  if (!context?.userId) return;

  await writeAudit({
    actorUserId: context.userId,
    action: 'RAG_QUERY',
    entityType: 'RAG',
    metadata: {
      request_id: context.requestId ?? null,
      incident_id: context.incidentId ?? null,
      status: response.status,
      rag_version: response.rag_version,
      tool_call_count: response.tool_calls.length,
      duration_ms: Date.now() - startedAt,
      ...extra,
    },
  });
}

async function auditToolCall(input: {
  context: RagQueryContext;
  tool: RagToolName | 'INVALID';
  authorization: 'ALLOWED' | 'DENIED';
  outcome: RagToolCall['outcome'];
  errorCode?: string;
  asOf: string;
  returnedCount: number;
  truncated: boolean;
  durationMs: number;
}): Promise<boolean> {
  return writeAudit({
    actorUserId: input.context.userId,
    action: 'RAG_TOOL_CALL',
    entityType: 'RAG_TOOL',
    metadata: {
      request_id: input.context.requestId ?? null,
      incident_id: input.context.incidentId ?? null,
      tool: input.tool,
      authorization: input.authorization,
      outcome: input.outcome,
      error_code: input.errorCode ?? null,
      as_of: input.asOf,
      returned_count: input.returnedCount,
      truncated: input.truncated,
      duration_ms: input.durationMs,
    },
  });
}

function toToolCall(result: {
  tool: RagToolName;
  outcome: RagToolCall['outcome'];
  as_of: string;
  returned_count: number;
  truncated: boolean;
}): RagToolCall {
  return {
    tool: result.tool,
    outcome: result.outcome,
    as_of: result.as_of,
    returned_count: result.returned_count,
    truncated: result.truncated,
  };
}

async function executeInvocation(
  ctx: RagToolContext,
  invocation: unknown,
  context: RagQueryContext,
): Promise<{ call?: RagToolCall; evidence?: RagLiveEvidence }> {
  const startedAt = Date.now();
  const observedAt = new Date().toISOString();
  const rawTool =
    typeof invocation === 'object' && invocation !== null
      ? (invocation as { tool?: unknown }).tool
      : undefined;
  const parsedTool = ragToolNameSchema.safeParse(rawTool);

  if (!parsedTool.success) {
    await auditToolCall({
      context,
      tool: 'INVALID',
      authorization: 'DENIED',
      outcome: 'ERROR',
      errorCode: 'INVALID_TOOL',
      asOf: observedAt,
      returnedCount: 0,
      truncated: false,
      durationMs: Date.now() - startedAt,
    });
    return {};
  }

  const parsedInvocation = ragToolInvocationSchema.safeParse(invocation);
  if (!parsedInvocation.success) {
    const call: RagToolCall = {
      tool: parsedTool.data,
      outcome: 'ERROR',
      as_of: observedAt,
      returned_count: 0,
      truncated: false,
    };
    await auditToolCall({
      context,
      tool: parsedTool.data,
      authorization: 'DENIED',
      outcome: call.outcome,
      errorCode: 'INVALID_ARGUMENTS',
      asOf: call.as_of,
      returnedCount: call.returned_count,
      truncated: call.truncated,
      durationMs: Date.now() - startedAt,
    });
    return { call };
  }

  const tool = parsedInvocation.data.tool;
  const args = parsedInvocation.data.arguments;
  const errorCall = (): RagToolCall => ({
    tool,
    outcome: 'ERROR',
    as_of: observedAt,
    returned_count: 0,
    truncated: false,
  });

  // Authorization is a separate phase from execution so the audit trail can
  // distinguish a denied call from an authorized call that then failed.
  let authorization: RagToolAuthorization;
  try {
    authorization = await authorizeRagTool(ctx, tool, args);
  } catch (err) {
    const call = errorCall();
    await auditToolCall({
      context,
      tool,
      authorization: 'DENIED',
      outcome: call.outcome,
      errorCode:
        err instanceof RagToolAuthorizationError ? err.code : 'AUTHORIZATION_UNAVAILABLE',
      asOf: call.as_of,
      returnedCount: call.returned_count,
      truncated: call.truncated,
      durationMs: Date.now() - startedAt,
    });
    return { call };
  }

  let errorCode: string | undefined;
  let call: RagToolCall;
  let evidence: RagLiveEvidence | undefined;

  try {
    const result = await runRagTool(ctx, tool, args, authorization);
    call = toToolCall(result);
    if (result.outcome === 'SUCCESS' || result.outcome === 'EMPTY') {
      evidence = { evidence_type: 'LIVE_OPERATIONAL_DATA', ...call };
    }
  } catch {
    errorCode = 'EXECUTION_ERROR';
    call = errorCall();
  }

  const audited = await auditToolCall({
    context,
    tool: call.tool,
    authorization: 'ALLOWED',
    outcome: call.outcome,
    errorCode,
    asOf: call.as_of,
    returnedCount: call.returned_count,
    truncated: call.truncated,
    durationMs: Date.now() - startedAt,
  });

  if (!audited && call.outcome !== 'ERROR') {
    call = {
      ...call,
      outcome: 'ERROR',
      returned_count: 0,
      truncated: false,
    };
    evidence = undefined;
  }

  return { call, evidence };
}

export class RagService {
  private readonly provider: RagProvider;

  constructor(provider: RagProvider = createRagProvider()) {
    this.provider = provider;
  }

  async query(
    question: string,
    context?: RagQueryContext,
  ): Promise<RagQueryResponse> {
    const startedAt = Date.now();
    let result: RagProviderResult;

    try {
      result = await this.provider.query(question);
    } catch {
      // A provider must not be able to fail the public contract or leak details.
      result = ragUnavailable();
    }

    const base: RagQueryResponse = {
      status: result.status,
      answer: result.answer,
      citations: result.citations,
      tool_calls: [],
      rag_version: RAG_VERSION,
    };

    const invocations = result.tool_invocations ?? [];
    if (!context || invocations.length === 0 || result.status === 'UNAVAILABLE') {
      await auditTurn(context, base, startedAt);
      return base;
    }

    if (invocations.length > RAG_TOOL_LIMITS.MAX_CALLS_PER_TURN) {
      const response: RagQueryResponse = {
        ...base,
        rag_version: RAG_VERSION_V2,
      };
      await auditTurn(context, response, startedAt, {
        tool_limit_exceeded: true,
        requested_tool_calls: invocations.length,
      });
      return response;
    }

    let toolContext: RagToolContext;
    try {
      toolContext = await resolveRagToolContext({
        userId: context.userId,
        userRole: context.userRole,
      });
    } catch (err) {
      const response: RagQueryResponse = {
        ...base,
        rag_version: RAG_VERSION_V2,
      };
      await auditTurn(context, response, startedAt, {
        tool_context_error:
          err instanceof RagToolAuthorizationError ? err.code : 'UNAVAILABLE',
      });
      return response;
    }

    const toolCalls: RagToolCall[] = [];
    const liveEvidence: RagLiveEvidence[] = [];

    for (const invocation of invocations) {
      const executed = await executeInvocation(toolContext, invocation, context);
      if (executed.call) toolCalls.push(executed.call);
      if (executed.evidence) liveEvidence.push(executed.evidence);
    }

    const response: RagQueryResponse = {
      ...base,
      tool_calls: toolCalls,
      rag_version: RAG_VERSION_V2,
      ...(liveEvidence.length > 0 ? { live_evidence: liveEvidence } : {}),
    };

    await auditTurn(context, response, startedAt, {
      requested_tool_calls: invocations.length,
    });
    return response;
  }
}
