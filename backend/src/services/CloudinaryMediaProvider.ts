import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { MediaStorageProvider } from './MediaStorageProvider';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export class CloudinaryMediaProvider implements MediaStorageProvider {
  async upload(file: Express.Multer.File, metadata: { incidentId: string }) {
    const uploadResult = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: file.mimetype.startsWith('image/') ? 'image' : 'video',
          folder: `drcip/incidents/${metadata.incidentId}`,
          public_id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        },
        (error, result) => {
          if (error) reject(error);
          else if (result) resolve(result);
          else reject(new Error('Upload returned undefined'));
        }
      );
      stream.end(file.buffer);
    });

    return {
      providerAssetId: uploadResult.public_id,
      secureUrl: uploadResult.secure_url,
    };
  }
}
