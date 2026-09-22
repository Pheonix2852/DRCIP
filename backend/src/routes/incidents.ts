import { Router } from 'express';
import { AppRequest } from '../middleware/index';
import { requireRole } from '../middleware/auth';
import prisma from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { createIncidentSchema, incidentQuerySchema, triageSchema } from '@drcip/contracts';
import { WebSocketService } from '../services/WebSocketService';

const router = Router();

const getWsService = () => {
  try {
    return WebSocketService.getInstance();
  } catch {
    return { publishIncidentCreated: () => {}, publishIncidentUpdated: () => {} };
  }
};

// POST /api/v1/incidents — Citizen or Field Officer
router.post('/', async (req: AppRequest, res, next) => {
  try {
    const body = createIncidentSchema.parse(req.body);

    const publicId = `INC-${uuidv4().slice(0, 8).toUpperCase()}`;

    const incident = await prisma.$transaction(async (tx) => {
      // Create incident entirely via raw SQL since location is Unsupported geography
      const createdResult = await tx.$queryRaw<{ id: string; publicId: string; reporterUserId: string; disasterType: string; description: string; peopleAffected: number; emergencyContactNumber: string; responseZoneId: string | null; status: string; createdAt: Date; updatedAt: Date }[]>`
        INSERT INTO "Incident" ("id", "publicId", "reporterUserId", "disasterType", "description", "peopleAffected", "emergencyContactNumber", "location", "status", "createdAt", "updatedAt")
        VALUES (
          gen_random_uuid(),
          ${publicId},
          ${req.userId!},
          ${body.disaster_type}::"DisasterType",
          ${body.description},
          ${body.people_affected},
          ${body.emergency_contact_number},
          ST_SetSRID(ST_MakePoint(${body.longitude}, ${body.latitude}), 4326)::geography,
          'REPORTED',
          NOW(),
          NOW()
        )
        RETURNING "id", "publicId", "reporterUserId", "disasterType", "description", "peopleAffected", "emergencyContactNumber", "responseZoneId", "status", "createdAt", "updatedAt"
      `;
      const created = createdResult[0];

      // Assign response zone via PostGIS point-in-polygon on the geographic columns
      try {
        const zone = await tx.$queryRaw<{ id: string; publicId: string }[]>`
          SELECT "id", "publicId" FROM "ResponseZone"
          WHERE "isActive" = true
            AND "geometry_geom" IS NOT NULL
            AND ST_Contains("geometry_geom", ST_SetSRID(ST_MakePoint(${body.longitude}, ${body.latitude}), 4326))
          LIMIT 1
        `;
        if (zone.length > 0) {
          await tx.incident.update({
            where: { id: created.id },
            data: { responseZoneId: zone[0].id },
          });
          created.responseZoneId = zone[0].id;
        }
      } catch {
        // Spatial lookup failure must not block incident persistence
      }

      // Audit log creation
      await tx.auditLog.create({
        data: {
          actorUserId: req.userId,
          action: 'INCIDENT_CREATE',
          entityType: 'INCIDENT',
          entityId: created.id,
          afterState: {
            public_id: created.publicId,
            disaster_type: created.disasterType,
            status: created.status,
          },
          metadata: { incident_public_id: created.publicId },
        },
      });

      return created;
    });

    // WebSocket broadcast only after successful persistence
    getWsService().publishIncidentCreated(incident.id, incident.publicId);

    res.status(201).json({
      success: true,
      data: {
        incident_id: incident.publicId,
        status: incident.status,
        created_at: incident.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/incidents — role-scoped list with filters
router.get('/', async (req: AppRequest, res, next) => {
  try {
    const query = incidentQuerySchema.parse(req.query);

    const offset = (query.page - 1) * query.limit;

    // Use raw SQL to extract lat/lng from geography column
    const incidents = await prisma.$queryRaw<{
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
    }[]>`
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
      WHERE ${req.userRole === 'CITIZEN' ? Prisma.sql`i."reporterUserId" = ${req.userId}` : Prisma.sql`TRUE`}
        ${query.status ? Prisma.sql`AND i.status = ${query.status}::"IncidentStatus"` : Prisma.empty}
        ${query.disaster_type ? Prisma.sql`AND i."disasterType" = ${query.disaster_type}::"DisasterType"` : Prisma.empty}
        ${query.severity ? Prisma.sql`AND i."confirmedSeverity" = ${query.severity}::"SeverityLevel"` : Prisma.empty}
        ${query.search ? Prisma.sql`AND (i.description ILIKE ${`%${query.search}%`} OR i."publicId" ILIKE ${`%${query.search}%`})` : Prisma.empty}
      ORDER BY i."createdAt" ${query.sort === 'oldest' ? Prisma.sql`ASC` : Prisma.sql`DESC`}
      LIMIT ${query.limit} OFFSET ${offset}
    `;

    const totalResult = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "Incident" i
      WHERE ${req.userRole === 'CITIZEN' ? Prisma.sql`i."reporterUserId" = ${req.userId}` : Prisma.sql`TRUE`}
        ${query.status ? Prisma.sql`AND i.status = ${query.status}::"IncidentStatus"` : Prisma.empty}
        ${query.disaster_type ? Prisma.sql`AND i."disasterType" = ${query.disaster_type}::"DisasterType"` : Prisma.empty}
        ${query.severity ? Prisma.sql`AND i."confirmedSeverity" = ${query.severity}::"SeverityLevel"` : Prisma.empty}
        ${query.search ? Prisma.sql`AND (i.description ILIKE ${`%${query.search}%`} OR i."publicId" ILIKE ${`%${query.search}%`})` : Prisma.empty}
    `;
    const total = Number(totalResult[0]?.count ?? 0);

    res.json({
      success: true,
      data: {
        items: incidents.map((inc) => ({
          id: inc.publicId,
          disaster_type: inc.disasterType,
          description: inc.description,
          people_affected: inc.peopleAffected,
          emergency_contact_number: inc.emergencyContactNumber,
          latitude: inc.latitude,
          longitude: inc.longitude,
          address_text: inc.addressText,
          state: inc.state,
          district: inc.district,
          response_zone: inc.responseZonePublicId,
          predicted_severity: inc.predictedSeverity,
          confirmed_severity: inc.confirmedSeverity,
          status: inc.status,
          created_at: inc.createdAt,
          updated_at: inc.updatedAt,
        })),
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

// GET /api/v1/incidents/:incidentId — role-scoped detail
router.get('/:incidentId', async (req: AppRequest, res, next) => {
  try {
    // Use raw SQL to extract lat/lng from geography column
    const incidentResult = await prisma.$queryRaw<{
      id: string;
      publicId: string;
      reporterUserId: string;
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
      resolvedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }[]>`
      SELECT
        i.id,
        i."publicId",
        i."reporterUserId",
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
        i."resolvedAt",
        i."createdAt",
        i."updatedAt"
      FROM "Incident" i
      LEFT JOIN "ResponseZone" rz ON i."responseZoneId" = rz.id
      WHERE i."publicId" = ${req.params.incidentId}
    `;

    const incident = incidentResult[0];

    if (!incident) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Incident not found' },
        request_id: req.requestId,
      });
    }

    // Citizens can only view their own incidents
    if (req.userRole === 'CITIZEN' && incident.reporterUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied for this incident' },
        request_id: req.requestId,
      });
    }

    // Fetch related data separately
    const [media, severityPredictions] = await Promise.all([
      prisma.incidentMedia.findMany({ where: { incidentId: incident.id } }),
      prisma.severityPrediction.findMany({
        where: { incidentId: incident.id },
        orderBy: { createdAt: 'desc' },
        take: 1,
      }),
    ]);

    res.json({
      success: true,
      data: {
        id: incident.publicId,
        reporter_user_id: incident.reporterUserId,
        disaster_type: incident.disasterType,
        description: incident.description,
        people_affected: incident.peopleAffected,
        emergency_contact_number: incident.emergencyContactNumber,
        latitude: incident.latitude,
        longitude: incident.longitude,
        address_text: incident.addressText,
        state: incident.state,
        district: incident.district,
        response_zone: incident.responseZonePublicId,
        predicted_severity: incident.predictedSeverity,
        confirmed_severity: incident.confirmedSeverity,
        status: incident.status,
        resolved_at: incident.resolvedAt,
        created_at: incident.createdAt,
        updated_at: incident.updatedAt,
        media: media.map((m) => ({
          id: m.id,
          media_type: m.mediaType,
          secure_url: m.secureUrl,
          thumbnail_url: m.thumbnailUrl,
          mime_type: m.mimeType,
          byte_size: m.byteSize.toString(),
        })),
        latest_prediction: severityPredictions[0]
          ? {
              severity: severityPredictions[0].severity,
              confidence: severityPredictions[0].confidence?.toString() ?? null,
              model_version: severityPredictions[0].modelVersion,
              status: severityPredictions[0].predictionStatus,
              generated_at: severityPredictions[0].generatedAt,
            }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/incidents/:incidentId/triage — Coordinator only
router.patch('/:incidentId/triage', requireRole('DISASTER_COORDINATOR', 'ADMINISTRATOR'), async (req: AppRequest, res, next) => {
  try {
    const body = triageSchema.parse(req.body);

    const incident = await prisma.incident.findFirst({
      where: { publicId: req.params.incidentId },
    });

    if (!incident) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Incident not found' },
        request_id: req.requestId,
      });
    }

    const updated = await prisma.incident.update({
      where: { id: incident.id },
      data: {
        confirmedSeverity: body.confirmed_severity,
        status: incident.status === 'REPORTED' ? 'TRIAGE_PENDING' : incident.status,
      },
    });

    // Audit trail of the triage decision
    await prisma.auditLog.create({
      data: {
        actorUserId: req.userId,
        action: 'INCIDENT_TRIAGE',
        entityType: 'INCIDENT',
        entityId: incident.id,
        beforeState: { confirmed_severity: incident.confirmedSeverity, status: incident.status },
        afterState: { confirmed_severity: updated.confirmedSeverity, status: updated.status },
        metadata: { notes: body.notes, incident_public_id: incident.publicId },
      },
    });

    // WebSocket broadcast only after durable transaction succeeds
    getWsService().publishIncidentUpdated(incident.id, incident.publicId, updated.status);

    res.json({
      success: true,
      data: {
        incident_id: updated.publicId,
        confirmed_severity: updated.confirmedSeverity,
        status: updated.status,
        updated_at: updated.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;