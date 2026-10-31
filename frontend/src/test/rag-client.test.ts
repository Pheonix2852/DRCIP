import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/api', () => ({
  default: { post: vi.fn() },
}))

import api from '../lib/api'
import { rag } from '../lib/rag'

const response = {
  status: 'GROUNDED',
  answer: 'Follow the approved guidance.',
  citations: [{ title: 'Guidance' }],
  tool_calls: [],
  rag_version: 'rag-v1',
}

describe('RAG client', () => {
  it('calls only the Node public API and unwraps the response envelope', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { success: true, data: response },
    })

    const result = await rag.query({ query: 'What should we do?' })

    expect(api.post).toHaveBeenCalledWith('/api/v1/rag/query', {
      query: 'What should we do?',
    })
    expect(result).toEqual(response)
  })

  it('preserves optional live evidence and tool metadata', async () => {
    const liveResponse = {
      ...response,
      rag_version: 'rag-v2',
      tool_calls: [
        {
          tool: 'get_shelter_capacity',
          outcome: 'SUCCESS',
          as_of: '2026-01-01T10:00:00.000Z',
          returned_count: 2,
          truncated: false,
        },
      ],
      live_evidence: [
        {
          evidence_type: 'LIVE_OPERATIONAL_DATA',
          tool: 'get_shelter_capacity',
          outcome: 'SUCCESS',
          as_of: '2026-01-01T10:00:00.000Z',
          returned_count: 2,
          truncated: false,
        },
      ],
    }
    vi.mocked(api.post).mockResolvedValue({
      data: { success: true, data: liveResponse },
    })

    const result = await rag.query({ query: 'How many shelters are available?' })

    expect(result).toEqual(liveResponse)
  })

  it('throws the domain error message from the envelope', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { success: false, error: { message: 'RAG service is temporarily unavailable.' } },
    })

    await expect(rag.query({ query: 'What should we do?' })).rejects.toThrow(
      'RAG service is temporarily unavailable.',
    )
  })
})
