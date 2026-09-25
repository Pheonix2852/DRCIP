import { Prisma } from '@prisma/client';
import prisma from './prisma';
import type { AssignmentQueryInput } from '@drcip/contracts';

export const assignmentInclude = {
  incident: { select: { id: true, publicId: true, status: true } },
  assigner: { select: { publicId: true } },
  recommendation: { select: { publicId: true } },
  // The Prisma relation field is generated as `FieldTeam` (see schema.prisma).
  FieldTeam: { select: { id: true, publicId: true, leaderUserId: true } },
  items: {
    include: {
      resource: { select: { publicId: true } },
      shelter: { select: { publicId: true } },
    },
  },
  events: {
    include: { actor: { select: { publicId: true } } },
    orderBy: { occurredAt: 'asc' },
  },
} satisfies Prisma.AssignmentInclude;
export type AssignmentWithRelations = Prisma.AssignmentGetPayload<{ include: typeof assignmentInclude }>;

export function serializeAssignment(a: AssignmentWithRelations) {
  const teamPublicId = a.FieldTeam?.publicId ?? null;
  return {
    id: a.publicId,
    incident_id: a.incident.publicId,
    status: a.status,
    assigned_by: a.assigner.publicId,
    field_team_id: teamPublicId,
    recommendation_id: a.recommendation?.publicId ?? null,
    notes: a.notes,
    assigned_at: a.assignedAt,
    started_at: a.startedAt,
    completed_at: a.completedAt,
    created_at: a.createdAt,
    items: a.items.map((it) => ({
      resource_type: it.resourceType,
      resource_id: it.resource?.publicId ?? null,
      // AssignmentItem.teamId has no Prisma relation; at most one team item is
      // permitted and it always equals the assignment's field team.
      team_id: it.teamId && a.FieldTeam && it.teamId === a.FieldTeam.id ? a.FieldTeam.publicId : null,
      shelter_id: it.shelter?.publicId ?? null,
      quantity: Number(it.quantity),
    })),
    events: a.events.map((e) => ({
      event_type: e.eventType,
      actor_user_id: e.actor.publicId,
      notes: e.notes,
      occurred_at: e.occurredAt,
    })),
  };
}

export async function queryAssignments(opts: {
  userId: string;
  role: string;
  query: AssignmentQueryInput;
}) {
  const { userId, role, query } = opts;
  const where: Prisma.AssignmentWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.incident_id) where.incident = { publicId: query.incident_id };
  // A Field Officer only sees assignments for the team they lead.
  if (role === 'FIELD_OFFICER') where.FieldTeam = { leaderUserId: userId };

  const offset = (query.page - 1) * query.limit;
  const [rows, total] = await Promise.all([
    prisma.assignment.findMany({
      where,
      include: assignmentInclude,
      orderBy: { createdAt: query.sort === 'oldest' ? 'asc' : 'desc' },
      skip: offset,
      take: query.limit,
    }),
    prisma.assignment.count({ where }),
  ]);

  return {
    items: rows.map(serializeAssignment),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      total_pages: Math.ceil(total / query.limit),
    },
  };
}
