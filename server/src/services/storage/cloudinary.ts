import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'node:crypto';
import { readEnv } from '../../config/env.js';
const env = readEnv();
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});
export interface StoredFile {
  storagePublicId: string;
  storageResourceType: 'raw' | 'image';
  storageProvider: 'cloudinary';
}
export interface StorageAdapter {
  upload(buffer: Buffer, mime: string): Promise<StoredFile>;
  remove(file: StoredFile): Promise<void>;
  deliveryUrl(file: StoredFile, download: boolean): string;
  read(file: StoredFile): Promise<Buffer>;
}
export const storage: StorageAdapter = {
  upload(buffer, mime) {
    const resourceType = mime === 'application/pdf' ? 'raw' : 'image';
    const extension = mime === 'application/pdf' ? '.pdf' : '';
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'campusnotes',
          public_id: randomUUID() + extension,
          resource_type: resourceType,
          type: 'authenticated',
          overwrite: false,
        },
        (error, result) =>
          error || !result
            ? reject(error || new Error('Storage did not return a file.'))
            : resolve({
                storagePublicId: result.public_id,
                storageResourceType: resourceType,
                storageProvider: 'cloudinary',
              }),
      );
      stream.end(buffer);
    });
  },
  async remove(file) {
    await cloudinary.uploader.destroy(file.storagePublicId, {
      resource_type: file.storageResourceType,
      type: 'authenticated',
      invalidate: true,
    });
  },
  deliveryUrl(file, download) {
    return cloudinary.url(file.storagePublicId, {
      resource_type: file.storageResourceType,
      type: 'authenticated',
      sign_url: true,
      secure: true,
      ...(download ? { flags: 'attachment' } : {}),
    });
  },
  async read(file) {
    const response = await fetch(this.deliveryUrl(file, false));
    if (!response.ok) throw new Error('Stored original could not be retrieved.');
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > env.MAX_FILE_MB * 1024 * 1024)
      throw new Error('Stored original exceeds the configured limit.');
    return data;
  },
};
