import env from './env';

export interface StorageService {
  upload(file: Express.Multer.File, path: string): Promise<string>;
  delete(path: string): Promise<void>;
  getUrl(path: string): string;
}

export class LocalStorage implements StorageService {
  private uploadDir: string;

  constructor() {
    this.uploadDir = env.UPLOAD_DIR;
  }

  async upload(file: Express.Multer.File, path: string): Promise<string> {
    const fs = require('fs').promises;
    const filePath = `${this.uploadDir}/${path}`;

    // Ensure directory exists
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    await fs.mkdir(dir, { recursive: true });

    // Move file from temp to destination
    await fs.rename(file.path, filePath);

    return filePath;
  }

  async delete(path: string): Promise<void> {
    const fs = require('fs').promises;
    const filePath = `${this.uploadDir}/${path}`;

    try {
      await fs.unlink(filePath);
      // Try to remove empty parent directories (cleanup)
      const dir = filePath.substring(0, filePath.lastIndexOf('/'));
      try {
        await fs.rmdir(dir);
      } catch (e) {
        // Directory not empty, ignore
      }
    } catch (error) {
      console.error(`Error deleting file ${filePath}:`, error);
    }
  }

  getUrl(path: string): string {
    return `${env.SERVER_URL}/api/media/file/${path}`;
  }

  // Helper to get user-based path
  getUserPath(userId: string, folder?: string, filename?: string): string {
    const folderPath = folder ? `users/${userId}/${folder}` : `users/${userId}/general`;
    return filename ? `${folderPath}/${filename}` : folderPath;
  }
}

export class S3Storage implements StorageService {
  // S3 implementation for production
  async upload(file: Express.Multer.File, path: string): Promise<string> {
    // TODO: Implement S3 upload
    throw new Error('S3 storage not implemented yet');
  }

  async delete(path: string): Promise<void> {
    // TODO: Implement S3 delete
    throw new Error('S3 storage not implemented yet');
  }

  getUrl(path: string): string {
    // TODO: Return S3 URL
    throw new Error('S3 storage not implemented yet');
  }
}

export function getStorageService(): StorageService {
  if (env.STORAGE_TYPE === 's3') {
    return new S3Storage();
  }
  return new LocalStorage();
}
