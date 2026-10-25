import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostedRagProvider } from '../src/services/HostedRagProvider';
import { MockRagProvider } from '../src/services/MockRagProvider';
import { RAG_UNAVAILABLE_ANSWER } from '../src/services/RagProvider';
import { createRagProvider, RagService } from '../src/services/RagService';

const API_KEY = 'test-rag-secret-key';
const BASE_URL = 'https://rag.test';

function provider() {
  return new HostedRagProvider({ baseUrl: BASE_URL, apiKey: API_KEY, timeoutMs: 1000 });
}

function response(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as unknown as Response;
}

function providerPayload(overrides: Record<string, unknown> = {}) {
  return {
    answer: 'Evacuate through the north route.',
    sources: [{ document: 'disaster-response.pdf', page: 15 }],
    model: 'openai/gpt-oss-20b',
    chunks_retrieved: 5,
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HostedRagProvider request', () => {
  it('calls the hosted endpoint with the backend bearer key and only the question', async () => {
    fetchMock.mockResolvedValue(response(providerPayload()));

    await provider().query('What now?');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/query`);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    });
    expect(JSON.parse(String(init.body))).toEqual({ question: 'What now?' });
  });

  it('returns UNAVAILABLE without calling the provider when no API key is configured', async () => {
    const result = await new HostedRagProvider({
      baseUrl: BASE_URL,
      apiKey: '',
      timeoutMs: 1000,
    }).query('What now?');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.answer).toBe(RAG_UNAVAILABLE_ANSWER);
    expect(result.citations).toEqual([]);
  });
});

describe('HostedRagProvider response mapping', () => {
  it('maps a grounded provider response without leaking provider internals', async () => {
    fetchMock.mockResolvedValue(
      response(
        providerPayload({
          sources: [
            {
              document: 'disaster-response.pdf',
              page: 15,
              section: 'Evacuation',
              excerpt: 'raw evidence text that must not be exposed',
            },
          ],
        }),
      ),
    );

    const result = await provider().query('What now?');

    expect(result).toEqual({
      status: 'GROUNDED',
      answer: 'Evacuate through the north route.',
      citations: [
        { title: 'disaster-response.pdf', page: 15, section: 'Evacuation' },
      ],
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain('openai/gpt-oss-20b');
    expect(serialized).not.toContain('chunks_retrieved');
    expect(serialized).not.toContain('raw evidence text');
  });

  it('maps an empty sources array to ABSTAINED', async () => {
    fetchMock.mockResolvedValue(
      response(
        providerPayload({
          answer:
            'I could not find sufficient information in the approved documents to answer that.',
          sources: [],
          chunks_retrieved: 0,
        }),
      ),
    );

    const result = await provider().query('Unknown question');

    expect(result.status).toBe('ABSTAINED');
    expect(result.answer).toContain('could not find sufficient information');
    expect(result.citations).toEqual([]);
  });

  it('does not fabricate a section from excerpt text', async () => {
    fetchMock.mockResolvedValue(
      response(
        providerPayload({
          sources: [
            {
              document: 'guidance.pdf',
              page: 2,
              excerpt: 'Section 4.2 covers evacuation.',
            },
          ],
        }),
      ),
    );

    const result = await provider().query('What now?');

    expect(result.citations).toEqual([{ title: 'guidance.pdf', page: 2 }]);
    expect(result.citations[0].section).toBeUndefined();
  });

  it('keeps an optional provider title when supplied', async () => {
    fetchMock.mockResolvedValue(
      response(
        providerPayload({
          sources: [{ document: 'guidance.pdf', title: 'Evacuation Guidance', page: 2 }],
        }),
      ),
    );

    const result = await provider().query('What now?');

    expect(result.citations).toEqual([
      { title: 'Evacuation Guidance', page: 2 },
    ]);
  });
});

describe('HostedRagProvider degraded states', () => {
  it('maps a timeout to UNAVAILABLE', async () => {
    fetchMock.mockRejectedValue(
      new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
    );

    const result = await provider().query('What now?');

    expect(result.status).toBe('UNAVAILABLE');
    expect(result.answer).toBe(RAG_UNAVAILABLE_ANSWER);
    expect(result.citations).toEqual([]);
  });

  it('maps a network failure to UNAVAILABLE', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const result = await provider().query('What now?');

    expect(result.status).toBe('UNAVAILABLE');
  });

  it.each([401, 422, 429, 500, 503])(
    'maps provider HTTP %i to UNAVAILABLE without returning the body',
    async (status) => {
      fetchMock.mockResolvedValue(response({ detail: 'provider detail' }, status));

      const result = await provider().query('What now?');

      expect(result.status).toBe('UNAVAILABLE');
      expect(JSON.stringify(result)).not.toContain('provider detail');
    },
  );

  it.each([
    ['non-object payload', 'not-json'],
    ['missing answer', { sources: [] }],
    ['empty answer', { answer: '   ', sources: [] }],
    ['non-array sources', { answer: 'answer', sources: 'none' }],
    ['source without document', { answer: 'answer', sources: [{ page: 1 }] }],
    ['non-numeric page', { answer: 'answer', sources: [{ document: 'a.pdf', page: '1' }] }],
    ['non-string section', { answer: 'answer', sources: [{ document: 'a.pdf', section: 4 }] }],
  ])('maps a malformed response (%s) to UNAVAILABLE', async (_label, payload) => {
    fetchMock.mockResolvedValue(response(payload));

    const result = await provider().query('What now?');

    expect(result.status).toBe('UNAVAILABLE');
  });

  it('never logs the API key or provider response on failure', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});

    fetchMock.mockResolvedValue(
      response({ detail: `invalid key ${API_KEY}`, sources: [] }, 401),
    );

    const result = await provider().query('What now?');

    expect(result.status).toBe('UNAVAILABLE');
    expect(JSON.stringify(result)).not.toContain(API_KEY);
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(debug).not.toHaveBeenCalled();
  });
});

describe('MockRagProvider', () => {
  it('returns a grounded answer for local development', async () => {
    const result = await new MockRagProvider().query('What now?');

    expect(result.status).toBe('GROUNDED');
    expect(result.citations.length).toBeGreaterThan(0);
  });
});

describe('RagService', () => {
  it('selects the mock provider only when RAG_PROVIDER=mock', () => {
    const previous = process.env.RAG_PROVIDER;

    try {
      process.env.RAG_PROVIDER = 'mock';
      expect(createRagProvider()).toBeInstanceOf(MockRagProvider);

      process.env.RAG_PROVIDER = 'hosted';
      expect(createRagProvider()).toBeInstanceOf(HostedRagProvider);
    } finally {
      if (previous === undefined) delete process.env.RAG_PROVIDER;
      else process.env.RAG_PROVIDER = previous;
    }
  });

  it('adds the stable public envelope fields', async () => {
    const service = new RagService({
      query: async () => ({
        status: 'GROUNDED',
        answer: 'answer',
        citations: [{ title: 'guidance.pdf' }],
      }),
    });

    const result = await service.query('question');

    expect(result).toEqual({
      status: 'GROUNDED',
      answer: 'answer',
      citations: [{ title: 'guidance.pdf' }],
      tool_calls: [],
      rag_version: 'rag-v1',
    });
  });

  it('converts an unexpected provider exception to UNAVAILABLE without leaking it', async () => {
    const service = new RagService({
      query: async () => {
        throw new Error('provider secret failure detail');
      },
    });

    const result = await service.query('question');

    expect(result.status).toBe('UNAVAILABLE');
    expect(result.answer).toBe(RAG_UNAVAILABLE_ANSWER);
    expect(result.citations).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('provider secret failure detail');
  });
});
