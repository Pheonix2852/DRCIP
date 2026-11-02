import {
  ASSIGNMENT_STATUSES,
  DISASTER_TYPES,
  INCIDENT_STATUSES,
  RESOURCE_STATUSES,
  RESOURCE_TYPES,
  SEVERITY_LEVELS,
  SHELTER_STATUSES,
  type RagToolName,
} from '@drcip/contracts';
import type { RagProviderToolDefinition } from './RagProvider';

// The single approved tool surface. Python receives these definitions and may
// only propose names from this list. Node validates every proposal against the
// exact schemas in @drcip/contracts before authorization and execution.

const ACTIVE_INCIDENT_STATUSES = [
  INCIDENT_STATUSES.REPORTED,
  INCIDENT_STATUSES.TRIAGE_PENDING,
  INCIDENT_STATUSES.IN_RESPONSE,
];

const limit = {
  type: 'integer',
  minimum: 1,
  maximum: 50,
  default: 10,
  description: 'Maximum individual records to return (1-50, default 10).',
} as const;

const nearby = {
  latitude: { type: 'number', minimum: -90, maximum: 90 },
  longitude: { type: 'number', minimum: -180, maximum: 180 },
  radius_km: { type: 'number', exclusiveMinimum: 0, maximum: 100 },
} as const;

const nearbyProperties = {
  latitude: nearby.latitude,
  longitude: nearby.longitude,
  radius_km: nearby.radius_km,
};

export const RAG_TOOL_DEFINITIONS: readonly RagProviderToolDefinition[] = [
  {
    name: 'get_active_incidents',
    description:
      'List active (not resolved) disaster incidents. Use for questions about current incidents, affected people, severity, or incident locations.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ACTIVE_INCIDENT_STATUSES },
        disaster_type: { type: 'string', enum: Object.values(DISASTER_TYPES) },
        severity: { type: 'string', enum: Object.values(SEVERITY_LEVELS) },
        ...nearbyProperties,
        limit,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_nearby_ambulances',
    description:
      'List ambulance resources near a location. Requires latitude, longitude and radius_km. Use for questions about ambulances available near an incident or assignment.',
    parameters: {
      type: 'object',
      properties: {
        ...nearbyProperties,
        status: { type: 'string', enum: Object.values(RESOURCE_STATUSES) },
        limit,
      },
      required: ['latitude', 'longitude', 'radius_km'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_available_rescue_teams',
    description:
      'List active rescue teams, optionally filtered by a capability name. Use for questions about available or deployable teams.',
    parameters: {
      type: 'object',
      properties: {
        capability: { type: 'string', minLength: 1, maxLength: 100 },
        limit,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_shelter_capacity',
    description:
      'Shelter capacity. The result includes a complete aggregate over all authorized shelters (shelter_count, counted_shelters, unknown_capacity_count, total_capacity, current_occupancy, available_capacity, as_of) plus individual records. Use aggregate.total_capacity for questions about total shelter capacity; do not sum the capped records list.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: Object.values(SHELTER_STATUSES) },
        min_available_capacity: { type: 'integer', minimum: 0 },
        ...nearbyProperties,
        limit,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_resource_stock',
    description:
      'Operational resource stock. The result includes a complete aggregate over all authorized resources (resource_count, counted_resources, unknown_quantity_count, total_quantity, by_type) plus individual records. Use aggregate.total_quantity or aggregate.by_type for quantity totals; do not count or sum the capped records list.',
    parameters: {
      type: 'object',
      properties: {
        resource_type: { type: 'string', enum: Object.values(RESOURCE_TYPES) },
        status: { type: 'string', enum: Object.values(RESOURCE_STATUSES) },
        ...nearbyProperties,
        limit,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_current_assignments',
    description:
      'Current field-team assignments, optionally filtered by incident or status. Use for questions about which teams are assigned to what.',
    parameters: {
      type: 'object',
      properties: {
        incident_id: { type: 'string', minLength: 1, maxLength: 100 },
        status: { type: 'string', enum: Object.values(ASSIGNMENT_STATUSES) },
        limit,
      },
      additionalProperties: false,
    },
  },
];

export function ragToolDefinition(name: RagToolName): RagProviderToolDefinition | undefined {
  return RAG_TOOL_DEFINITIONS.find((tool) => tool.name === name);
}
