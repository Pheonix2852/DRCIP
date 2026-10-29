import {
  RAG_TOOL_ALLOWED_ROLES,
  ROLES,
  type GetNearbyAmbulancesArgs,
  type RagToolArgumentMap,
  type RagToolName,
  type Role,
} from '@drcip/contracts';
import prisma from '../lib/prisma';

// Central server-side authorization boundary for every RAG live tool. Identity
// and role come only from the authenticated request; tool arguments can never
// select or widen the caller's scope.

export interface RagToolContext {
  userId: string;
  role: Role;
  // Present only for Field Officers and verified at context creation time.
  fieldTeamId?: string;
}

export type RagToolAuthorization =
  | { kind: 'ALL' }
  | { kind: 'OWN_TEAM'; userId: string }
  | { kind: 'ASSIGNED_TEAM'; userId: string }
  | { kind: 'ACTIVE_ASSIGNMENT_TEAM'; userId: string };

export type RagToolAuthorizationErrorCode =
  | 'INVALID_CONTEXT'
  | 'SCOPE_UNVERIFIED'
  | 'FORBIDDEN';

export class RagToolAuthorizationError extends Error {
  constructor(
    readonly code: RagToolAuthorizationErrorCode,
    readonly tool: RagToolName,
    message: string,
  ) {
    super(message);
    this.name = 'RagToolAuthorizationError';
  }
}

const ROLE_VALUES = new Set<string>(Object.values(ROLES));

export async function resolveRagToolContext(source: {
  userId?: string;
  userRole?: string;
}): Promise<RagToolContext> {
  const { userId, userRole } = source;

  if (!userId || !userRole || !ROLE_VALUES.has(userRole)) {
    throw new RagToolAuthorizationError(
      'INVALID_CONTEXT',
      'get_active_incidents',
      'Authenticated identity is required',
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user || !user.isActive || user.role !== userRole) {
    throw new RagToolAuthorizationError(
      'INVALID_CONTEXT',
      'get_active_incidents',
      'Authenticated identity could not be verified',
    );
  }

  const role = user.role as Role;
  if (role !== ROLES.FIELD_OFFICER) {
    return { userId, role };
  }

  const team = await prisma.fieldTeam.findUnique({
    where: { leaderUserId: userId },
    select: { id: true },
  });
  if (!team) {
    throw new RagToolAuthorizationError(
      'SCOPE_UNVERIFIED',
      'get_active_incidents',
      'Field Officer team could not be verified',
    );
  }

  return { userId, role, fieldTeamId: team.id };
}

export async function authorizeRagTool<T extends RagToolName>(
  ctx: RagToolContext,
  tool: T,
  args: RagToolArgumentMap[T],
): Promise<RagToolAuthorization> {
  if (!RAG_TOOL_ALLOWED_ROLES[tool].includes(ctx.role)) {
    throw new RagToolAuthorizationError('FORBIDDEN', tool, 'Access denied for this role');
  }

  if (ctx.role !== ROLES.FIELD_OFFICER) {
    return { kind: 'ALL' };
  }

  if (!ctx.fieldTeamId) {
    throw new RagToolAuthorizationError('SCOPE_UNVERIFIED', tool, 'Field Officer team could not be verified');
  }

  switch (tool) {
    case 'get_active_incidents':
      return { kind: 'ASSIGNED_TEAM', userId: ctx.userId };
    case 'get_nearby_ambulances':
      await assertFieldOfficerIncidentProximity(ctx, tool, args as GetNearbyAmbulancesArgs);
      return { kind: 'ALL' };
    case 'get_available_rescue_teams':
      return { kind: 'OWN_TEAM', userId: ctx.userId };
    case 'get_shelter_capacity':
      return { kind: 'ACTIVE_ASSIGNMENT_TEAM', userId: ctx.userId };
    case 'get_resource_stock':
      // The role matrix already denies this to Field Officers.
      throw new RagToolAuthorizationError('FORBIDDEN', tool, 'Access denied for this role');
    case 'get_current_assignments':
      return { kind: 'OWN_TEAM', userId: ctx.userId };
    default:
      throw new RagToolAuthorizationError('FORBIDDEN', tool, 'Unsupported tool');
  }
}

// A Field Officer may only search near an active incident their own team is
// assigned to. The requested search circle must overlap that incident's
// location; otherwise the request is rejected before any resource data is read.
async function assertFieldOfficerIncidentProximity(
  ctx: RagToolContext,
  tool: RagToolName,
  args: GetNearbyAmbulancesArgs,
) {
  const rows = await prisma.$queryRaw<{ allowed: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM "Assignment" a
      JOIN "FieldTeam" t ON a."fieldTeamId" = t.id
      JOIN "Incident" i ON a."incidentId" = i.id
      WHERE t."leaderUserId" = ${ctx.userId}
        AND a."status" IN ('ASSIGNED', 'IN_PROGRESS')
        AND i."status" <> 'RESOLVED'
        AND i."location" IS NOT NULL
        AND ST_DWithin(
          i."location",
          ST_SetSRID(ST_MakePoint(${args.longitude}, ${args.latitude}), 4326)::geography,
          ${args.radius_km * 1000}
        )
    ) AS allowed
  `;

  if (!rows[0]?.allowed) {
    throw new RagToolAuthorizationError(
      'FORBIDDEN',
      tool,
      'Location is not near an active assignment for your team',
    );
  }
}
