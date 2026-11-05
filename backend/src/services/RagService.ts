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
  RagProviderToolResult,
  RagToolProposal,
  ragUnavailable,
} from './RagProvider';
import { RAG_TOOL_DEFINITIONS } from './ragToolDefinitions';
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

function proposalCallId(invocation: unknown, index: number): string {
  if (typeof invocation === 'object' && invocation !== null) {
    const id = (invocation as { id?: unknown }).id;
    if (typeof id === 'string' && id.trim() !== '') return id;
  }
  return `call_${index + 1}`;
}

function errorEnvelope(
  callId: string,
  tool: RagToolName | 'INVALID',
  asOf: string,
  message: string,
): RagProviderToolResult {
  return {
    call_id: callId,
    tool,
    outcome: 'ERROR',
    as_of: asOf,
    returned_count: 0,
    truncated: false,
    records: [],
    message,
  };
}

interface ExecutedInvocation {
  call?: RagToolCall;
  evidence?: RagLiveEvidence;
  result: RagProviderToolResult;
  executionStarted: boolean;
}

async function executeInvocation(
  ctx: RagToolContext,
  invocation: RagToolProposal,
  context: RagQueryContext,
  index: number,
): Promise<ExecutedInvocation> {
  const startedAt = Date.now();
  const observedAt = new Date().toISOString();
  const callId = proposalCallId(invocation, index);
  const requestedTool =
    typeof invocation.tool === 'string' && invocation.tool.trim() !== ''
      ? invocation.tool
      : undefined;
  const parsedTool = ragToolNameSchema.safeParse(invocation.tool);
  const providerError =
    typeof invocation.errorCode === 'string' && invocation.errorCode.trim() !== ''
      ? invocation.errorCode
      : undefined;

  if (providerError === 'UNKNOWN_TOOL' || providerError === 'MALFORMED_ARGUMENTS') {
    const tool = parsedTool.success ? parsedTool.data : 'INVALID';
    const call: RagToolCall = {
      tool,
      outcome: 'ERROR',
      as_of: observedAt,
      returned_count: 0,
      truncated: false,
      ...(requestedTool ? { requested_tool: requestedTool } : {}),
      error_code: providerError,
    };
    await auditToolCall({
      context,
      tool,
      authorization: 'DENIED',
      outcome: call.outcome,
      errorCode: providerError,
      asOf: call.as_of,
      returnedCount: call.returned_count,
      truncated: call.truncated,
      durationMs: Date.now() - startedAt,
    });
    return {
      call,
      result: errorEnvelope(
        callId,
        tool,
        observedAt,
        'The requested operation is not available.',
      ),
      executionStarted: false,
    };
  }

  if (!parsedTool.success) {
    const call: RagToolCall = {
      tool: 'INVALID',
      outcome: 'ERROR',
      as_of: observedAt,
      returned_count: 0,
      truncated: false,
      ...(requestedTool ? { requested_tool: requestedTool } : {}),
      error_code: 'INVALID_TOOL',
    };
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
    return {
      call,
      result: errorEnvelope(
        callId,
        'INVALID',
        observedAt,
        'The requested operation is not available.',
      ),
      executionStarted: false,
    };
  }

  const parsedInvocation = ragToolInvocationSchema.safeParse({
    tool: invocation.tool,
    arguments: invocation.arguments,
  });
  if (!parsedInvocation.success) {
    const call: RagToolCall = {
      tool: parsedTool.data,
      outcome: 'ERROR',
      as_of: observedAt,
      returned_count: 0,
      truncated: false,
      error_code: 'INVALID_ARGUMENTS',
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
    return {
      call,
      result: errorEnvelope(
        callId,
        parsedTool.data,
        observedAt,
        'The requested tool arguments were invalid.',
      ),
      executionStarted: false,
    };
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
    return {
      call,
      result: errorEnvelope(
        callId,
        tool,
        observedAt,
        'The requested operational data is not available to this user.',
      ),
      executionStarted: false,
    };
  }

  let errorCode: string | undefined;
  let call: RagToolCall;
  let evidence: RagLiveEvidence | undefined;
  let toolResult: RagProviderToolResult;
  const executionStarted = true;

  try {
    const result = await runRagTool(ctx, tool, args, authorization);
    call = toToolCall(result);
    toolResult = {
      call_id: callId,
      tool: result.tool,
      outcome: result.outcome,
      as_of: result.as_of,
      returned_count: result.returned_count,
      truncated: result.truncated,
      ...(result.outcome === 'SUCCESS' || result.outcome === 'EMPTY'
        ? { total: result.total }
        : {}),
      records: result.records,
      ...(result.aggregate ? { aggregate: result.aggregate } : {}),
      ...('message' in result ? { message: result.message } : {}),
    };
    if (result.outcome === 'SUCCESS' || result.outcome === 'EMPTY') {
      evidence = {
        evidence_type: 'LIVE_OPERATIONAL_DATA',
        ...call,
        tool: result.tool,
      };
    }
  } catch {
    errorCode = 'EXECUTION_ERROR';
    call = errorCall();
    toolResult = errorEnvelope(
      callId,
      tool,
      observedAt,
      'Live operational data is temporarily unavailable.',
    );
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
    toolResult = errorEnvelope(
      callId,
      tool,
      call.as_of,
      'Live operational data could not be audited.',
    );
  }

  return { call, evidence, result: toolResult, executionStarted };
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
      result = await this.provider.query(question, {
        // Citizens receive document-grounded answers only. Withholding tool
        // definitions keeps the provider on the RAG 1.0 document path instead
        // of proposing calls the RBAC layer would deny.
        tools:
          context?.userRole === 'CITIZEN' ? [] : [...RAG_TOOL_DEFINITIONS],
      });
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
      ...(result.providerStatus
        ? { provider_status: result.providerStatus }
        : {}),
    };

    const invocations = result.tool_invocations ?? [];
    if (!context || invocations.length === 0 || result.status === 'UNAVAILABLE') {
      await auditTurn(context, base, startedAt, {
        ...(result.providerStatus
          ? { provider_status: result.providerStatus }
          : {}),
      });
      return base;
    }

    if (invocations.length > RAG_TOOL_LIMITS.MAX_CALLS_PER_TURN) {
      const response: RagQueryResponse = {
        ...base,
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
      };
      await auditTurn(context, response, startedAt, {
        tool_context_error:
          err instanceof RagToolAuthorizationError ? err.code : 'UNAVAILABLE',
      });
      return response;
    }

    const toolCalls: RagToolCall[] = [];
    const liveEvidence: RagLiveEvidence[] = [];
    const toolResults: RagProviderToolResult[] = [];
    let anyExecutionStarted = false;

    for (const [index, invocation] of invocations.entries()) {
      const executed = await executeInvocation(
        toolContext,
        invocation,
        context,
        index,
      );
      if (executed.executionStarted) anyExecutionStarted = true;
      toolResults.push(executed.result);
      if (executed.call) toolCalls.push(executed.call);
      if (executed.evidence) liveEvidence.push(executed.evidence);
    }

    let continuation: RagProviderResult | undefined;
    let recursiveToolCallsIgnored = 0;
    if (typeof this.provider.continue === 'function') {
      try {
        continuation = await this.provider.continue(question, toolResults);
        // Tool execution is single-round by contract. A continuation response
        // must never trigger another execution loop.
        recursiveToolCallsIgnored = continuation.tool_invocations?.length ?? 0;
      } catch (err) {
        console.warn('[rag] continuation failed', {
          request_id: context.requestId ?? null,
          error: err instanceof Error ? err.name : 'UnknownError',
        });
        continuation = undefined;
      }
    }

    const usableContinuation =
      continuation && continuation.status !== 'UNAVAILABLE'
        ? continuation
        : undefined;
    const hasLiveEvidence = liveEvidence.length > 0;
    const continuationAnswer = usableContinuation?.answer.trim() ?? '';
    const answer =
      continuationAnswer.length > 0
        ? usableContinuation!.answer
        : hasLiveEvidence
          ? 'Live operational data was retrieved, but a summary could not be generated. Review the live evidence below.'
          : base.answer;
    const citations = usableContinuation
      ? usableContinuation.citations
      : base.citations;
    const status: RagQueryResponse['status'] = hasLiveEvidence
      ? 'GROUNDED'
      : usableContinuation?.status === 'GROUNDED' || base.status === 'GROUNDED'
        ? 'GROUNDED'
        : 'ABSTAINED';

    const response: RagQueryResponse = {
      status,
      answer,
      citations,
      tool_calls: toolCalls,
      rag_version: anyExecutionStarted ? RAG_VERSION_V2 : RAG_VERSION,
      ...(hasLiveEvidence ? { live_evidence: liveEvidence } : {}),
      ...(result.providerStatus
        ? { provider_status: result.providerStatus }
        : {}),
    };

    await auditTurn(context, response, startedAt, {
      requested_tool_calls: invocations.length,
      execution_started: anyExecutionStarted,
      continued: Boolean(usableContinuation),
      recursive_tool_calls_ignored: recursiveToolCallsIgnored,
    });
    return response;
  }
}
