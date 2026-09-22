import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import http from 'node:http'
import WebSocket from 'ws'
import prisma from '../src/lib/prisma'
import { testApp, createAuthedUser, authHeader, truncateTables } from './helpers'
import { WebSocketService } from '../src/services/WebSocketService'
import request from 'supertest'

let server: http.Server
const wsClients: WebSocket[] = []

async function waitForEvent(ws: WebSocket, eventName: string, timeoutMs = 3000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${eventName}`)), timeoutMs)
    const onMessage = (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.event === eventName) {
          clearTimeout(timer)
          ws.off('message', onMessage)
          resolve(msg.data)
        }
      } catch { /* ignore */ }
    }
    ws.on('message', onMessage)
  })
}

async function connectWs(token: string): Promise<WebSocket> {
  const url = `ws://localhost:${(server.address() as { port: number }).port}/ws?token=${token}`
  const ws = new WebSocket(url)
  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve())
    ws.on('error', reject)
  })
  wsClients.push(ws)
  return ws
}

beforeAll(async () => {
  await truncateTables()
  server = http.createServer(testApp)
  server.listen(0)
  WebSocketService.getInstance(server)
})

afterAll(async () => {
  wsClients.forEach((ws) => ws.close())
  server.close()
  await prisma.$disconnect()
})

describe('WebSocket realtime broadcast', () => {
  it('publishes incident.created when a citizen reports an incident', async () => {
    const citizen = await createAuthedUser('CITIZEN')
    const ws = await connectWs(citizen.token)
    const createdPromise = waitForEvent(ws, 'incident.created')

    await request(testApp)
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${citizen.token}`)
      .send({
        disaster_type: 'FLOOD',
        description: 'Water entering homes near the dock',
        latitude: 22.57,
        longitude: 88.36,
        people_affected: 4,
        emergency_contact_number: '9830012345',
      })

    const data = await createdPromise
    expect(data.incident_id).toBeTruthy()
    expect(data.public_id).toMatch(/^INC-/)
  })

  it('publishes incident.updated when a coordinator triages an incident', async () => {
    const coord = await createAuthedUser('DISASTER_COORDINATOR')
    const citizen = await createAuthedUser('CITIZEN')
    const ws = await connectWs(coord.token)

    const createdEvent = waitForEvent(ws, 'incident.created')
    const createRes = await request(testApp)
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${citizen.token}`)
      .send({
        disaster_type: 'FIRE',
        description: 'Small fire in market area',
        latitude: 22.58,
        longitude: 88.37,
        people_affected: 2,
        emergency_contact_number: '9830012345',
      })
    const { public_id } = await createdEvent
    expect(public_id).toBeTruthy()

    const updatedPromise = waitForEvent(ws, 'incident.updated')
    const updatedRes = await request(testApp)
      .patch(`/api/v1/incidents/${createRes.body.data.incident_id}/triage`)
      .set('Authorization', `Bearer ${coord.token}`)
      .send({ confirmed_severity: 'HIGH' })

    expect(updatedRes.status).toBe(200)
    const data = await updatedPromise
    expect(data.public_id).toBe(public_id)
    expect(data.status).toBe('TRIAGE_PENDING')
  })
})