import multer from 'multer';
import { AppError } from '../middleware/errorHandler';

const MAX_VIDEO_SIZE = parseInt(process.env.MAX_VIDEO_SIZE_BYTES || '26214400', 10); // 25MB

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    // Absolute incoming ceiling. Per-type photo (10MB) / video (25MB) limits
    // are enforced in MediaService after the mime type is known.
    fileSize: MAX_VIDEO_SIZE,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new AppError(400, 'VALIDATION_ERROR', 'Unsupported media type. Use JPEG, PNG, WebP, MP4 or WebM.'));
    }
    cb(null, true);
  },
}).single('media');

export function isMulterLimitError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'LIMIT_FILE_SIZE';
}