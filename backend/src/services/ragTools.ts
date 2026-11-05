import {
  RAG_TOOL_LIMITS,
  ragToolArgumentSchemas,
  type AssignmentQueryInput,
  type AssignmentStatus,
  type DisasterType,
  type GetActiveIncidentsArgs,
  type GetAvailableRescueTeamsArgs,
  type GetCurrentAssignmentsArgs,
  type GetNearbyAmbulancesArgs,
  type GetResourceStockArgs,
  type GetShelterCapacityArgs,
  type IncidentQueryInput,
  type IncidentStatus,
  type RagAssignmentRecord,
  type RagIncidentRecord,
  type RagResourceRecord,
  type RagShelterRecord,
  type RagTeamRecord,
  type RagToolArgumentMap,
  type RagToolName,
  type RagToolRecordMap,
  type RagToolResult,
  type ResourceQueryInput,
  type ResourceStatus,
  type ResourceType,
  type SeverityLevel,
  type ShelterQueryInput,
  type ShelterStatus,
  type TeamQueryInput,
  type TeamStatus,
} from '@drcip/contracts';
import { queryAssignments } from '../lib/assignmentSerializer';
import {
  queryIncidentList,
  queryResourceAggregate,
  queryResourceList,
  queryShelterAggregate,
  queryShelterList,
  queryTeamList,
  type IncidentListRow,
  type ResourceRow,
  type ShelterRow,
} from '../lib/domainQueries';
import type { TeamWithRelations } from '../lib/teamSerializer';
import type { RagToolAggregate } from './RagProvider';
import {
  authorizeRagTool,
  type RagToolAuthorization,
  type RagToolContext,
} from './ragToolAuthorization';

// Thin, typed, read-only handlers over the scoped domain queries. Every handler
// authorizes before reading, maps to an explicit output allowlist, and returns
// the frozen structured outcome shape.

type SerializedAssignment = Awaited<ReturnType<typeof queryAssignments>>['items'][number];

export type RagToolExecutionResult<T extends RagToolName> = RagToolResult<T> & {
  aggregate?: RagToolAggregate;
};

