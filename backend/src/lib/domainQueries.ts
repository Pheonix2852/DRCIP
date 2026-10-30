import { Prisma } from '@prisma/client';
import type {
  IncidentQueryInput,
  ResourceQueryInput,
  ShelterQueryInput,
  TeamQueryInput,
} from '@drcip/contracts';
import prisma from './prisma';
import { teamInclude, type TeamWithRelations } from './teamSerializer';

// Shared domain queries for REST routes and future RAG live tools. Scopes are
// explicit so a tool can be narrower than an existing route without changing
// the route contract.

export type IncidentAccessScope =
  | { kind: 'ALL' }
  | { kind: 'REPORTER'; userId: string }
  | { kind: 'FIELD_OFFICER'; userId: string }
  | { kind: 'ASSIGNED_TEAM'; userId: string };

export interface IncidentListRow {
  id: string;
  publicId: string;
  disasterType: string;
  description: string;
  peopleAffected: number;
  emergencyContactNumber: string;
  latitude: number | null;
  longitude: number | null;
  addressText: string | null;
  state: string | null;
  district: string | null;
  responseZonePublicId: string | null;
  predictedSeverity: string | null;
  confirmedSeverity: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function incidentScopeSql(scope: IncidentAccessScope): Prisma.Sql {
  switch (scope.kind) {
    case 'REPORTER':
      return Prisma.sql`i."reporterUserId" = ${scope.userId}`;
    case 'FIELD_OFFICER':
      return Prisma.sql`(
        i."reporterUserId" = ${scope.userId}
        OR EXISTS (
          SELECT 1
          FROM "Assignment" a
          JOIN "FieldTeam" t ON a."fieldTeamId" = t.id
          WHERE a."incidentId" = i.id AND t."leaderUserId" = ${scope.userId}
        )
      )`;
    case 'ASSIGNED_TEAM':
      return Prisma.sql`EXISTS (
        SELECT 1
        FROM "Assignment" a
        JOIN "FieldTeam" t ON a."fieldTeamId" = t.id
        WHERE a."incidentId" = i.id AND t."leaderUserId" = ${scope.userId}
      )`;
    case 'ALL':
      return Prisma.sql`TRUE`;
    default:
      return Prisma.sql`FALSE`;
  }
}

function incidentFilters(query: IncidentQueryInput, responseZoneId: string): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [];

  if (query.status) {
    conditions.push(Prisma.sql`i.status = ${query.status}::"IncidentStatus"`);
  }
  if (query.disaster_type) {
    conditions.push(Prisma.sql`i."disasterType" = ${query.disaster_type}::"DisasterType"`);
  }
  if (query.severity) {
    conditions.push(Prisma.sql`i."confirmedSeverity" = ${query.severity}::"SeverityLevel"`);
  }
  if (query.search) {
    const like = `%${query.search}%`;
    conditions.push(Prisma.sql`(i.description ILIKE ${like} OR i."publicId" ILIKE ${like})`);
  }
  if (responseZoneId) {
    conditions.push(Prisma.sql`rz."publicId" = ${responseZoneId}`);
  }

  return conditions;
}

