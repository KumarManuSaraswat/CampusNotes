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
  read(file: StoredFile, mime: string, maxBytes?: number): Promise<Buffer>;
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
  async read(file, mime, maxBytes = env.MAX_FILE_MB * 1024 * 1024) {
    const format = mime === 'application/pdf' ? 'pdf' : mime === 'image/jpeg' ? 'jpg' : 'png';
    const url = cloudinary.utils.private_download_url(file.storagePublicId, format, {
      resource_type: file.storageResourceType,
      type: 'authenticated',
      expires_at: Math.floor(Date.now() / 1000) + 300,
    });
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'api.cloudinary.com')
      throw new Error('Cloudinary returned an unexpected download endpoint.');
    const response = await fetch(parsed, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok || !response.body)
      throw new Error(`Cloudinary original download failed with status ${response.status}.`);
    const declaredSize = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes)
      throw new Error('Stored original exceeds the configured limit.');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new Error('Stored original exceeds the configured limit.');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(
      chunks.map((chunk) => Buffer.from(chunk)),
      size,
    );
  },
};
