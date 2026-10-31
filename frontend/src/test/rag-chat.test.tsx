import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { RagQueryResponse, RagToolCall } from '@drcip/contracts'

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

const shelterCall: RagToolCall = {
  tool: 'get_shelter_capacity',
  outcome: 'SUCCESS',
  as_of: '2026-01-01T10:00:00.000Z',
  returned_count: 2,
  truncated: false,
}

const liveOnly: RagQueryResponse = {
  status: 'ABSTAINED',
  answer: 'Two shelters currently report available capacity.',
  citations: [],
  tool_calls: [shelterCall],
  rag_version: 'rag-v2',
  live_evidence: [{ evidence_type: 'LIVE_OPERATIONAL_DATA', ...shelterCall }],
}

const emptyCall: RagToolCall = {
  tool: 'get_nearby_ambulances',
  outcome: 'EMPTY',
  as_of: '2026-01-01T10:05:00.000Z',
  returned_count: 0,
  truncated: false,
}

const unavailableCall: RagToolCall = {
  tool: 'get_resource_stock',
  outcome: 'UNAVAILABLE',
  as_of: '2026-01-01T10:06:00.000Z',
  returned_count: 0,
  truncated: false,
}

const errorCall: RagToolCall = {
  tool: 'get_current_assignments',
  outcome: 'ERROR',
  as_of: '2026-01-01T10:07:00.000Z',
  returned_count: 0,
  truncated: false,
}

const truncatedCall: RagToolCall = {
  tool: 'get_active_incidents',
  outcome: 'SUCCESS',
  as_of: '2026-01-01T10:08:00.000Z',
  returned_count: 10,
  truncated: true,
}

const mixed: RagQueryResponse = {
  status: 'GROUNDED',
  answer: 'Guidance is supported by documents and current operational data.',
  citations: grounded.citations,
  tool_calls: [shelterCall, emptyCall],
  rag_version: 'rag-v2',
  live_evidence: [
    { evidence_type: 'LIVE_OPERATIONAL_DATA', ...shelterCall },
    { evidence_type: 'LIVE_OPERATIONAL_DATA', ...emptyCall },
  ],
}

const degradedTools: RagQueryResponse = {
  status: 'GROUNDED',
  answer: 'Guidance is available, but some live data could not be read.',
  citations: grounded.citations,
  tool_calls: [unavailableCall, errorCall],
  rag_version: 'rag-v2',
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
  it('shows the empty state and evidence guidance before a question', () => {
    renderPage()
    expect(screen.getByText('Ask about approved disaster-response guidance')).toBeTruthy()
    expect(
      within(screen.getByRole('status')).getByText(/clearly labelled live operational data/),
    ).toBeTruthy()
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

  it('renders live evidence separately from document citations', async () => {
    vi.mocked(rag.query).mockResolvedValue(mixed)
    renderPage()
    ask('What should the field team check?')

    expect(await screen.findByText(mixed.answer)).toBeTruthy()
    expect(screen.getByText('Sources')).toBeTruthy()
    expect(screen.getByText('Incident Response System')).toBeTruthy()

    const live = screen.getByRole('region', { name: 'Live operational data' })
    expect(within(live).getByText('Shelter capacity')).toBeTruthy()
    expect(within(live).getByText('2 record(s) returned')).toBeTruthy()
    expect(within(live).getByText('Nearby ambulances')).toBeTruthy()
    expect(within(live).getByText('No matching operational records were returned.')).toBeTruthy()
    expect(within(live).getAllByText('Live operational data, not a document citation.')).toHaveLength(2)
  })

  it('renders live-only evidence when document evidence is insufficient', async () => {
    vi.mocked(rag.query).mockResolvedValue(liveOnly)
    renderPage()
    ask('How many shelters are available?')

    expect(await screen.findByText(liveOnly.answer)).toBeTruthy()
    expect(screen.getByText('Insufficient document evidence · live operational data shown')).toBeTruthy()
    expect(screen.queryByText('Sources')).toBeNull()
    expect(screen.getByRole('region', { name: 'Live operational data' })).toBeTruthy()
  })

  it('does not present an empty live result as a zero quantity', async () => {
    vi.mocked(rag.query).mockResolvedValue({
      status: 'ABSTAINED',
      answer: 'No live records matched the question.',
      citations: [],
      tool_calls: [emptyCall],
      rag_version: 'rag-v2',
      live_evidence: [{ evidence_type: 'LIVE_OPERATIONAL_DATA', ...emptyCall }],
    })
    renderPage()
    ask('Are there ambulances nearby?')

    expect(await screen.findByText('No matching operational records were returned.')).toBeTruthy()
    expect(screen.queryByText(/0 record/)).toBeNull()
  })

  it('reports unavailable and failed live tools without hiding the failure', async () => {
    vi.mocked(rag.query).mockResolvedValue(degradedTools)
    renderPage()
    ask('What resources are available?')

    expect(await screen.findByText('Live operational data is temporarily unavailable.')).toBeTruthy()
    expect(screen.getByText('Live operational data could not be retrieved.')).toBeTruthy()
    expect(screen.getByText('Sources')).toBeTruthy()
  })

  it('shows observation time and truncation metadata', async () => {
    vi.mocked(rag.query).mockResolvedValue({
      status: 'GROUNDED',
      answer: 'Active incidents are listed.',
      citations: [],
      tool_calls: [truncatedCall],
      rag_version: 'rag-v2',
      live_evidence: [{ evidence_type: 'LIVE_OPERATIONAL_DATA', ...truncatedCall }],
    })
    const { container } = renderPage()
    ask('Which incidents are active?')

    expect(await screen.findByText('10 record(s) returned · truncated')).toBeTruthy()
    const observed = container.querySelector(`time[datetime="${truncatedCall.as_of}"]`)
    expect(observed).not.toBeNull()
    expect(observed?.textContent).toBeTruthy()
  })

  it('keeps RAG 1.0 responses free of live-evidence UI', async () => {
    vi.mocked(rag.query).mockResolvedValue(grounded)
    renderPage()
    ask('What should the field team check?')

    expect(await screen.findByText(grounded.answer)).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Live operational data' })).toBeNull()
  })

  it('shows a generic transport error without provider details', async () => {
    vi.mocked(rag.query).mockRejectedValue(new Error('provider secret details'))
    renderPage()
    ask('What should the field team check?')

    expect(await screen.findByText('RAG request failed')).toBeTruthy()
    expect(screen.queryByText(/provider secret details/)).toBeNull()
  })
})
