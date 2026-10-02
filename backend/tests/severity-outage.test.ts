import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { IntelligenceClient } from '../src/services/IntelligenceClient'
import { SeverityPredictionRequest } from '@drcip/contracts'

// Mock axios (not the client) so we exercise IntelligenceClient's own
// provider-outage translation: ECONNREFUSED/timeout/5xx -> UNAVAILABLE envelope,
// everything else re-thrown. Existing severity-prediction tests mock the client
// itself, so this translation path is otherwise untested.
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}))

const axios = (await import('axios')).default
const axiosPost = vi.mocked(axios.post)

const client = new IntelligenceClient()

function request(overrides: Partial<SeverityPredictionRequest> = {}): SeverityPredictionRequest {
  return {
    incident_id: 'INC-TEST',
    description: 'Flooding reported near the river bank',
    people_affected: 12,
    disaster_type: 'FLOOD',
    latitude: 22.5726,
    longitude: 88.3639,
    ...overrides,
  }
}

beforeAll(async () => {
  // nothing — the client reads env at construction; default base is fine
})

afterAll(() => {
  vi.clearAllMocks()
})

describe('IntelligenceClient outage translation', () => {
  it('translates ECONNREFUSED into an UNAVAILABLE severity envelope', async () => {
    axiosPost.mockRejectedValueOnce({ code: 'ECONNREFUSED' })
    const res = await client.predictSeverity(request())
    expect(res.status).toBe('UNAVAILABLE')
    expect(res.error_code).toBe('SEVERITY_SERVICE_UNAVAILABLE')
    expect(res.incident_id).toBe('INC-TEST')
  })

  it('translates a 5xx provider response into an UNAVAILABLE envelope', async () => {
    axiosPost.mockRejectedValueOnce({ code: undefined, response: { status: 503 } })
    const res = await client.predictSeverity(request())
    expect(res.status).toBe('UNAVAILABLE')
    expect(res.error_code).toBe('SEVERITY_SERVICE_UNAVAILABLE')
  })

  it('translates a request timeout into an UNAVAILABLE envelope', async () => {
    axiosPost.mockRejectedValueOnce({ code: 'ECONNABORTED' })
    const res = await client.predictSeverity(request())
    expect(res.status).toBe('UNAVAILABLE')
    expect(res.error_code).toBe('SEVERITY_SERVICE_UNAVAILABLE')
  })

  it('re-throws a non-translatable provider error (4xx) instead of swallowing it', async () => {
    axiosPost.mockRejectedValueOnce({ code: undefined, response: { status: 400 } })
    await expect(client.predictSeverity(request())).rejects.toMatchObject({
      response: { status: 400 },
    })
  })

  it('returns the provider payload unchanged on success', async () => {
    const payload = {
      status: 'SUCCESS',
      incident_id: 'INC-TEST',
      severity: 'HIGH',
      confidence: 0.85,
      model_version: 'severity-v1-mock',
      prediction_id: 'PRED-12345678',
      explanation: ['High people_affected count'],
      generated_at: '2026-09-27T12:00:00Z',
    }
    axiosPost.mockResolvedValueOnce({ data: payload })
    const res = await client.predictSeverity(request())
    expect(res).toEqual(payload)
  })
})