export async function queryIncidentList(opts: {
  scope: IncidentAccessScope;
  query: IncidentQueryInput;
  responseZoneId?: string;
  activeOnly?: boolean;
  nearby?: { latitude: number; longitude: number; radiusKm: number };
}) {
  const { scope, query } = opts;
  const responseZoneId = opts.responseZoneId?.trim() ?? '';
  const conditions = [incidentScopeSql(scope), ...incidentFilters(query, responseZoneId)];
  if (opts.activeOnly) {
    conditions.push(Prisma.sql`i.status <> 'RESOLVED'`);
  }
  if (opts.nearby) {
    conditions.push(
      Prisma.sql`ST_DWithin(i."location", ST_SetSRID(ST_MakePoint(${opts.nearby.longitude}, ${opts.nearby.latitude}), 4326)::geography, ${opts.nearby.radiusKm * 1000})`,
    );
  }
  const where = Prisma.sql`${Prisma.join(conditions, ' AND ')}`;
  const offset = (query.page - 1) * query.limit;

  const [items, totalResult] = await Promise.all([
    prisma.$queryRaw<IncidentListRow[]>(Prisma.sql`
      SELECT
        i.id,
        i."publicId",
        i."disasterType",
        i.description,
        i."peopleAffected",
        i."emergencyContactNumber",
        ST_Y(i."location"::geometry)::float AS latitude,
        ST_X(i."location"::geometry)::float AS longitude,
        i."addressText",
        i.state,
        i.district,
        rz."publicId" AS "responseZonePublicId",
        i."predictedSeverity",
        i."confirmedSeverity",
        i.status,
        i."createdAt",
        i."updatedAt"
      FROM "Incident" i
      LEFT JOIN "ResponseZone" rz ON i."responseZoneId" = rz.id
      WHERE ${where}
      ORDER BY i."createdAt" ${query.sort === 'oldest' ? Prisma.sql`ASC` : Prisma.sql`DESC`}
      LIMIT ${query.limit} OFFSET ${offset}
    `),
    prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM "Incident" i
      LEFT JOIN "ResponseZone" rz ON i."responseZoneId" = rz.id
      WHERE ${where}
    `),
  ]);

  return { items, total: Number(totalResult[0]?.count ?? 0) };
}

export type ResourceAccessScope =
  | { kind: 'ALL' }
  | { kind: 'OWN_TEAM'; userId: string }
  | { kind: 'INCIDENT_SCOPE'; userId: string; radiusKm: number };

export interface ResourceRow {
  id: string;
  resource_type: string;
  name: string;
  status: string;
  quantity: number;
  unit: string | null;
  capacity: number | null;
  capability_profile: unknown;
  latitude: number | null;
  longitude: number | null;
  contact_reference: string | null;
  team_id: string | null;
  is_own_team: boolean;
  created_at: Date;
  updated_at: Date;
}

// Geography is an Unsupported Prisma type, so resources are read/written with
// raw SQL and coordinates are projected to latitude/longitude consistently with
// the Incident convention. `is_own_team` contextualizes team linkage for the
// requesting Field Officer without exposing the raw team foreign key.
export function resourceSelect(requesterId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT
      r."publicId" AS id,
      r."resourceType"::text AS resource_type,
      r."name" AS name,
      r."status"::text AS status,
      r."quantity"::float8 AS quantity,
      r."unit" AS unit,
      r."capacity"::float8 AS capacity,
      r."capabilityProfile" AS capability_profile,
      ST_Y(r."location"::geometry)::float8 AS latitude,
      ST_X(r."location"::geometry)::float8 AS longitude,
      r."contactReference" AS contact_reference,
      t."publicId" AS team_id,
      COALESCE(t."leaderUserId" = ${requesterId}, false) AS is_own_team,
      r."createdAt" AS created_at,
      r."updatedAt" AS updated_at
    FROM "Resource" r
    LEFT JOIN "FieldTeam" t ON r."teamId" = t."id"
  `;
}

export function buildResourceWhere(
  query: ResourceQueryInput,
  scope: ResourceAccessScope,
): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];

  if (query.resource_type) {
    conditions.push(Prisma.sql`r."resourceType" = ${query.resource_type}::"ResourceType"`);
  }
  if (query.status) {
    conditions.push(Prisma.sql`r."status" = ${query.status}::"ResourceStatus"`);
  }
  if (query.search) {
    const like = `%${query.search}%`;
    conditions.push(Prisma.sql`(r."name" ILIKE ${like} OR r."publicId" ILIKE ${like})`);
  }
  if (query.capability) {
    // capability_profile is an open JSONB document; match a top-level capability
    // key (jsonb_exists is the function form of the `?` operator) or a value.
    const like = `%${query.capability}%`;
    conditions.push(
      Prisma.sql`(jsonb_exists(r."capabilityProfile", ${query.capability}) OR r."capabilityProfile"::text ILIKE ${like})`,
    );
  }
  if (
    query.nearby_lat !== undefined &&
    query.nearby_lng !== undefined &&
    query.nearby_radius_km !== undefined
  ) {
    const radiusMeters = query.nearby_radius_km * 1000;
    conditions.push(
      Prisma.sql`ST_DWithin(r."location", ST_SetSRID(ST_MakePoint(${query.nearby_lng}, ${query.nearby_lat}), 4326)::geography, ${radiusMeters})`,
    );
  }
  if (scope.kind === 'OWN_TEAM') {
    conditions.push(Prisma.sql`t."leaderUserId" = ${scope.userId}`);
  }
  if (scope.kind === 'INCIDENT_SCOPE') {
    // A Field Officer may only see resources that are also within the radius of
    // an active incident their own team is assigned to. This is an intersection
    // with the caller's search circle, never a replacement for it.
    const radiusMeters = scope.radiusKm * 1000;
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1
      FROM "Assignment" a
      JOIN "FieldTeam" ft ON a."fieldTeamId" = ft.id
      JOIN "Incident" i ON a."incidentId" = i.id
      WHERE ft."leaderUserId" = ${scope.userId}
        AND a."status" IN ('ASSIGNED', 'IN_PROGRESS')
        AND i."status" <> 'RESOLVED'
        AND i."location" IS NOT NULL
        AND ST_DWithin(i."location", r."location", ${radiusMeters})
    )`);
  }

  return conditions.length > 0 ? Prisma.sql`${Prisma.join(conditions, ' AND ')}` : Prisma.sql`TRUE`;
}

export async function queryResourceList(opts: {
  scope: ResourceAccessScope;
  query: ResourceQueryInput;
  requesterId: string;
}) {
  const { scope, query, requesterId } = opts;
  const where = buildResourceWhere(query, scope);
  const offset = (query.page - 1) * query.limit;

  const [items, countRows] = await Promise.all([
    prisma.$queryRaw<ResourceRow[]>(
      Prisma.sql`${resourceSelect(requesterId)} WHERE ${where} ORDER BY r."createdAt" ${query.sort === 'oldest' ? Prisma.sql`ASC` : Prisma.sql`DESC`} LIMIT ${query.limit} OFFSET ${offset}`,
    ),
    prisma.$queryRaw<{ count: number }[]>(
      Prisma.sql`SELECT count(*)::int AS count FROM "Resource" r LEFT JOIN "FieldTeam" t ON r."teamId" = t."id" WHERE ${where}`,
    ),
  ]);

  return { items, total: countRows[0]?.count ?? 0 };
}

export type ShelterAccessScope =
  | { kind: 'ALL' }
  | { kind: 'FIELD_OFFICER'; userId: string }
  | { kind: 'ACTIVE_ASSIGNMENT_TEAM'; userId: string };

export interface ShelterRow {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  total_capacity: number;
  current_occupancy: number;
  status: string;
  capabilities: unknown;
  created_at: Date;
  updated_at: Date;
}

// SQL helper for consistent selection
export function shelterSelect(): Prisma.Sql {
  return Prisma.sql`
    SELECT
      s."publicId" AS id,
      s."name",
      ST_Y(s."location"::geometry)::float8 AS latitude,
      ST_X(s."location"::geometry)::float8 AS longitude,
      s."totalCapacity" AS total_capacity,
      s."currentOccupancy" AS current_occupancy,
      s."status"::text AS status,
      s."capabilities",
      s."createdAt" AS created_at,
      s."updatedAt" AS updated_at
    FROM "Shelter" s
  `;
}

function shelterScopeSql(scope: ShelterAccessScope): Prisma.Sql | null {
  if (scope.kind === 'ALL') return null;
  if (scope.kind === 'ACTIVE_ASSIGNMENT_TEAM') {
    return Prisma.sql`EXISTS (
      SELECT 1
      FROM "AssignmentItem" ai
      JOIN "Assignment" a ON ai."assignmentId" = a.id
      JOIN "FieldTeam" t ON a."fieldTeamId" = t.id
      JOIN "Incident" i ON a."incidentId" = i.id
      WHERE ai."shelterId" = s.id
        AND t."leaderUserId" = ${scope.userId}
        AND a."status" IN ('ASSIGNED', 'IN_PROGRESS')
        AND i."status" <> 'RESOLVED'
    )`;
  }
  return Prisma.sql`EXISTS (
    SELECT 1
    FROM "AssignmentItem" ai
    JOIN "Assignment" a ON ai."assignmentId" = a.id
    JOIN "FieldTeam" t ON a."fieldTeamId" = t.id
    WHERE ai."shelterId" = s.id AND t."leaderUserId" = ${scope.userId}
  )`;
}

export function buildShelterWhere(
  query: ShelterQueryInput,
  scope: ShelterAccessScope,
): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  const scoped = shelterScopeSql(scope);
  if (scoped) conditions.push(scoped);

  if (query.status) conditions.push(Prisma.sql`s."status" = ${query.status}::"ShelterStatus"`);
  if (query.search) conditions.push(Prisma.sql`s."name" ILIKE ${`%${query.search}%`}`);
  if (query.min_available_capacity !== undefined) {
    conditions.push(Prisma.sql`s."currentOccupancy" <= (s."totalCapacity" - ${query.min_available_capacity})`);
  }
  if (
    query.nearby_lat !== undefined &&
    query.nearby_lng !== undefined &&
    query.nearby_radius_km !== undefined
  ) {
    const radiusMeters = query.nearby_radius_km * 1000;
    conditions.push(
      Prisma.sql`ST_DWithin(s."location", ST_SetSRID(ST_MakePoint(${query.nearby_lng}, ${query.nearby_lat}), 4326)::geography, ${radiusMeters})`,
    );
  }

  return conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
}

export async function queryShelterList(opts: {
  scope: ShelterAccessScope;
  query: ShelterQueryInput;
}) {
  const { scope, query } = opts;
  const where = buildShelterWhere(query, scope);
  const offset = (query.page - 1) * query.limit;

  const [items, totalCount] = await Promise.all([
    prisma.$queryRaw<ShelterRow[]>(Prisma.sql`
      ${shelterSelect()}
      ${where}
      ORDER BY s."createdAt" ${query.sort === 'oldest' ? Prisma.sql`ASC` : Prisma.sql`DESC`}
      LIMIT ${query.limit} OFFSET ${offset}
    `),
    prisma.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "Shelter" s ${where}`,
    ),
  ]);

  return { items, total: Number(totalCount[0]?.count ?? 0) };
}

