import { RagProvider, RagProviderResult } from './RagProvider';

const MOCK_ABSTENTION_ANSWER =
  'I could not find sufficient support in the approved DRCIP knowledge base to answer that reliably.';

export class MockRagProvider implements RagProvider {
  async query(question: string): Promise<RagProviderResult> {
    if (question.trim() === '') {
      return { status: 'ABSTAINED', answer: MOCK_ABSTENTION_ANSWER, citations: [] };
    }

    return {
      status: 'GROUNDED',
      answer: 'Mock RAG answer grounded in approved guidance.',
      citations: [
        {
          title: 'Mock Disaster Response Guidance',
          page: 1,
          section: 'Mock Section',
        },
      ],
    };
  }
}
