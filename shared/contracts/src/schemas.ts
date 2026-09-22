// Shared Zod validation schemas
// Single source of truth for request/query validation across backend and frontend
// See docs/02_Functional_Specification.md §3 and docs/05_API_Contract.md §4

import { z } from 'zod';
import { DISASTER_TYPES, INCIDENT_STATUSES, SEVERITY_LEVELS } from './domain';

// Keep tuple types literal so z.enum infers the exact union, not `string`.
const DISASTER_TYPE_VALUES = Object.keys(DISASTER_TYPES) as [
  (typeof DISASTER_TYPES)[keyof typeof DISASTER_TYPES],
  ...(typeof DISASTER_TYPES)[keyof typeof DISASTER_TYPES][],
];
const INCIDENT_STATUS_VALUES = Object.keys(INCIDENT_STATUSES) as [
  (typeof INCIDENT_STATUSES)[keyof typeof INCIDENT_STATUSES],
  ...(typeof INCIDENT_STATUSES)[keyof typeof INCIDENT_STATUSES][],
];
const SEVERITY_LEVEL_VALUES = Object.keys(SEVERITY_LEVELS) as [
  (typeof SEVERITY_LEVELS)[keyof typeof SEVERITY_LEVELS],
  ...(typeof SEVERITY_LEVELS)[keyof typeof SEVERITY_LEVELS][],
];

export const latSchema = z
  .number()
  .min(-90, 'Latitude must be between -90 and 90')
  .max(90, 'Latitude must be between -90 and 90');

export const lngSchema = z
  .number()
  .min(-180, 'Longitude must be between -180 and 180')
  .max(180, 'Longitude must be between -180 and 180');

export const disasterTypeSchema = z.enum(DISASTER_TYPE_VALUES, {
  errorMap: () => ({ message: 'Unsupported disaster type' }),
});

export const incidentStatusSchema = z.enum(INCIDENT_STATUS_VALUES);

export const severityLevelSchema = z.enum(SEVERITY_LEVEL_VALUES);

export const emergencyContactSchema = z
  .string()
  .min(3, 'Emergency contact must not be empty')
  .max(20, 'Emergency contact must be at most 20 characters');

export const createIncidentSchema = z.object({
  disaster_type: disasterTypeSchema,
  description: z
    .string()
    .trim()
    .min(1, 'Description must not be empty')
    .max(5000, 'Description must be at most 5000 characters'),
  latitude: latSchema,
  longitude: lngSchema,
  people_affected: z
    .number()
    .int('People affected must be an integer')
    .min(0, 'People affected must not be negative'),
  emergency_contact_number: emergencyContactSchema,
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

export const incidentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: incidentStatusSchema.optional(),
  disaster_type: disasterTypeSchema.optional(),
  severity: severityLevelSchema.optional(),
  search: z.string().trim().max(200).optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});

export type IncidentQueryInput = z.infer<typeof incidentQuerySchema>;

export const triageSchema = z.object({
  confirmed_severity: severityLevelSchema,
  notes: z.string().trim().max(2000).optional(),
});

export type TriageInput = z.infer<typeof triageSchema>;