import { Router } from 'express';
import { AppRequest } from '../middleware/index';
import { requireRole } from '../middleware/auth';
import prisma from '../lib/prisma';
import { ragQuerySchema } from '@drcip/contracts';
import { RagService } from '../services/RagService';

const router = Router();
const ragService = new RagService();

router.post(
  '/query',
  requireRole('CITIZEN', 'FIELD_OFFICER', 'DISASTER_COORDINATOR', 'ADMINISTRATOR'),
  async (req: AppRequest, res, next) => {
    try {
      const body = ragQuerySchema.parse(req.body);

      if (body.incident_id) {
        const incident = await prisma.incident.findUnique({
          where: { publicId: body.incident_id },
          select: { reporterUserId: true },
        });

        const visible =
          incident !== null &&
          (req.userRole !== 'CITIZEN' || incident.reporterUserId === req.userId);

        if (!visible) {
          return res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Incident not found' },
            request_id: req.requestId,
          });
        }
      }

      const result = await ragService.query(body.query);

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
