import RNFS from 'react-native-fs';
import cloudService from './cloudService';

const CACHE_DIR = `${RNFS.DocumentDirectoryPath}/cloud_media`;

class MediaCacheService {
  async initialize(): Promise<void> {
    const exists = await RNFS.exists(CACHE_DIR);
    if (!exists) {
      await RNFS.mkdir(CACHE_DIR);
    }
  }

  async downloadMedia(mediaUrl: string, filename: string): Promise<string | null> {
    try {
      const deviceToken = cloudService.isEnabled() ? await cloudService.ensureDeviceAuthToken() : '';
      if (cloudService.isEnabled() && !deviceToken) return null;
      await this.initialize();
      const localPath = `${CACHE_DIR}/${filename}`;

      // Check if already cached
      const exists = await RNFS.exists(localPath);
      if (exists) {
        return localPath;
      }

      // Download media
      const downloadResult = await RNFS.downloadFile({
        fromUrl: mediaUrl,
        toFile: localPath,
        headers: deviceToken ? { Authorization: `Bearer ${deviceToken}` } : undefined,
        progress: (res) => {
          const progress = (res.bytesWritten / res.contentLength) * 100;
          console.log(`Download progress: ${progress.toFixed(2)}%`);
        },
      });

      const result = await downloadResult.promise;
      if (result.statusCode === 200) {
        return localPath;
      }

      return null;
    } catch (error) {
      console.error('Download media failed:', error);
      return null;
    }
  }

  async getCachedMedia(filename: string): Promise<string | null> {
    try {
      const localPath = `${CACHE_DIR}/${filename}`;
      const exists = await RNFS.exists(localPath);
      return exists ? localPath : null;
    } catch (error) {
      console.error('Get cached media failed:', error);
      return null;
    }
  }

  async deleteMedia(filename: string): Promise<void> {
    try {
      const localPath = `${CACHE_DIR}/${filename}`;
      const exists = await RNFS.exists(localPath);
      if (exists) {
        await RNFS.unlink(localPath);
      }
    } catch (error) {
      console.error('Delete media failed:', error);
    }
  }

  async clearCache(): Promise<void> {
    try {
      const exists = await RNFS.exists(CACHE_DIR);
      if (exists) {
        await RNFS.unlink(CACHE_DIR);
        await this.initialize();
      }
    } catch (error) {
      console.error('Clear cache failed:', error);
    }
  }

  async getCacheSize(): Promise<number> {
    try {
      const exists = await RNFS.exists(CACHE_DIR);
      if (!exists) return 0;

      const result = await RNFS.readDir(CACHE_DIR);
      let totalSize = 0;
      for (const file of result) {
        if (file.isFile()) {
          const stat = await RNFS.stat(file.path);
          totalSize += stat.size;
        }
      }
      return totalSize;
    } catch (error) {
      console.error('Get cache size failed:', error);
      return 0;
    }
  }

  async syncMediaList(mediaList: any[]): Promise<void> {
    try {
      console.log('=== MEDIA CACHE: syncMediaList called ===');
      console.log('Media list type:', Array.isArray(mediaList) ? 'array' : typeof mediaList);
      console.log('Media list length:', Array.isArray(mediaList) ? mediaList.length : 'N/A');

      if (!Array.isArray(mediaList)) {
        console.error('Media list is not an array, skipping sync');
        return;
      }

      await this.initialize();

      // Get current cached files
      const cachedFiles = await RNFS.readDir(CACHE_DIR);
      const cachedFilenames = new Set(
        cachedFiles.map((f) => f.name)
      );

      // Download new media
      for (const media of mediaList) {
        const filename = media.filename;
        if (!cachedFilenames.has(filename)) {
          await this.downloadMedia(media.url, filename);
        }
      }

      // Remove unused media
      const mediaFilenames = new Set(mediaList.map((m) => m.filename));
      for (const file of cachedFiles) {
        if (!mediaFilenames.has(file.name)) {
          await this.deleteMedia(file.name);
        }
      }
    } catch (error) {
      console.error('Sync media list failed:', error);
    }
  }
}

export default new MediaCacheService();
