import prisma from '../lib/prisma';
import { CloudinaryMediaProvider } from './CloudinaryMediaProvider';
import { AppError } from '../middleware/errorHandler';
import { videoDurationSeconds } from './videoDuration';

const MAX_PHOTO_SIZE = parseInt(process.env.MAX_PHOTO_SIZE_BYTES || '10485760', 10);
const MAX_VIDEO_SIZE = parseInt(process.env.MAX_VIDEO_SIZE_BYTES || '26214400', 10);
const MAX_VIDEO_DURATION = parseInt(process.env.MAX_VIDEO_DURATION_SECONDS || '30', 10);
const MAX_ATTACHMENTS = parseInt(process.env.MAX_ATTACHMENTS_PER_INCIDENT || '5', 10);

export class MediaService {
  private static provider = new CloudinaryMediaProvider();

  static async store(
    incidentId: string,
    file: Express.Multer.File,
    _metadata: { width?: number; height?: number } = {}
  ) {
    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/');

    if (isImage && file.size > MAX_PHOTO_SIZE) {
      throw new AppError(400, 'MEDIA_TOO_LARGE', `Photo exceeds the ${MAX_PHOTO_SIZE / 1024 / 1024} MB limit`);
    }
    if (isVideo && file.size > MAX_VIDEO_SIZE) {
      throw new AppError(400, 'MEDIA_TOO_LARGE', `Video exceeds the ${MAX_VIDEO_SIZE / 1024 / 1024} MB limit`);
    }

    // Video duration limit (seconds). Fail closed: an unreadable duration is
    // rejected rather than accepted as "no duration".
    let durationSeconds: number | null = null;
    if (isVideo) {
      durationSeconds = videoDurationSeconds(file.buffer, file.mimetype);
      if (!(durationSeconds > 0)) {
        throw new AppError(400, 'MEDIA_DURATION_UNREADABLE', 'Could not read video duration. Please upload an MP4 or WebM file.');
      }
      if (durationSeconds > MAX_VIDEO_DURATION) {
        throw new AppError(400, 'VIDEO_TOO_LONG', `Video must be ${MAX_VIDEO_DURATION} seconds or less`);
      }
    }

    // Attachment-count limit — checked before the provider upload so a rejected
// request never reaches Cloudinary and never persists a row (no partial state).
    const existingCount = await prisma.incidentMedia.count({ where: { incidentId } });
    if (existingCount >= MAX_ATTACHMENTS) {
      throw new AppError(
        400,
        'MEDIA_LIMIT_REACHED',
        `Incident already has the maximum of ${MAX_ATTACHMENTS} attachments`
      );
    }

    const uploadResult = await this.provider.upload(file, { incidentId });

    return await prisma.incidentMedia.create({
      data: {
        incidentId,
        mediaType: isImage ? 'IMAGE' : 'VIDEO',
        provider: 'cloudinary',
        providerAssetId: uploadResult.providerAssetId,
        secureUrl: uploadResult.secureUrl,
        mimeType: file.mimetype,
        byteSize: BigInt(file.size),
        durationSeconds,
      },
    });
  }
}