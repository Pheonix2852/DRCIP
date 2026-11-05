import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { BookOpen, Send } from 'lucide-react'
import type { RagCitation, RagQueryResponse, RagToolCall } from '@drcip/contracts'
import { rag } from '../lib/rag'
import { PageHeader } from '../components/PageHeader'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'
import { EmptyState } from '../components/EmptyState'
import { MarkdownContent } from '../components/MarkdownContent'
import { StatusBadge } from '../components/StatusBadge'
import { UnavailableState } from '../components/UnavailableState'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'

const QUERY_MIN = 3
const QUERY_MAX = 500

interface ChatTurn {
  id: number
  question: string
  response?: RagQueryResponse
}

function Citations({ citations }: { citations: RagCitation[] }) {
  if (citations.length === 0) return null

  return (
    <section aria-label="Sources" className="mt-3 border-t border-border pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Sources</p>
      <ol className="mt-1 space-y-1 text-sm">
        {citations.map((citation, index) => (
          <li key={`${citation.document_id ?? citation.title}-${index}`} className="flex gap-2">
            <span className="font-mono text-xs text-text-muted">[{index + 1}]</span>
            <span className="min-w-0">
              <span className="font-medium text-ink">{citation.title}</span>
              {citation.page != null && <span className="text-text-secondary"> · p. {citation.page}</span>}
              {citation.section && <span className="text-text-secondary"> · {citation.section}</span>}
              {citation.source_organization && (
                <span className="block text-xs text-text-muted">{citation.source_organization}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

const TOOL_LABELS: Record<string, string> = {
  get_active_incidents: 'Active incidents',
  get_nearby_ambulances: 'Nearby ambulances',
  get_available_rescue_teams: 'Available rescue teams',
  get_shelter_capacity: 'Shelter capacity',
  get_resource_stock: 'Resource stock',
  get_current_assignments: 'Current assignments',
}

function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? 'Live operational data'
}

function evidenceKey(call: RagToolCall): string {
  return [call.tool, call.outcome, call.as_of, call.returned_count, call.truncated].join('|')
}

function LiveEvidence({ response }: { response: RagQueryResponse }) {
  if (response.tool_calls.length === 0) return null

  const evidence = new Set((response.live_evidence ?? []).map(evidenceKey))

  return (
    <section aria-label="Live operational data" className="mt-3 border-t border-border pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
        Live operational data
      </p>
      <ul className="mt-1 space-y-2 text-sm">
        {response.tool_calls.map((call, index) => {
          const isEvidence = evidence.has(evidenceKey(call))
          return (
            <li
              key={`${call.tool}-${call.as_of}-${index}`}
              data-testid="rag-live-evidence"
              className="rounded-drcip-md border border-border px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{toolLabel(call.tool)}</span>
                <StatusBadge status={call.outcome} />
                <span className="text-xs text-text-muted">
                  Observed{' '}
                  <time dateTime={call.as_of}>{new Date(call.as_of).toLocaleString()}</time>
                </span>
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                {call.outcome === 'SUCCESS' &&
                  `${call.returned_count} record(s) returned${call.truncated ? ' · truncated' : ''}`}
                {call.outcome === 'EMPTY' && 'No matching operational records were returned.'}
                {call.outcome === 'UNAVAILABLE' && 'Live operational data is temporarily unavailable.'}
                {call.outcome === 'ERROR' && 'Live operational data could not be retrieved.'}
              </p>
              {isEvidence && (
                <p className="mt-1 text-xs text-text-muted">Live operational data, not a document citation.</p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function RagResponse({
  response,
  onRetry,
}: {
  response: RagQueryResponse
  onRetry: () => void
}) {
  if (response.status === 'UNAVAILABLE') {
    return (
      <div data-testid="rag-response">
        <UnavailableState
          tone="provider"
          title="RAG service temporarily unavailable"
          description="Approved guidance could not be retrieved. Your other DRCIP workflows are unaffected."
          action={
            <Button variant="outline" size="sm" type="button" onClick={onRetry}>
              Try again
            </Button>
          }
        />
      </div>
    )
  }

  const abstained = response.status === 'ABSTAINED'
  const hasLiveEvidence = (response.live_evidence?.length ?? 0) > 0
  return (
    <div data-testid="rag-response" className="rounded-drcip-lg border border-border bg-surface px-4 py-3">
      <p
        className={
          abstained
            ? hasLiveEvidence
              ? 'text-xs font-medium text-status-info'
              : 'text-xs font-medium text-status-warning'
            : 'text-xs font-medium text-status-success'
        }
      >
        {abstained
          ? hasLiveEvidence
            ? 'Insufficient document evidence · live operational data shown'
            : 'Insufficient evidence in the approved knowledge base'
          : 'Answer supported by approved sources'}
      </p>
      <MarkdownContent content={response.answer} className="mt-2" />
      {!abstained && <Citations citations={response.citations} />}
      <LiveEvidence response={response} />
    </div>
  )
}

export function RAGChatPage() {
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [validation, setValidation] = useState<string | null>(null)
  const nextId = useRef(1)

  const mutation = useMutation({
    mutationFn: (query: string) => rag.query({ query }),
    onSuccess: (response) => {
      setTurns((prev) =>
        prev.map((turn, index) =>
          index === prev.length - 1 ? { ...turn, response } : turn,
        ),
      )
    },
  })

  const retryLast = () => {
    const last = turns[turns.length - 1]
    if (!last) return
    setTurns((prev) =>
      prev.map((turn) => (turn.id === last.id ? { ...turn, response: undefined } : turn)),
    )
    mutation.mutate(last.question)
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const value = question.trim()

    if (value.length < QUERY_MIN) {
      setValidation(`Enter at least ${QUERY_MIN} characters.`)
      return
    }
    if (value.length > QUERY_MAX) {
      setValidation(`Enter at most ${QUERY_MAX} characters.`)
      return
    }

    const id = nextId.current++
    setValidation(null)
    setTurns((prev) => [...prev, { id, question: value }])
    setQuestion('')
    mutation.mutate(value)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="RAG Assistant"
        description="Ask about approved disaster-response guidance. Answers include sources and, when available, clearly labelled live operational data."
      />

      <div
        role="log"
        aria-live="polite"
        aria-label="RAG conversation"
        aria-busy={mutation.isPending}
        className="space-y-4"
      >
        {turns.length === 0 && (
          <EmptyState
            title="Ask about approved disaster-response guidance"
            description="Answers use approved DRCIP knowledge sources and, when available for your role, clearly labelled live operational data. AI does not dispatch emergency resources."
          />
        )}

        {turns.map((turn, index) => {
          const isLast = index === turns.length - 1
          return (
            <article key={turn.id} className="space-y-2">
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-drcip-lg bg-cobalt-deep px-4 py-2 text-sm text-white">
                  {turn.question}
                </p>
              </div>

              {turn.response ? (
                <RagResponse response={turn.response} onRetry={retryLast} />
              ) : isLast && mutation.isPending ? (
                <LoadingState label="Searching approved guidance…" className="px-1 py-2" />
              ) : isLast && mutation.isError ? (
                <div data-testid="rag-error">
                  <ErrorState
                    title="RAG request failed"
                    description="The assistant could not be reached. Check your connection and try again."
                    retry={retryLast}
                  />
                </div>
              ) : null}
            </article>
          )
        })}
      </div>

      <form onSubmit={handleSubmit} className="space-y-2 rounded-drcip-lg border border-border bg-surface p-4">
        <Label htmlFor="rag-question">Your question</Label>
        <Textarea
          id="rag-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={QUERY_MAX}
          rows={3}
          aria-invalid={validation ? true : undefined}
          aria-describedby="rag-question-help"
          placeholder="What should a field team check before evacuating people from a flooded area?"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p id="rag-question-help" className="text-xs text-text-muted">
            Approved guidance and labelled live data. {QUERY_MIN}-{QUERY_MAX} characters.
          </p>
          <Button type="submit" disabled={mutation.isPending}>
            <Send aria-hidden="true" className="h-4 w-4" />
            {mutation.isPending ? 'Searching…' : 'Send'}
          </Button>
        </div>
        {validation && (
          <p role="alert" className="text-xs text-status-error">
            {validation}
          </p>
        )}
      </form>

      <p className="flex items-center gap-1.5 text-xs text-text-muted">
        <BookOpen aria-hidden="true" className="h-3.5 w-3.5" />
        Approved guidance and labelled live data only. AI does not dispatch resources.
      </p>
    </div>
  )
}
