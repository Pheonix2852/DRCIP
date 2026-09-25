import { Router } from 'express';
import { AppRequest } from '../middleware/index';
import { requireRole } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

interface CapacityRow {
  available_resources: bigint;
  active_teams: bigint;
  available_shelter_capacity: bigint | null;
}

// Read-only operational capacity summary for the Coordinator dashboard.
// A single round-trip aggregation avoids N+1 queries and keeps the three
// signals consistent with one another.
router.get('/', requireRole('DISASTER_COORDINATOR', 'ADMINISTRATOR'), async (req: AppRequest, res, next) => {
  try {
    const rows = await prisma.$queryRaw<CapacityRow[]>`
      SELECT
        (SELECT COUNT(*) FROM "Resource" WHERE "status" = 'AVAILABLE') AS available_resources,
        (SELECT COUNT(*) FROM "FieldTeam" WHERE "status" = 'ACTIVE') AS active_teams,
        (SELECT COALESCE(SUM("totalCapacity" - "currentOccupancy"), 0)
           FROM "Shelter" WHERE "status" = 'AVAILABLE') AS available_shelter_capacity
    `;
    const stats = rows[0];

    res.json({
      success: true,
      data: {
        available_resources: Number(stats?.available_resources ?? 0),
        active_teams: Number(stats?.active_teams ?? 0),
        available_shelter_capacity: Number(stats?.available_shelter_capacity ?? 0),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
