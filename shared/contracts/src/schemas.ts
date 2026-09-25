// Shared Zod validation schemas
// Single source of truth for request/query validation across backend and frontend
// See docs/02_Functional_Specification.md §3 and docs/05_API_Contract.md §4

import { z } from 'zod';
import {
  DISASTER_TYPES,
  INCIDENT_STATUSES,
  SEVERITY_LEVELS,
  RESOURCE_TYPES,
  RESOURCE_STATUSES,
  TEAM_STATUSES,
  SHELTER_STATUSES,
} from './domain';

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
const RESOURCE_TYPE_VALUES = Object.keys(RESOURCE_TYPES) as [
  (typeof RESOURCE_TYPES)[keyof typeof RESOURCE_TYPES],
  ...(typeof RESOURCE_TYPES)[keyof typeof RESOURCE_TYPES][],
];
const RESOURCE_STATUS_VALUES = Object.keys(RESOURCE_STATUSES) as [
  (typeof RESOURCE_STATUSES)[keyof typeof RESOURCE_STATUSES],
  ...(typeof RESOURCE_STATUSES)[keyof typeof RESOURCE_STATUSES][],
];
const TEAM_STATUS_VALUES = Object.keys(TEAM_STATUSES) as [
  (typeof TEAM_STATUSES)[keyof typeof TEAM_STATUSES],
  ...(typeof TEAM_STATUSES)[keyof typeof TEAM_STATUSES][],
];
const SHELTER_STATUS_VALUES = Object.keys(SHELTER_STATUSES) as [
  (typeof SHELTER_STATUSES)[keyof typeof SHELTER_STATUSES],
  ...(typeof SHELTER_STATUSES)[keyof typeof SHELTER_STATUSES][],
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

// ---------------------------------------------------------------------------
// Phase 3 — Resource / Team / Shelter contracts
// See docs/02_Functional_Specification.md §8–§9 and docs/05_API_Contract.md §5–§7
// ---------------------------------------------------------------------------

export const resourceTypeSchema = z.enum(RESOURCE_TYPE_VALUES, {
  errorMap: () => ({ message: 'Unsupported resource type' }),
});

export const resourceStatusSchema = z.enum(RESOURCE_STATUS_VALUES);

export const teamStatusSchema = z.enum(TEAM_STATUS_VALUES);

export const shelterStatusSchema = z.enum(SHELTER_STATUS_VALUES);

export const capabilityProfileSchema = z.record(z.unknown());

const queryDefaults = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
};

const nearbyFilter = {
  nearby_lat: z.coerce.number().optional(),
  nearby_lng: z.coerce.number().optional(),
  nearby_radius_km: z.coerce.number().positive().max(500).optional(),
};

function hasNearby(data: { nearby_lat?: number; nearby_lng?: number; nearby_radius_km?: number }) {
  const provided = [data.nearby_lat, data.nearby_lng, data.nearby_radius_km].filter((v) => v !== undefined).length;
  return provided === 0 || provided === 3;
}

// Resources
export const createResourceSchema = z
  .object({
    resource_type: resourceTypeSchema,
    name: z.string().trim().min(1, 'Name must not be empty').max(200),
    status: resourceStatusSchema.default('AVAILABLE'),
    quantity: z.number().min(0, 'Quantity must not be negative'),
    unit: z.string().trim().max(50).optional(),
    capacity: z.number().min(0, 'Capacity must not be negative').optional(),
    capability_profile: capabilityProfileSchema.optional(),
    latitude: latSchema.optional(),
    longitude: lngSchema.optional(),
    contact_reference: z.string().trim().max(200).optional(),
  })
  .refine((d) => (d.latitude === undefined) === (d.longitude === undefined), {
    message: 'Latitude and longitude must be provided together',
    path: ['latitude'],
  });

export type CreateResourceInput = z.infer<typeof createResourceSchema>;

