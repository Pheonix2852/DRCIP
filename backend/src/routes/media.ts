import { Router } from 'express';
import { AppRequest } from '../middleware/index';
import { AppError } from '../middleware/errorHandler';
import prisma from '../lib/prisma';
import { upload, isMulterLimitError } from '../middleware/upload';
import { MediaService } from '../services/MediaService';

const router = Router();

router.post('/:incidentId/media', (req: AppRequest, res, next) => {
  upload(req, res, async (err) => {
    if (err) {
      if (isMulterLimitError(err)) {
        return next(new AppError(400, 'MEDIA_TOO_LARGE', 'Media file exceeds the 25 MB limit'));
      }
      return next(err);
    }

    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'No media file uploaded' },
          request_id: req.requestId,
        });
      }

      const incident = await prisma.incident.findFirst({ where: { publicId: req.params.incidentId } });
      if (!incident) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Incident not found' },
          request_id: req.requestId,
        });
      }

      // MediaService validates size/duration, uploads to Cloudinary through the
      // storage provider, then persists IncidentMedia. Success is only reported
      // once the provider upload and DB insert both succeed.
      const mediaRecord = await MediaService.store(incident.id, file);

      res.status(201).json({
        success: true,
        data: {
          id: mediaRecord.id,
          media_type: mediaRecord.mediaType,
          mime_type: mediaRecord.mimeType,
          secure_url: mediaRecord.secureUrl,
          duration_seconds: mediaRecord.durationSeconds,
        },
      });
    } catch (uploadErr) {
      next(uploadErr);
    }
  });
});

export default router;