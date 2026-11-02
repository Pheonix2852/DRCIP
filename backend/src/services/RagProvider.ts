import type {
  RagCitation,
  RagResponseStatus,
  RagToolName,
  RagToolOutcome,
  ResourceType,
} from '@drcip/contracts';

export const RAG_VERSION = 'rag-v1';
export const RAG_VERSION_V2 = 'rag-v2';
export const DEFAULT_RAG_SERVICE_URL = 'https://rag-drcip.onrender.com';

// Render free web services can cold-start after idle spin-down. The provider
// call is user-initiated and must tolerate that without failing immediately.
export const DEFAULT_RAG_TIMEOUT_MS = 60_000;

export const RAG_UNAVAILABLE_ANSWER =
  'RAG service is temporarily unavailable. Please try again later.';

export type RagProviderStatus = Extract<RagResponseStatus, 'GROUNDED' | 'ABSTAINED' | 'UNAVAILABLE'>;

// Approved definitions are supplied by Node. Python may only propose tools
// from this list; Node validates, authorizes and executes every proposal.
export interface RagProviderToolDefinition {
  name: RagToolName;
  description: string;
  parameters: Record<string, unknown>;
}

export interface RagProviderQueryOptions {
  tools?: RagProviderToolDefinition[];
}

// Raw proposal from the Python service. It is intentionally untyped: Node's
// schema and authorization layers are the authority, so malformed or unknown
// proposals reach the validator and are audited instead of being dropped.
export interface RagToolProposal {
  id?: unknown;
  tool: unknown;
  arguments: unknown;
}

// Complete aggregates over the authorized dataset, independent of any result
// page. Only tools that support aggregation populate these.
export interface RagShelterAggregate {
  shelter_count: number;
  counted_shelters: number;
  unknown_capacity_count: number;
  total_capacity: number;
  current_occupancy: number;
  available_capacity: number;
  as_of: string;
}

export interface RagResourceTypeAggregate {
  resource_type: ResourceType;
  resource_count: number;
  counted_resources: number;
  total_quantity: number;
}

export interface RagResourceAggregate {
  resource_count: number;
  counted_resources: number;
  unknown_quantity_count: number;
  total_quantity: number;
  by_type: RagResourceTypeAggregate[];
  as_of: string;
}

export type RagToolAggregate = RagShelterAggregate | RagResourceAggregate;

// Envelope sent back to Python for continuation and final synthesis.
export interface RagProviderToolResult {
  call_id: string | null;
  tool: RagToolName | 'INVALID';
  outcome: RagToolOutcome;
  as_of: string;
  returned_count: number;
  truncated: boolean;
  // Total matching count before the page limit. Absent when the tool failed.
  total?: number;
  records: unknown[];
  aggregate?: RagToolAggregate;
  message?: string;
}

export interface RagProviderResult {
  status: RagProviderStatus;
  answer: string;
  citations: RagCitation[];
  // Optional model-requested live tools. The provider only proposes calls; the
  // Node boundary validates, authorizes and executes them.
  tool_invocations?: RagToolProposal[];
}

export interface RagProvider {
  query(question: string, options?: RagProviderQueryOptions): Promise<RagProviderResult>;
  // Optional continuation round. Providers that support RAG 2.0 implement this.
  continue?(
    question: string,
    toolResults: RagProviderToolResult[],
  ): Promise<RagProviderResult>;
}

export function ragUnavailable(): RagProviderResult {
  return {
    status: 'UNAVAILABLE',
    answer: RAG_UNAVAILABLE_ANSWER,
    citations: [],
  };
}
