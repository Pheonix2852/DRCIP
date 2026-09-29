import { PageHeader } from '../components/PageHeader'

export function RAGChatPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <PageHeader title="RAG Assistant" description="Disaster intelligence assistant powered by retrieval-augmented generation." />
      <div className="text-sm px-3 py-2 rounded bg-status-warning/10 text-status-warning" role="status">
        Disaster intelligence (RAG) is deferred. This surface will be available in a later phase.
      </div>
    </div>
  )
}