export type TeamAccessScope =
  | { kind: 'ALL' }
  | { kind: 'OWN_TEAM'; userId: string };

export function buildTeamWhere(
  query: TeamQueryInput,
  scope: TeamAccessScope,
  capability?: string,
): Prisma.FieldTeamWhereInput {
  const where: Prisma.FieldTeamWhereInput = {};
  if (query.status) where.status = query.status;
  if (scope.kind === 'OWN_TEAM') where.leaderUserId = scope.userId;
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { leader: { fullName: { contains: query.search, mode: 'insensitive' } } },
    ];
  }
  if (capability) {
    where.AND = [{ capabilityProfile: { path: [capability], not: Prisma.DbNull } }];
  }
  return where;
}

export async function queryTeamList(opts: {
  scope: TeamAccessScope;
  query: TeamQueryInput;
  capability?: string;
}): Promise<{ items: TeamWithRelations[]; total: number }> {
  const { scope, query } = opts;
  const where = buildTeamWhere(query, scope, opts.capability);
  const offset = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    prisma.fieldTeam.findMany({
      where,
      include: teamInclude,
      orderBy: { createdAt: query.sort === 'oldest' ? 'asc' : 'desc' },
      skip: offset,
      take: query.limit,
    }),
    prisma.fieldTeam.count({ where }),
  ]);

  return { items, total };
}
