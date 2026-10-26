import type { RagQueryRequest, RagQueryResponse } from '@drcip/contracts'
import api from './api'
import { unwrap } from './utils'

export const rag = {
  query: (data: RagQueryRequest) =>
    api.post('/api/v1/rag/query', data).then((res) => unwrap<RagQueryResponse>(res)),
}

export default rag
