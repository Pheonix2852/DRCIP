import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { AppRequest } from '../middleware/index';
import { requireRole } from '../middleware/auth';
import prisma from '../lib/prisma';
import { publicId } from '../lib/publicId';
import {
  createResourceSchema,
  updateResourceSchema,
  resourceQuerySchema,
  type UpdateResourceInput,
} from '@drcip/contracts';
import { WebSocketService } from '../services/WebSocketService';

const router = Router();

// Read roles: Field Officer (read-only, own-team contextualized), Coordinator, Admin.
const READ_ROLES = ['FIELD_OFFICER', 'DISASTER_COORDINATOR', 'ADMINISTRATOR'];
// Mutating roles: Coordinator and Admin only.
const WRITE_ROLES = ['DISASTER_COORDINATOR', 'ADMINISTRATOR'];

// WebSocket is optional at runtime (e.g. during tests). Publishing must never
// block a successful persistence.
function getWsService() {
  try {
    return WebSocketService.getInstance();
  } catch {
    return { publishResourceUpdated: () => {} };
  }
}

interface ResourceRow {
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
function resourceSelect(requesterId: string): Prisma.Sql {
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

function buildWhere(query: {
  resource_type?: string;
  status?: string;
  capability?: string;
  search?: string;
  nearby_lat?: number;
  nearby_lng?: number;
  nearby_radius_km?: number;
}): Prisma.Sql {
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

  return conditions.length > 0 ? Prisma.sql`${Prisma.join(conditions, ' AND ')}` : Prisma.sql`TRUE`;
}

function buildUpdateSets(body: UpdateResourceInput): Prisma.Sql[] {
  const sets: Prisma.Sql[] = [];
  if (body.name !== undefined) sets.push(Prisma.sql`"name" = ${body.name}`);
  if (body.status !== undefined) sets.push(Prisma.sql`"status" = ${body.status}::"ResourceStatus"`);
  if (body.quantity !== undefined) sets.push(Prisma.sql`"quantity" = ${body.quantity}`);
  if (body.unit !== undefined) sets.push(Prisma.sql`"unit" = ${body.unit}`);
  if (body.capacity !== undefined) sets.push(Prisma.sql`"capacity" = ${body.capacity}`);
  if (body.capability_profile !== undefined) {
    sets.push(Prisma.sql`"capabilityProfile" = ${JSON.stringify(body.capability_profile)}::jsonb`);
  }
  if (body.contact_reference !== undefined) {
    sets.push(Prisma.sql`"contactReference" = ${body.contact_reference}`);
  }
  if (body.latitude !== undefined && body.longitude !== undefined) {
    sets.push(
      Prisma.sql`"location" = ST_SetSRID(ST_MakePoint(${body.longitude}, ${body.latitude}), 4326)::geography`,
    );
  }
  return sets;
}

// GET /api/v1/resources — role-scoped inventory list with filters
router.get('/', requireRole(...READ_ROLES), async (req: AppRequest, res, next) => {
  try {
    const query = resourceQuerySchema.parse(req.query);
    const where = buildWhere(query);
    const direction = query.sort === 'oldest' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const offset = (query.page - 1) * query.limit;

    const [items, countRows] = await Promise.all([
      prisma.$queryRaw<ResourceRow[]>(
        Prisma.sql`${resourceSelect(req.userId!)} WHERE ${where} ORDER BY r."createdAt" ${direction} LIMIT ${query.limit} OFFSET ${offset}`,
      ),
      prisma.$queryRaw<{ count: number }[]>(
        Prisma.sql`SELECT count(*)::int AS count FROM "Resource" r WHERE ${where}`,
      ),
    ]);

    const total = countRows[0]?.count ?? 0;

    res.json({
      success: true,
      data: {
        items,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          total_pages: Math.ceil(total / query.limit),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/resources/:resourceId — current resource and deployment context
router.get('/:resourceId', requireRole(...READ_ROLES), async (req: AppRequest, res, next) => {
  try {
    const rows = await prisma.$queryRaw<ResourceRow[]>(
      Prisma.sql`${resourceSelect(req.userId!)} WHERE r."publicId" = ${req.params.resourceId} LIMIT 1`,
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Resource not found' },
        request_id: req.requestId,
      });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/resources — Coordinator/Admin
router.post('/', requireRole(...WRITE_ROLES), async (req: AppRequest, res, next) => {
  try {
    const body = createResourceSchema.parse(req.body);
    const ref = publicId('RES');

    const locationFragment =
      body.latitude !== undefined && body.longitude !== undefined
        ? Prisma.sql`ST_SetSRID(ST_MakePoint(${body.longitude}, ${body.latitude}), 4326)::geography`
        : Prisma.sql`NULL`;

    const created = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; status: string; createdAt: Date }[]>(
        Prisma.sql`
          INSERT INTO "Resource"
            ("id","publicId","resourceType","name","status","quantity","unit","capacity","capabilityProfile","location","contactReference","createdAt","updatedAt")
          VALUES (
            gen_random_uuid(), ${ref}, ${body.resource_type}::"ResourceType", ${body.name}, ${body.status}::"ResourceStatus",
            ${body.quantity}, ${body.unit ?? null}, ${body.capacity ?? null},
            ${JSON.stringify(body.capability_profile ?? {})}::jsonb,
            ${locationFragment},
            ${body.contact_reference ?? null}, NOW(), NOW()
          )
          RETURNING "id", "status"::text AS status, "createdAt"
        `,
      );
      const row = rows[0];

      await tx.auditLog.create({
        data: {
          actorUserId: req.userId,
          action: 'RESOURCE_CREATE',
          entityType: 'RESOURCE',
          entityId: row.id,
          afterState: {
            public_id: ref,
            resource_type: body.resource_type,
            status: row.status,
            quantity: body.quantity,
          },
          metadata: { resource_public_id: ref },
        },
      });

      return row;
    });

    getWsService().publishResourceUpdated(created.id, ref, created.status);

    res.status(201).json({
      success: true,
      data: {
        resource_id: ref,
        status: created.status,
        created_at: created.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/resources/:resourceId — Coordinator/Admin
router.patch('/:resourceId', requireRole(...WRITE_ROLES), async (req: AppRequest, res, next) => {
  try {
    const body = updateResourceSchema.parse(req.body);
    const sets = buildUpdateSets(body);

    if (sets.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'No updatable fields provided' },
        request_id: req.requestId,
      });
    }

    const existing = await prisma.resource.findUnique({ where: { publicId: req.params.resourceId } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Resource not found' },
        request_id: req.requestId,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`UPDATE "Resource" SET ${Prisma.join(sets, ', ')}, "updatedAt" = NOW() WHERE "id" = ${existing.id}`,
      );

      const rows = await tx.$queryRaw<ResourceRow[]>(
        Prisma.sql`${resourceSelect(req.userId!)} WHERE r."id" = ${existing.id} LIMIT 1`,
      );
      const row = rows[0];

      await tx.auditLog.create({
        data: {
          actorUserId: req.userId,
          action: 'RESOURCE_UPDATE',
          entityType: 'RESOURCE',
          entityId: existing.id,
          beforeState: { status: existing.status, name: existing.name },
          afterState: { status: row.status, quantity: row.quantity, name: row.name },
          metadata: { resource_public_id: existing.publicId },
        },
      });

      return row;
    });

    getWsService().publishResourceUpdated(existing.id, existing.publicId, updated.status);

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
