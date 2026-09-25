import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppRequest } from '../middleware/index';
import { requireRole } from '../middleware/auth';
import prisma from '../lib/prisma';
import { publicId } from '../lib/publicId';
import {
  createShelterSchema,
  updateShelterSchema,
  shelterQuerySchema,
} from '@drcip/contracts';

const router = Router();

const READ_ROLES = ['FIELD_OFFICER', 'DISASTER_COORDINATOR', 'ADMINISTRATOR'];
const WRITE_ROLES = ['DISASTER_COORDINATOR', 'ADMINISTRATOR'];

function notFound(res: Response, req: AppRequest) {
  return res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Shelter not found' },
    request_id: req.requestId,
  });
}

interface ShelterRow {
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
function shelterSelect() {
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

router.get('/', requireRole(...READ_ROLES), async (req: AppRequest, res, next) => {
  try {
    const query = shelterQuerySchema.parse(req.query);
    const offset = (query.page - 1) * query.limit;

    const conditions: Prisma.Sql[] = [];
    if (query.status) conditions.push(Prisma.sql`s."status" = ${query.status}::"ShelterStatus"`);
    if (query.search) conditions.push(Prisma.sql`s."name" ILIKE ${`%${query.search}%`}`);
    if (query.min_available_capacity !== undefined) {
      conditions.push(Prisma.sql`s."currentOccupancy" <= (s."totalCapacity" - ${query.min_available_capacity})`);
    }

    if (query.nearby_lat !== undefined && query.nearby_lng !== undefined && query.nearby_radius_km !== undefined) {
      const radiusMeters = query.nearby_radius_km * 1000;
      conditions.push(
        Prisma.sql`ST_DWithin(s."location", ST_SetSRID(ST_MakePoint(${query.nearby_lng}, ${query.nearby_lat}), 4326)::geography, ${radiusMeters})`
      );
    }

    const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

    const [items, totalCount] = await Promise.all([
      prisma.$queryRaw<ShelterRow[]>`
        ${shelterSelect()}
        ${where}
        ORDER BY s."createdAt" ${query.sort === 'oldest' ? Prisma.sql`ASC` : Prisma.sql`DESC`}
        LIMIT ${query.limit} OFFSET ${offset}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "Shelter" s ${where}`
    ]);

    res.json({
      success: true,
      data: {
        items,
        pagination: {
          page: query.page,
          limit: query.limit,
          total: Number(totalCount[0]?.count ?? 0),
          total_pages: Math.ceil(Number(totalCount[0]?.count ?? 0) / query.limit),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:shelterId', requireRole(...READ_ROLES), async (req: AppRequest, res, next) => {
  try {
    const shelter = await prisma.$queryRaw<ShelterRow[]>`
      ${shelterSelect()}
      WHERE s."publicId" = ${req.params.shelterId}
    `;
    if (shelter.length === 0) return notFound(res, req);
    res.json({ success: true, data: shelter[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole(...WRITE_ROLES), async (req: AppRequest, res, next) => {
  try {
    const body = createShelterSchema.parse(req.body);
    const ref = publicId('SHL');
    
    await prisma.$transaction(async (tx) => {
      const s = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "Shelter" ("id", "publicId", "name", "location", "totalCapacity", "currentOccupancy", "status", "capabilities", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), ${ref}, ${body.name}, ST_SetSRID(ST_MakePoint(${body.longitude}, ${body.latitude}), 4326)::geography, ${body.total_capacity}, ${body.current_occupancy}, ${body.status}::"ShelterStatus", ${JSON.stringify(body.capabilities ?? {})}::jsonb, NOW(), NOW())
        RETURNING id
      `;
      
      await tx.auditLog.create({
        data: {
          actorUserId: req.userId,
          action: 'SHELTER_CREATE',
          entityType: 'SHELTER',
          entityId: s[0].id,
          afterState: { public_id: ref, name: body.name, status: body.status },
        },
      });
      return s[0].id;
    });

    res.status(201).json({ success: true, data: { shelter_id: ref, created_at: new Date().toISOString() } });
  } catch (err) {
    next(err);
  }
});

router.patch('/:shelterId', requireRole(...WRITE_ROLES), async (req: AppRequest, res, next) => {
  try {
    const body = updateShelterSchema.parse(req.body);

    if (Object.keys(body).length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'No updatable fields provided' },
        request_id: req.requestId,
      });
    }

    const existing = await prisma.shelter.findUnique({ where: { publicId: req.params.shelterId } });
    if (!existing) return notFound(res, req);

    // Occupancy must never exceed capacity, including partial updates where only
    // one of the two fields is supplied. Compare against the effective values.
    const effectiveCapacity = body.total_capacity ?? existing.totalCapacity;
    const effectiveOccupancy = body.current_occupancy ?? existing.currentOccupancy;
    if (effectiveOccupancy > effectiveCapacity) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Occupancy cannot exceed total capacity' },
        request_id: req.requestId,
      });
    }

    await prisma.$transaction(async (tx) => {
      const updateData: Prisma.ShelterUpdateInput = {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.total_capacity !== undefined) updateData.totalCapacity = body.total_capacity;
      if (body.current_occupancy !== undefined) updateData.currentOccupancy = body.current_occupancy;
      if (body.status !== undefined) updateData.status = body.status;
      if (body.capabilities !== undefined) updateData.capabilities = body.capabilities as Prisma.InputJsonValue;
      if (body.latitude !== undefined && body.longitude !== undefined) {
          await tx.$executeRaw`
            UPDATE "Shelter" 
            SET "location" = ST_SetSRID(ST_MakePoint(${body.longitude}, ${body.latitude}), 4326)::geography 
            WHERE "id" = ${existing.id}
          `;
      }

      await tx.shelter.update({
        where: { id: existing.id },
        data: updateData,
      });

      await tx.auditLog.create({
        data: {
          actorUserId: req.userId,
          action: 'SHELTER_UPDATE',
          entityType: 'SHELTER',
          entityId: existing.id,
          afterState: body as Prisma.InputJsonValue,
        },
      });
    });

    res.json({ success: true, data: { id: existing.publicId, ...body } });
  } catch (err) {
    next(err);
  }
});

export default router;
