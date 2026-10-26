import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { RagQueryResponse } from '@drcip/contracts'

vi.mock('../lib/rag', () => ({
  rag: { query: vi.fn() },
}))

import { RAGChatPage } from '../pages/RAGChatPage'
import { rag } from '../lib/rag'

const grounded: RagQueryResponse = {
  status: 'GROUNDED',
  answer: 'Check access routes and confirm the evacuation point before moving people.',
  citations: [
    {
      document_id: 'doc-1',
      title: 'Incident Response System',
      page: 43,
      section: 'Resource Mobilisation',
    },
  ],
  tool_calls: [],
  rag_version: 'rag-v1',
}

const abstained: RagQueryResponse = {
  status: 'ABSTAINED',
  answer: 'I could not find sufficient support in the approved DRCIP knowledge base to answer that reliably.',
  citations: [],
  tool_calls: [],
  rag_version: 'rag-v1',
}

const unavailable: RagQueryResponse = {
  status: 'UNAVAILABLE',
  answer: 'RAG service is temporarily unavailable. Please try again later.',
  citations: [],
  tool_calls: [],
  rag_version: 'rag-v1',
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <RAGChatPage />
    </QueryClientProvider>,
  )
}

function ask(text: string) {
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => cleanup())

describe('RAGChatPage', () => {
  it('shows the empty state and document-only guidance before a question', () => {
    renderPage()
    expect(screen.getByText('Ask about approved disaster-response guidance')).toBeTruthy()
    expect(screen.getByText(/does not use live operational data/)).toBeTruthy()
  })

  it('rejects questions shorter than 3 characters without calling the API', () => {
    renderPage()
    ask('ok')
    expect(screen.getByRole('alert').textContent).toContain('Enter at least 3 characters.')
    expect(rag.query).not.toHaveBeenCalled()
  })

  it('rejects questions longer than 500 characters without calling the API', () => {
    renderPage()
    ask('x'.repeat(501))
    expect(screen.getByRole('alert').textContent).toContain('Enter at most 500 characters.')
    expect(rag.query).not.toHaveBeenCalled()
  })

  it('shows the searching state while the query is pending', async () => {
    vi.mocked(rag.query).mockReturnValue(new Promise(() => {}))
    renderPage()
    ask('What should the field team check?')
    expect(await screen.findByText('Searching approved guidance…')).toBeTruthy()
    expect(rag.query).toHaveBeenCalledWith({ query: 'What should the field team check?' })
  })

  it('renders a grounded answer with only the supplied citation fields', async () => {
    vi.mocked(rag.query).mockResolvedValue(grounded)
    renderPage()
    ask('What should the field team check?')

    expect(await screen.findByText(grounded.answer)).toBeTruthy()
    expect(screen.getByText('Answer supported by approved sources')).toBeTruthy()
    expect(screen.getByText('Incident Response System')).toBeTruthy()
    expect(screen.getByText(/p\. 43/)).toBeTruthy()
    expect(screen.getByText(/Resource Mobilisation/)).toBeTruthy()
    expect(screen.queryByText(/excerpt/i)).toBeNull()
  })

  it('renders abstention as insufficient evidence, not an ordinary answer', async () => {
    vi.mocked(rag.query).mockResolvedValue(abstained)
    renderPage()
    ask('What should the field team check?')

    expect(await screen.findByText(abstained.answer)).toBeTruthy()
    expect(screen.getByText('Insufficient evidence in the approved knowledge base')).toBeTruthy()
    expect(screen.queryByText('Sources')).toBeNull()
  })

  it('renders provider unavailability with a retry path', async () => {
    vi.mocked(rag.query).mockResolvedValue(unavailable)
    renderPage()
    ask('What should the field team check?')

    expect(await screen.findByText('RAG service temporarily unavailable')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByText('Sources')).toBeNull()
  })

  it('shows a generic transport error without provider details', async () => {
    vi.mocked(rag.query).mockRejectedValue(new Error('provider secret details'))
    renderPage()
    ask('What should the field team check?')

    expect(await screen.findByText('RAG request failed')).toBeTruthy()
    expect(screen.queryByText(/provider secret details/)).toBeNull()
  })
})
