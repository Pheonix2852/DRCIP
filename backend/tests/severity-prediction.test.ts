import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import prisma from '../src/lib/prisma'
import request from 'supertest'

// Mock IntelligenceClient before importing testApp so the mock is wired into the module graph
const { predictSeverityMock } = vi.hoisted(() => ({
  predictSeverityMock: vi.fn(),
}))

vi.mock('../src/services/IntelligenceClient', () => ({
  IntelligenceClient: vi.fn().mockImplementation(() => ({
    predictSeverity: predictSeverityMock,
  })),
}))

import { testApp, createAuthedUser, createIncident, truncateTables } from './helpers'

beforeAll(async () => {
  await truncateTables()
})

afterAll(async () => {
  await prisma.$disconnect()
})

beforeEach(() => {
  vi.clearAllMocks()
})

function successResponse(overrides: Record<string, unknown> = {}) {
  return {
    status: 'SUCCESS',
    incident_id: 'INC-TEST',
    severity: 'HIGH',
    confidence: 0.92,
    model_version: 'severity-v1-mock',
    prediction_id: 'PRED-12345678',
    explanation: ['High people_affected count'],
    generated_at: '2026-09-27T12:00:00Z',
    ...overrides,
  }
}

function unavailableResponse() {
  return {
    status: 'UNAVAILABLE',
    incident_id: 'INC-TEST',
    error_code: 'SEVERITY_SERVICE_UNAVAILABLE',
    message: 'Severity prediction service is currently unavailable',
  }
}

