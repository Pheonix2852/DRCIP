import type { RagCitation, RagResponseStatus } from '@drcip/contracts';

export const RAG_VERSION = 'rag-v1';
export const DEFAULT_RAG_SERVICE_URL = 'https://rag-drcip.onrender.com';

// Render free web services can cold-start after idle spin-down. The provider
// call is user-initiated and must tolerate that without failing immediately.
export const DEFAULT_RAG_TIMEOUT_MS = 60_000;

export const RAG_UNAVAILABLE_ANSWER =
  'RAG service is temporarily unavailable. Please try again later.';

export type RagProviderStatus = Extract<RagResponseStatus, 'GROUNDED' | 'ABSTAINED' | 'UNAVAILABLE'>;

export interface RagProviderResult {
  status: RagProviderStatus;
  answer: string;
  citations: RagCitation[];
}

export interface RagProvider {
  query(question: string): Promise<RagProviderResult>;
}

export function ragUnavailable(): RagProviderResult {
  return {
    status: 'UNAVAILABLE',
    answer: RAG_UNAVAILABLE_ANSWER,
    citations: [],
  };
}