export const updateResourceSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    status: resourceStatusSchema.optional(),
    quantity: z.number().min(0).optional(),
    unit: z.string().trim().max(50).optional(),
    capacity: z.number().min(0).optional(),
    capability_profile: capabilityProfileSchema.optional(),
    latitude: latSchema.optional(),
    longitude: lngSchema.optional(),
    contact_reference: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine((d) => (d.latitude === undefined) === (d.longitude === undefined), {
    message: 'Latitude and longitude must be provided together',
    path: ['latitude'],
  });

export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;

export const resourceQuerySchema = z
  .object({
    ...queryDefaults,
    resource_type: resourceTypeSchema.optional(),
    status: resourceStatusSchema.optional(),
    capability: z.string().trim().max(100).optional(),
    ...nearbyFilter,
  })
  .refine(hasNearby, { message: 'nearby_lat, nearby_lng and nearby_radius_km must be provided together' });

export type ResourceQueryInput = z.infer<typeof resourceQuerySchema>;

// Field Teams
export const createTeamSchema = z.object({
  name: z.string().trim().min(1, 'Name must not be empty').max(200),
  leader_user_id: z.string().trim().min(1, 'Leader is required'),
  capability_profile: capabilityProfileSchema.optional(),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    capability_profile: capabilityProfileSchema.optional(),
  })
  .strict();

export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

export const teamQuerySchema = z.object({
  ...queryDefaults,
  status: teamStatusSchema.optional(),
});

export type TeamQueryInput = z.infer<typeof teamQuerySchema>;

export const teamMemberAddSchema = z.object({
  member_name: z.string().trim().min(1, 'Member name must not be empty').max(200),
  member_role: z.string().trim().min(1, 'Member role must not be empty').max(100),
  contact_reference: z.string().trim().max(200).optional(),
});

export type TeamMemberAddInput = z.infer<typeof teamMemberAddSchema>;

export const teamStatusUpdateSchema = z.object({
  status: teamStatusSchema,
  notes: z.string().trim().max(2000).optional(),
});

export type TeamStatusUpdateInput = z.infer<typeof teamStatusUpdateSchema>;

// Shelters
export const createShelterSchema = z
  .object({
    name: z.string().trim().min(1, 'Name must not be empty').max(200),
    latitude: latSchema,
    longitude: lngSchema,
    total_capacity: z.number().int().min(0, 'Capacity must not be negative'),
    current_occupancy: z.number().int().min(0).default(0),
    status: shelterStatusSchema.default('AVAILABLE'),
    capabilities: capabilityProfileSchema.optional(),
  })
  .refine((d) => d.current_occupancy <= d.total_capacity, {
    message: 'Occupancy cannot exceed total capacity',
    path: ['current_occupancy'],
  });

export type CreateShelterInput = z.infer<typeof createShelterSchema>;

export const updateShelterSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    latitude: latSchema.optional(),
    longitude: lngSchema.optional(),
    total_capacity: z.number().int().min(0).optional(),
    current_occupancy: z.number().int().min(0).optional(),
    status: shelterStatusSchema.optional(),
    capabilities: capabilityProfileSchema.optional(),
  })
  .strict()
  .refine((d) => (d.latitude === undefined) === (d.longitude === undefined), {
    message: 'Latitude and longitude must be provided together',
    path: ['latitude'],
  })
  .refine((d) => d.total_capacity === undefined || d.current_occupancy === undefined || d.current_occupancy <= d.total_capacity, {
    message: 'Occupancy cannot exceed total capacity',
    path: ['current_occupancy'],
  });

export type UpdateShelterInput = z.infer<typeof updateShelterSchema>;

export const shelterQuerySchema = z
  .object({
    ...queryDefaults,
    status: shelterStatusSchema.optional(),
    min_available_capacity: z.coerce.number().int().min(0).optional(),
    ...nearbyFilter,
  })
  .refine(hasNearby, { message: 'nearby_lat, nearby_lng and nearby_radius_km must be provided together' });

export type ShelterQueryInput = z.infer<typeof shelterQuerySchema>;