import type { RagQueryResponse } from '@drcip/contracts';
import { HostedRagProvider } from './HostedRagProvider';
import { MockRagProvider } from './MockRagProvider';
import { RAG_VERSION, RagProvider, RagProviderResult, ragUnavailable } from './RagProvider';

export function createRagProvider(): RagProvider {
  return process.env.RAG_PROVIDER?.trim().toLowerCase() === 'mock'
    ? new MockRagProvider()
    : new HostedRagProvider();
}

export class RagService {
  private readonly provider: RagProvider;

  constructor(provider: RagProvider = createRagProvider()) {
    this.provider = provider;
  }

  async query(question: string): Promise<RagQueryResponse> {
    let result: RagProviderResult;

    try {
      result = await this.provider.query(question);
    } catch {
      // A provider must not be able to fail the public contract or leak details.
      result = ragUnavailable();
    }

    return {
      status: result.status,
      answer: result.answer,
      citations: result.citations,
      tool_calls: [],
      rag_version: RAG_VERSION,
    };
  }
}