describe('Severity prediction on incident create', () => {
  let citizenToken: string

  beforeAll(async () => {
    const citizen = await createAuthedUser('CITIZEN')
    citizenToken = citizen.token
  })

  it('persists a SUCCESS prediction row and sets predictedSeverity', async () => {
    predictSeverityMock.mockResolvedValue(successResponse())

    const res = await createIncident(citizenToken, {
      description: 'Building collapse near hospital',
      people_affected: 15,
      disaster_type: 'BUILDING_COLLAPSE',
    })

    expect(res.status).toBe(201)
    const publicId = res.body.data.incident_id

    // Wait a tick for async prediction persistence
    await new Promise((r) => setTimeout(r, 50))

    // Verify prediction row
    const incident = await prisma.incident.findFirst({ where: { publicId } })
    expect(incident).not.toBeNull()

    const prediction = await prisma.severityPrediction.findFirst({
      where: { incidentId: incident!.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(prediction).not.toBeNull()
    expect(prediction!.predictionStatus).toBe('SUCCESS')
    expect(prediction!.severity).toBe('HIGH')
    expect(Number(prediction!.confidence)).toBeCloseTo(0.92, 2)
    expect(prediction!.modelVersion).toBe('severity-v1-mock')
    expect(prediction!.predictionId).toBe('PRED-12345678')
    expect(prediction!.explanation).toEqual(['High people_affected count'])
    expect(prediction!.inputReference).toBeDefined()

    // Verify incident.predictedSeverity is set
    expect(incident!.predictedSeverity).toBe('HIGH')

    // Verify IntelligenceClient was called with correct request
    expect(predictSeverityMock).toHaveBeenCalledOnce()
    const callArg = predictSeverityMock.mock.calls[0][0]
    expect(callArg.incident_id).toBe(publicId)
    expect(callArg.disaster_type).toBe('BUILDING_COLLAPSE')
    expect(callArg.people_affected).toBe(15)
  })

  it('persists an UNAVAILABLE prediction row when service is down', async () => {
    predictSeverityMock.mockResolvedValue(unavailableResponse())

    const res = await createIncident(citizenToken, {
      description: 'Flash flood in low-lying area',
      people_affected: 8,
    })

    expect(res.status).toBe(201)
    const publicId = res.body.data.incident_id

    await new Promise((r) => setTimeout(r, 50))

    const incident = await prisma.incident.findFirst({ where: { publicId } })
    const prediction = await prisma.severityPrediction.findFirst({
      where: { incidentId: incident!.id },
      orderBy: { createdAt: 'desc' },
    })

    expect(prediction).not.toBeNull()
    expect(prediction!.predictionStatus).toBe('UNAVAILABLE')
    expect(prediction!.severity).toBeNull()
    expect(incident!.predictedSeverity).toBeNull()
  })

  it('persists an ERROR prediction row when client throws unexpected error', async () => {
    predictSeverityMock.mockRejectedValue(new Error('Unexpected network error'))

    const res = await createIncident(citizenToken, {
      description: 'Earthquake aftershock',
      people_affected: 25,
    })

    expect(res.status).toBe(201)
    const publicId = res.body.data.incident_id

    await new Promise((r) => setTimeout(r, 50))

    const incident = await prisma.incident.findFirst({ where: { publicId } })
    const prediction = await prisma.severityPrediction.findFirst({
      where: { incidentId: incident!.id },
      orderBy: { createdAt: 'desc' },
    })

    expect(prediction).not.toBeNull()
    expect(prediction!.predictionStatus).toBe('ERROR')
    expect(prediction!.severity).toBeNull()
    expect(incident!.predictedSeverity).toBeNull()
  })

  it('does not set predictedSeverity on non-SUCCESS outcomes', async () => {
    predictSeverityMock.mockResolvedValue({
      status: 'ERROR',
      incident_id: 'INC-TEST',
      error_code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    })

    const res = await createIncident(citizenToken, {
      description: 'Cyclone damage report',
      people_affected: 5,
      disaster_type: 'CYCLONE',
    })

    expect(res.status).toBe(201)
    const publicId = res.body.data.incident_id

    await new Promise((r) => setTimeout(r, 50))

    const incident = await prisma.incident.findFirst({ where: { publicId } })
    expect(incident!.predictedSeverity).toBeNull()
  })

  it('incident returns 201 even when prediction persistence fails', async () => {
    predictSeverityMock.mockResolvedValue(successResponse())

    // Temporarily override prisma.severityPrediction.create to throw
    const original = prisma.severityPrediction.create
    prisma.severityPrediction.create = vi.fn().mockRejectedValue(new Error('DB write failed'))

    const res = await createIncident(citizenToken, {
      description: 'Road blockage after landslide',
      people_affected: 3,
    })

    expect(res.status).toBe(201)
    expect(res.body.data.incident_id).toBeDefined()

    // Restore
    prisma.severityPrediction.create = original
  })

  it('predictedSeverity never replaces confirmedSeverity (human decision boundary)', async () => {
    predictSeverityMock.mockResolvedValue(successResponse({ severity: 'CRITICAL' }))

    const { token: coordToken } = await createAuthedUser('DISASTER_COORDINATOR')
    const res = await createIncident(coordToken, {
      description: 'Medical emergency at the school',
      people_affected: 20,
      disaster_type: 'MEDICAL_EMERGENCY',
    })

    expect(res.status).toBe(201)
    const publicId = res.body.data.incident_id

    await new Promise((r) => setTimeout(r, 50))

    // Verify predicted is CRITICAL
    const incidentBefore = await prisma.incident.findFirst({ where: { publicId } })
    expect(incidentBefore!.predictedSeverity).toBe('CRITICAL')
    expect(incidentBefore!.confirmedSeverity).toBeNull()

    // Now triage with a different severity
    await request(testApp)
      .patch(`/api/v1/incidents/${publicId}/triage`)
      .set('Authorization', `Bearer ${coordToken}`)
      .send({ confirmed_severity: 'MEDIUM', notes: 'assessed on scene' })

    const incidentAfter = await prisma.incident.findFirst({ where: { publicId } })
    expect(incidentAfter!.confirmedSeverity).toBe('MEDIUM')
    expect(incidentAfter!.predictedSeverity).toBe('CRITICAL')
  })
})

describe('Removed /internal/v1 passthrough', () => {
  it('returns 404 for removed internal routes', async () => {
    const res = await request(testApp).post('/internal/v1/predict/severity').send({})
    expect(res.status).toBe(404)
  })

  it('returns 404 for forecast endpoint', async () => {
    const res = await request(testApp).post('/internal/v1/forecast/demand').send({})
    expect(res.status).toBe(404)
  })

  it('returns 404 for optimize endpoint', async () => {
    const res = await request(testApp).post('/internal/v1/optimize/allocation').send({})
    expect(res.status).toBe(404)
  })

  it('returns 404 for rag endpoint', async () => {
    const res = await request(testApp).post('/internal/v1/rag/query').send({})
    expect(res.status).toBe(404)
  })
})
