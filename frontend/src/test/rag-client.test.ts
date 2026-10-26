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

  it('throws the domain error message from the envelope', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { success: false, error: { message: 'RAG service is temporarily unavailable.' } },
    })

    await expect(rag.query({ query: 'What should we do?' })).rejects.toThrow(
      'RAG service is temporarily unavailable.',
    )
  })
})
