import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import prisma from '../src/lib/prisma'
import { testApp, createAuthedUser, createIncident, truncateTables } from './helpers'

// Mock the Cloudinary provider so tests never touch the network.
vi.mock('../src/services/CloudinaryMediaProvider', () => ({
  CloudinaryMediaProvider: class {
    async upload() {
      return {
        providerAssetId: 'test-asset-id',
        secureUrl: 'https://res.cloudinary.com/demo/image/upload/test-asset-id.png',
      }
    }
  },
}))

const API = '/api/v1/incidents'

beforeEach(async () => {
  await truncateTables()
})

afterAll(async () => {
  await prisma.$disconnect()
})

async function makeIncident() {
  const citizen = await createAuthedUser('CITIZEN')
  const res = await createIncident(citizen.token)
  return { incidentId: res.body.data.incident_id as string, token: citizen.token }
}

describe('POST /api/v1/incidents/:incidentId/media', () => {
  it('returns 201 with the media record on a successful upload', async () => {
    const { incidentId, token } = await makeIncident()
    const res = await request(testApp)
      .post(`${API}/${incidentId}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('media', Buffer.from('fake-image'), {
        filename: 'photo.png',
        contentType: 'image/png',
      })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toMatchObject({
      media_type: 'IMAGE',
      mime_type: 'image/png',
      secure_url: 'https://res.cloudinary.com/demo/image/upload/test-asset-id.png',
      duration_seconds: null,
    })
    expect(res.body.data.id).toBeDefined()

    const persisted = await prisma.incidentMedia.findFirst({
      where: { id: res.body.data.id },
    })
    expect(persisted).not.toBeNull()
    expect(persisted!.mediaType).toBe('IMAGE')
  })

  it('rejects a file larger than the 25 MB multer ceiling with MEDIA_TOO_LARGE', async () => {
    const { incidentId, token } = await makeIncident()
    const oversized = Buffer.alloc(26 * 1024 * 1024, 'a') // 26 MB
    const res = await request(testApp)
      .post(`${API}/${incidentId}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('media', oversized, {
        filename: 'big.png',
        contentType: 'image/png',
      })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('MEDIA_TOO_LARGE')
  })

  it('rejects an unsupported media type', async () => {
    const { incidentId, token } = await makeIncident()
    const res = await request(testApp)
      .post(`${API}/${incidentId}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('media', Buffer.from('not-an-image'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 404 when the incident does not exist', async () => {
    const { token } = await makeIncident()
    const res = await request(testApp)
      .post(`${API}/INC-DOES-NOT-EXIST/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('media', Buffer.from('fake-image'), {
        filename: 'photo.png',
        contentType: 'image/png',
      })

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })
})
