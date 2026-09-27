import { Router } from 'express';
import { AppRequest } from '../middleware/index';
import { requireRole } from '../middleware/auth';
import prisma from '../lib/prisma';
import type { ResponseZoneListResponse } from '@drcip/contracts';

const router = Router();

// Active response zones for zone pickers and report filters. Public ids are
// exposed because they are the only zone identifier the API surfaces.
router.get('/', requireRole('FIELD_OFFICER', 'DISASTER_COORDINATOR', 'ADMINISTRATOR'), async (req: AppRequest, res, next) => {
  try {
    const zones = await prisma.responseZone.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { publicId: true, name: true, isActive: true },
    });

    const data: ResponseZoneListResponse = {
      items: zones.map((zone) => ({
        public_id: zone.publicId,
        name: zone.name,
        is_active: zone.isActive,
      })),
    };

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