type RagToolHandler<T extends RagToolName> = (
  ctx: RagToolContext,
  args: RagToolArgumentMap[T],
  authorization: RagToolAuthorization,
) => Promise<RagToolExecutionResult<T>>;

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function isoRequired(value: Date): string {
  return value.toISOString();
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nearby(args: {
  latitude?: number;
  longitude?: number;
  radius_km?: number;
}): { latitude: number; longitude: number; radiusKm: number } | undefined {
  if (
    args.latitude === undefined ||
    args.longitude === undefined ||
    args.radius_km === undefined
  ) {
    return undefined;
  }
  return {
    latitude: args.latitude,
    longitude: args.longitude,
    radiusKm: args.radius_km,
  };
}

async function runTool<T extends RagToolName>(
  tool: T,
  asOf: string,
  load: () => Promise<{
    records: RagToolRecordMap[T][];
    total: number;
    limit: number;
    aggregate?: RagToolAggregate;
  }>,
): Promise<RagToolExecutionResult<T>> {
  try {
    const { records, total, limit, aggregate } = await load();
    const bounded = records.slice(0, limit);
    if (bounded.length === 0) {
      return {
        tool,
        outcome: 'EMPTY',
        as_of: asOf,
        records: [],
        returned_count: 0,
        truncated: false,
        total: 0,
        ...(aggregate ? { aggregate } : {}),
      };
    }
    return {
      tool,
      outcome: 'SUCCESS',
      as_of: asOf,
      records: bounded,
      returned_count: bounded.length,
      truncated: total > limit || records.length > limit,
      total,
      ...(aggregate ? { aggregate } : {}),
    };
  } catch {
    return {
      tool,
      outcome: 'UNAVAILABLE',
      as_of: asOf,
      records: [],
      returned_count: 0,
      truncated: false,
      message: 'Live operational data is temporarily unavailable.',
    };
  }
}

function toIncidentRecord(row: IncidentListRow): RagIncidentRecord {
  return {
    incident_id: row.publicId,
    disaster_type: row.disasterType as DisasterType,
    description: row.description,
    status: row.status as IncidentStatus,
    confirmed_severity: row.confirmedSeverity as SeverityLevel | null,
    predicted_severity: row.predictedSeverity as SeverityLevel | null,
    people_affected: row.peopleAffected,
    latitude: row.latitude,
    longitude: row.longitude,
    address_text: row.addressText,
    state: row.state,
    district: row.district,
    response_zone_id: row.responseZonePublicId,
    created_at: isoRequired(row.createdAt),
    updated_at: isoRequired(row.updatedAt),
  };
}

function toResourceRecord(row: ResourceRow): RagResourceRecord {
  return {
    resource_id: row.id,
    resource_type: row.resource_type as ResourceType,
    name: row.name,
    status: row.status as ResourceStatus,
    quantity: Number(row.quantity),
    unit: row.unit,
    capacity: row.capacity === null ? null : Number(row.capacity),
    latitude: row.latitude,
    longitude: row.longitude,
    updated_at: isoRequired(row.updated_at),
  };
}

function toTeamRecord(team: TeamWithRelations): RagTeamRecord {
  return {
    team_id: team.publicId,
    name: team.name,
    status: team.status as TeamStatus,
    capability_profile: toRecord(team.capabilityProfile),
    member_count: team.members.length,
    updated_at: isoRequired(team.updatedAt),
  };
}

function toShelterRecord(row: ShelterRow): RagShelterRecord {
  return {
    shelter_id: row.id,
    name: row.name,
    status: row.status as ShelterStatus,
    total_capacity: row.total_capacity,
    current_occupancy: row.current_occupancy,
    available_capacity: row.total_capacity - row.current_occupancy,
    latitude: row.latitude,
    longitude: row.longitude,
    capabilities: toRecord(row.capabilities),
    updated_at: isoRequired(row.updated_at),
  };
}

function toAssignmentRecord(a: SerializedAssignment): RagAssignmentRecord {
  return {
    assignment_id: a.id,
    incident_id: a.incident_id,
    status: a.status as AssignmentStatus,
    field_team_id: a.field_team_id,
    assigned_at: isoRequired(a.assigned_at),
    started_at: iso(a.started_at),
    completed_at: iso(a.completed_at),
    created_at: isoRequired(a.created_at),
    items: a.items.map((item) => ({
      resource_type: item.resource_type,
      resource_id: item.resource_id,
      team_id: item.team_id,
      shelter_id: item.shelter_id,
      quantity: item.quantity,
    })),
  };
}

async function getActiveIncidents(
  ctx: RagToolContext,
  args: GetActiveIncidentsArgs,
  authorization: RagToolAuthorization,
): Promise<RagToolResult<'get_active_incidents'>> {
  const asOf = new Date().toISOString();

  return runTool('get_active_incidents', asOf, async () => {
    const query: IncidentQueryInput = {
      page: 1,
      limit: (args.limit ?? RAG_TOOL_LIMITS.DEFAULT_RESULT_LIMIT),
      sort: 'newest',
      ...(args.status ? { status: args.status } : {}),
      ...(args.disaster_type ? { disaster_type: args.disaster_type } : {}),
      ...(args.severity ? { severity: args.severity } : {}),
    };
    const { items, total } = await queryIncidentList({
      scope:
        authorization.kind === 'ASSIGNED_TEAM'
          ? { kind: 'ASSIGNED_TEAM', userId: authorization.userId }
          : { kind: 'ALL' },
      query,
      activeOnly: true,
      nearby: nearby(args),
    });
    return { records: items.map(toIncidentRecord), total, limit: (args.limit ?? RAG_TOOL_LIMITS.DEFAULT_RESULT_LIMIT) };
  });
}

async function getNearbyAmbulances(
  ctx: RagToolContext,
  args: GetNearbyAmbulancesArgs,
  authorization: RagToolAuthorization,
): Promise<RagToolResult<'get_nearby_ambulances'>> {
  const asOf = new Date().toISOString();

  return runTool('get_nearby_ambulances', asOf, async () => {
    const query: ResourceQueryInput = {
      page: 1,
      limit: (args.limit ?? RAG_TOOL_LIMITS.DEFAULT_RESULT_LIMIT),
      sort: 'newest',
      resource_type: 'AMBULANCE',
      ...(args.status ? { status: args.status } : {}),
      nearby_lat: args.latitude,
      nearby_lng: args.longitude,
      nearby_radius_km: args.radius_km,
    };
    const { items, total } = await queryResourceList({
      scope:
        authorization.kind === 'INCIDENT_SCOPE'
          ? {
              kind: 'INCIDENT_SCOPE',
              userId: authorization.userId,
              radiusKm: authorization.radiusKm,
            }
          : { kind: 'ALL' },
      query,
      requesterId: ctx.userId,
    });
    return { records: items.map(toResourceRecord), total, limit: (args.limit ?? RAG_TOOL_LIMITS.DEFAULT_RESULT_LIMIT) };
  });
}

async function getAvailableRescueTeams(
  ctx: RagToolContext,
  args: GetAvailableRescueTeamsArgs,
  authorization: RagToolAuthorization,
): Promise<RagToolResult<'get_available_rescue_teams'>> {
  const asOf = new Date().toISOString();

  return runTool('get_available_rescue_teams', asOf, async () => {
    const query: TeamQueryInput = {
      page: 1,
      limit: (args.limit ?? RAG_TOOL_LIMITS.DEFAULT_RESULT_LIMIT),
      sort: 'newest',
      status: 'ACTIVE',
    };
    const { items, total } = await queryTeamList({
      scope:
        authorization.kind === 'OWN_TEAM'
          ? { kind: 'OWN_TEAM', userId: authorization.userId }
          : { kind: 'ALL' },
      query,
      capability: args.capability,
    });
    return { records: items.map(toTeamRecord), total, limit: (args.limit ?? RAG_TOOL_LIMITS.DEFAULT_RESULT_LIMIT) };
  });
}

async function getShelterCapacity(
  ctx: RagToolContext,
  args: GetShelterCapacityArgs,
  authorization: RagToolAuthorization,
): Promise<RagToolExecutionResult<'get_shelter_capacity'>> {
  const asOf = new Date().toISOString();

  return runTool('get_shelter_capacity', asOf, async () => {
    const query: ShelterQueryInput = {
      page: 1,
      limit: (args.limit ?? RAG_TOOL_LIMITS.DEFAULT_RESULT_LIMIT),
      sort: 'newest',
      ...(args.status ? { status: args.status } : {}),
      ...(args.min_available_capacity !== undefined
        ? { min_available_capacity: args.min_available_capacity }
        : {}),
    };
    const area = nearby(args);
    if (area) {
      query.nearby_lat = area.latitude;
      query.nearby_lng = area.longitude;
      query.nearby_radius_km = area.radiusKm;
    }
    const scope =
      authorization.kind === 'ACTIVE_ASSIGNMENT_TEAM'
        ? ({ kind: 'ACTIVE_ASSIGNMENT_TEAM', userId: authorization.userId } as const)
        : ({ kind: 'ALL' } as const);

    const [list, aggregate] = await Promise.all([
      queryShelterList({ scope, query }),
      queryShelterAggregate({ scope, query }),
    ]);
    const records = list.items.map(toShelterRecord);
    return {
      records,
      total: list.total,
      limit: (args.limit ?? RAG_TOOL_LIMITS.DEFAULT_RESULT_LIMIT),
      aggregate: { ...aggregate, as_of: asOf },
    };
  });
}

async function getResourceStock(
  ctx: RagToolContext,
  args: GetResourceStockArgs,
  _authorization: RagToolAuthorization,
): Promise<RagToolExecutionResult<'get_resource_stock'>> {
  const asOf = new Date().toISOString();

  return runTool('get_resource_stock', asOf, async () => {
    const query: ResourceQueryInput = {
      page: 1,
      limit: (args.limit ?? RAG_TOOL_LIMITS.DEFAULT_RESULT_LIMIT),
      sort: 'newest',
      ...(args.resource_type ? { resource_type: args.resource_type } : {}),
      ...(args.status ? { status: args.status } : {}),
    };
    const area = nearby(args);
    if (area) {
      query.nearby_lat = area.latitude;
      query.nearby_lng = area.longitude;
      query.nearby_radius_km = area.radiusKm;
    }
    const scope = { kind: 'ALL' } as const;
    const [list, aggregate] = await Promise.all([
      queryResourceList({
        scope,
        query,
        requesterId: ctx.userId,
      }),
      queryResourceAggregate({ scope, query }),
    ]);
    return {
      records: list.items.map(toResourceRecord),
      total: list.total,
      limit: (args.limit ?? RAG_TOOL_LIMITS.DEFAULT_RESULT_LIMIT),
      aggregate: {
        ...aggregate,
        by_type: aggregate.by_type.map((entry) => ({
          ...entry,
          resource_type: entry.resource_type as ResourceType,
        })),
        as_of: asOf,
      },
    };
  });
}

async function getCurrentAssignments(
  ctx: RagToolContext,
  args: GetCurrentAssignmentsArgs,
  authorization: RagToolAuthorization,
): Promise<RagToolResult<'get_current_assignments'>> {
  const asOf = new Date().toISOString();

  return runTool('get_current_assignments', asOf, async () => {
    const query: AssignmentQueryInput = {
      page: 1,
      limit: (args.limit ?? RAG_TOOL_LIMITS.DEFAULT_RESULT_LIMIT),
      sort: 'newest',
      ...(args.status ? { status: args.status } : {}),
      ...(args.incident_id ? { incident_id: args.incident_id } : {}),
    };
    const data = await queryAssignments({
      scope:
        authorization.kind === 'OWN_TEAM'
          ? { kind: 'OWN_TEAM', userId: authorization.userId }
          : { kind: 'ALL' },
      query,
    });
    return {
      records: data.items.map(toAssignmentRecord),
      total: data.pagination.total,
      limit: (args.limit ?? RAG_TOOL_LIMITS.DEFAULT_RESULT_LIMIT),
    };
  });
}

export const ragToolHandlers: { [T in RagToolName]: RagToolHandler<T> } = {
  get_active_incidents: getActiveIncidents,
  get_nearby_ambulances: getNearbyAmbulances,
  get_available_rescue_teams: getAvailableRescueTeams,
  get_shelter_capacity: getShelterCapacity,
  get_resource_stock: getResourceStock,
  get_current_assignments: getCurrentAssignments,
};

export async function runRagTool<T extends RagToolName>(
  ctx: RagToolContext,
  tool: T,
  args: RagToolArgumentMap[T],
  authorization: RagToolAuthorization,
): Promise<RagToolExecutionResult<T>> {
  return ragToolHandlers[tool](ctx, args, authorization);
}

export async function executeRagTool<T extends RagToolName>(
  ctx: RagToolContext,
  tool: T,
  rawArguments: unknown,
): Promise<RagToolExecutionResult<T>> {
  const args = ragToolArgumentSchemas[tool].parse(rawArguments) as RagToolArgumentMap[T];
  const authorization = await authorizeRagTool(ctx, tool, args);
  return runRagTool(ctx, tool, args, authorization);
}
