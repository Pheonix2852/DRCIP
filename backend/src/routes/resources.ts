import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { AppRequest } from '../middleware/index';
import { requireRole } from '../middleware/auth';
import prisma from '../lib/prisma';
import { publicId } from '../lib/publicId';
import {
  queryResourceList,
  resourceSelect,
  type ResourceRow,
} from '../lib/domainQueries';
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
    // Existing REST behavior: all read roles see the full inventory. Future RAG
    // tools can pass OWN_TEAM without changing this route.
    const { items, total } = await queryResourceList({
      scope: { kind: 'ALL' },
      query,
      requesterId: req.userId!,
    });

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
