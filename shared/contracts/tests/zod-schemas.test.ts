import { describe, it, expect } from 'vitest'
import {
  createIncidentSchema,
  assignmentStatusSchema,
  resourceAssignmentItemSchema,
  teamAssignmentItemSchema,
  shelterAssignmentItemSchema,
  assignmentItemSchema,
  createAssignmentSchema,
  incidentQuerySchema,
  triageSchema,
  severityLevelSchema,
  resourceTypeSchema,
  shelterStatusSchema,
  teamStatusSchema,
  resourceStatusSchema,
} from '../src/schemas'

describe('shared/contracts zod schemas', () => {
  describe('createIncidentSchema', () => {
    const valid = {
      disaster_type: 'FLOOD',
      description: 'Flooding near river bank',
      latitude: 22.5726,
      longitude: 88.3639,
      people_affected: 12,
      emergency_contact_number: '9830012345',
    }

    it('accepts a valid incident payload', () => {
      const parsed = createIncidentSchema.parse(valid)
      expect(parsed.disaster_type).toBe('FLOOD')
      expect(parsed.people_affected).toBe(12)
    })

    it('rejects an unknown disaster type', () => {
      expect(() =>
        createIncidentSchema.parse({ ...valid, disaster_type: 'ALIEN_INVASION' }),
      ).toThrow()
    })

    it('rejects negative people_affected', () => {
      expect(() => createIncidentSchema.parse({ ...valid, people_affected: -1 })).toThrow()
    })

    it('rejects empty description', () => {
      expect(() => createIncidentSchema.parse({ ...valid, description: '   ' })).toThrow()
    })

    it('rejects out-of-range latitude', () => {
      expect(() => createIncidentSchema.parse({ ...valid, latitude: 999 })).toThrow()
    })
  })

  describe('assignment contracts', () => {
    it('accepts every documented assignment status and rejects a bogus one', () => {
      for (const status of ['PENDING', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']) {
        expect(assignmentStatusSchema.safeParse(status).success).toBe(true)
      }
      expect(assignmentStatusSchema.safeParse('DONE').success).toBe(false)
    })

    it('accepts a resource assignment item (positive quantity, known type)', () => {
      const parsed = resourceAssignmentItemSchema.parse({
        resource_type: 'FOOD',
        resource_id: 'RES-1',
        quantity: 3,
      })
      expect(parsed.quantity).toBe(3)
    })

    it('rejects a resource item with non-positive quantity', () => {
      expect(() =>
        resourceAssignmentItemSchema.parse({ resource_type: 'FOOD', resource_id: 'RES-1', quantity: 0 }),
      ).toThrow()
    })

    it('accepts a team item only when quantity is 1 (strict schema)', () => {
      expect(teamAssignmentItemSchema.safeParse({ team_id: 'TM-1', quantity: 1 }).success).toBe(true)
      expect(teamAssignmentItemSchema.safeParse({ team_id: 'TM-1', quantity: 2 }).success).toBe(false)
    })

    it('accepts a shelter item with integer positive slots', () => {
      expect(shelterAssignmentItemSchema.safeParse({ shelter_id: 'SH-1', quantity: 5 }).success).toBe(true)
      expect(shelterAssignmentItemSchema.safeParse({ shelter_id: 'SH-1', quantity: 1.5 }).success).toBe(false)
    })

    it('discriminates the union on the right variant', () => {
      expect(assignmentItemSchema.safeParse({ resource_type: 'MEDICAL_KIT', resource_id: 'RES-9', quantity: 1 }).success).toBe(true)
      expect(assignmentItemSchema.safeParse({ team_id: 'TM-2', quantity: 1 }).success).toBe(true)
      expect(assignmentItemSchema.safeParse({ shelter_id: 'SH-3', quantity: 2 }).success).toBe(true)
      expect(assignmentItemSchema.safeParse({ resource_type: 'VEHICLE' }).success).toBe(false)
    })

    it('rejects createAssignment with an empty items array', () => {
      expect(() => createAssignmentSchema.parse({ items: [] })).toThrow()
    })

    it('accepts a createAssignment payload with one valid item (strict — no unknown keys)', () => {
      const parsed = createAssignmentSchema.parse({
        items: [{ resource_type: 'FOOD', resource_id: 'RES-1', quantity: 2 }],
      })
      expect(parsed.items).toHaveLength(1)
      expect(() =>
        createAssignmentSchema.parse({
          items: [{ resource_type: 'FOOD', resource_id: 'RES-1', quantity: 2 }],
          bogus_key: 'nope',
        }),
      ).toThrow()
    })
  })

  describe('enums and query/triage schemas', () => {
    it('severityLevelSchema accepts LOW/MEDIUM/HIGH/CRITICAL only', () => {
      expect(severityLevelSchema.safeParse('CRITICAL').success).toBe(true)
      expect(severityLevelSchema.safeParse('catastrophic').success).toBe(false)
    })

    it('resourceTypeSchema accepts documented resource categories', () => {
      for (const rt of ['FOOD', 'MEDICAL_KIT', 'PERSONNEL', 'VEHICLE', 'AMBULANCE', 'SHELTER']) {
        expect(resourceTypeSchema.safeParse(rt).success).toBe(true)
      }
      expect(resourceTypeSchema.safeParse('HELICOPTER').success).toBe(false)
    })

    it('resourceStatusSchema, teamStatusSchema, shelterStatusSchema pin current sets', () => {
      expect(resourceStatusSchema.safeParse('AVAILABLE').success).toBe(true)
      expect(resourceStatusSchema.safeParse('IN_TRANSIT').success).toBe(false)
      expect(teamStatusSchema.safeParse('DEPLOYED').success).toBe(true)
      expect(teamStatusSchema.safeParse('ARCHIVED').success).toBe(false)
      expect(shelterStatusSchema.safeParse('FULL').success).toBe(true)
      expect(shelterStatusSchema.safeParse('CLOSED').success).toBe(false)
    })

    it('incidentQuerySchema defaults and coerces query params', () => {
      const parsed = incidentQuerySchema.parse({})
      expect(parsed.page).toBe(1)
      expect(parsed.limit).toBe(20)
      expect(parsed.sort).toBe('newest')

      const coerced = incidentQuerySchema.parse({ page: '3', limit: '10' })
      expect(coerced.page).toBe(3)
      expect(coerced.limit).toBe(10)
    })

    it('triageSchema requires a confirmed severity', () => {
      expect(triageSchema.safeParse({ confirmed_severity: 'HIGH' }).success).toBe(true)
      expect(triageSchema.safeParse({ notes: 'no severity' }).success).toBe(false)
    })
  })
})
