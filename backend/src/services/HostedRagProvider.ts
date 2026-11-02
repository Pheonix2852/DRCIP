import type { RagCitation } from '@drcip/contracts';
import {
  DEFAULT_RAG_SERVICE_URL,
  DEFAULT_RAG_TIMEOUT_MS,
  RagProvider,
  RagProviderQueryOptions,
  RagProviderResult,
  RagProviderToolResult,
  RagToolProposal,
  ragUnavailable,
} from './RagProvider';

interface HostedSource {
  document?: unknown;
  title?: unknown;
  page?: unknown;
  section?: unknown;
}

interface HostedResponse {
  answer?: unknown;
  sources?: unknown;
  tool_calls?: unknown;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

// Structured, locally-generated diagnostics only. Provider response bodies,
// prompts, questions and credentials are never logged.
function providerErrorCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  const type = (error as { type?: unknown }).type;
  if (typeof code === 'string') return code;
  return typeof type === 'string' ? type : null;
}

function mapSource(source: unknown): RagCitation | null {
  if (typeof source !== 'object' || source === null) return null;

  const value = source as HostedSource;
  const document = nonEmptyString(value.document);
  if (!document) return null;

  let title = document;
  if (value.title !== undefined) {
    const providerTitle = nonEmptyString(value.title);
    if (!providerTitle) return null;
    title = providerTitle;
  }

  const citation: RagCitation = { title };

  if (value.page !== undefined) {
    if (
      typeof value.page !== 'number' ||
      !Number.isInteger(value.page) ||
      value.page < 0
    ) {
      return null;
    }
    citation.page = value.page;
  }

  if (value.section !== undefined) {
    const section = nonEmptyString(value.section);
    if (!section) return null;
    citation.section = section;
  }

  return citation;
}

// Keep proposals raw. Node's schema validator and authorization layer decide
// whether they are acceptable, and invalid proposals are audited rather than
// silently discarded here.
function mapProposal(value: unknown): RagToolProposal {
  if (typeof value !== 'object' || value === null) {
    return { tool: undefined, arguments: undefined };
  }
  const raw = value as Record<string, unknown>;
  return {
    id: raw.id,
    tool: raw.tool ?? raw.name,
    arguments: raw.arguments ?? raw.args,
  };
}

function mapResponse(payload: unknown): RagProviderResult | null {
  if (typeof payload !== 'object' || payload === null) return null;

  const body = payload as HostedResponse;
  const answer = nonEmptyString(body.answer);
  if (!Array.isArray(body.sources)) return null;

  const citations: RagCitation[] = [];
  for (const source of body.sources) {
    const citation = mapSource(source);
    if (!citation) return null;
    citations.push(citation);
  }

  let toolInvocations: RagToolProposal[] | undefined;
  if (body.tool_calls !== undefined) {
    if (!Array.isArray(body.tool_calls)) return null;
    if (body.tool_calls.length > 0) {
      toolInvocations = body.tool_calls.map(mapProposal);
    }
  }

  if (!answer && !toolInvocations) return null;

  const result: RagProviderResult =
    citations.length === 0
      ? { status: 'ABSTAINED', answer: answer ?? '', citations: [] }
      : { status: 'GROUNDED', answer: answer ?? '', citations };

  if (toolInvocations) result.tool_invocations = toolInvocations;
  return result;
}

export interface HostedRagProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export class HostedRagProvider implements RagProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(config: HostedRagProviderConfig = {}) {
    this.baseUrl = (
      config.baseUrl ||
      process.env.RAG_SERVICE_URL ||
      DEFAULT_RAG_SERVICE_URL
    ).replace(/\/+$/, '');
    this.apiKey = (config.apiKey ?? process.env.RAG_API_KEY ?? '').trim();

    const configuredTimeout = config.timeoutMs ?? Number(process.env.RAG_TIMEOUT_MS);
    this.timeoutMs =
      Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_RAG_TIMEOUT_MS;
  }

  private async post(payload: Record<string, unknown>): Promise<RagProviderResult> {
    if (!this.apiKey) {
      console.warn('[rag] provider API key is not configured');
      return ragUnavailable();
    }

    try {
      const response = await fetch(`${this.baseUrl}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        console.warn('[rag] provider request failed', {
          status: response.status,
          code: providerErrorCode(errorBody),
        });
        return ragUnavailable();
      }

      const body = await response.json().catch(() => null);
      return mapResponse(body) ?? ragUnavailable();
    } catch (err) {
      // Network, timeout and parsing failures are all degraded states. Log only
      // the error class name so failures remain diagnosable without leaking
      // request or response content.
      console.warn('[rag] provider request error', {
        error: err instanceof Error ? err.name : 'UnknownError',
      });
      return ragUnavailable();
    }
  }

  async query(
    question: string,
    options?: RagProviderQueryOptions,
  ): Promise<RagProviderResult> {
    return this.post({
      question,
      ...(options?.tools && options.tools.length > 0
        ? { tools: options.tools }
        : {}),
    });
  }

  async continue(
    question: string,
    toolResults: RagProviderToolResult[],
  ): Promise<RagProviderResult> {
    return this.post({ question, tool_results: toolResults });
  }
}
