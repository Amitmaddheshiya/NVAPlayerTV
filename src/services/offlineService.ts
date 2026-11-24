import { AppState, AppStateStatus } from 'react-native';
import cloudService from './cloudService';
import mediaCacheService from './mediaCacheService';

class OfflineService {
  private isOnline: boolean = true;
  private appState: AppStateStatus = 'active';
  private syncInterval: NodeJS.Timeout | null = null;
  private appStateSubscription: any = null;

  initialize(): void {
    this.isOnline = true;
    this.appState = AppState.currentState;

    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
    this.startPeriodicSync();
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    this.appState = nextAppState;

    if (nextAppState === 'active') {
      // App came to foreground, check connectivity
      this.checkConnectivity();
    }
  };

  private checkConnectivity(): void {
    const apiUrl = cloudService.getApiUrl();
    if (!apiUrl) {
      this.isOnline = false;
      return;
    }
    fetch(`${apiUrl}/health`, { method: 'GET', cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`cloud-health-${response.status}`);
        this.isOnline = true;
        console.log('Cloud service is reachable');
      })
      .catch(() => {
        this.isOnline = false;
        console.log('Cloud service is unreachable');
      });
  }

  startPeriodicSync(): void {
    this.stopPeriodicSync();
    this.syncInterval = setInterval(() => {
      if (this.appState === 'active' && cloudService.isEnabled()) {
        this.checkConnectivity();
        // NOTE: do NOT call syncMedia() here. It downloaded the entire device
        // library into cloud_media/ every 60s, duplicating storage and
        // bandwidth alongside the generation-based mediaService pipeline.
      }
    }, 60000); // Check every minute
  }

  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async syncMedia(): Promise<void> {
    if (!this.isOnline || !cloudService.isEnabled()) return;

    try {
      const mediaList = await cloudService.getMediaList();
      if (!Array.isArray(mediaList)) return;
      await mediaCacheService.syncMediaList(mediaList);
      console.log('Media sync completed');
    } catch (error) {
      console.error('Media sync failed:', error);
    }
  }

  async getMediaUrl(filename: string): Promise<string | null> {
    // First try to get from cache
    const cachedPath = await mediaCacheService.getCachedMedia(filename);
    if (cachedPath) {
      return cachedPath;
    }

    // If online, try to download
    if (this.isOnline && cloudService.isEnabled()) {
      try {
        const mediaList = await cloudService.getMediaList();
        if (!Array.isArray(mediaList)) return null;
        const media = mediaList.find((m: any) => m.filename === filename);
        if (media) {
          const downloadedPath = await mediaCacheService.downloadMedia(
            media.url,
            filename
          );
          return downloadedPath;
        }
      } catch (error) {
        console.error('Failed to download media:', error);
      }
    }

    // Return null if not available
    return null;
  }

  isDeviceOnline(): boolean {
    return this.isOnline;
  }

  async getFallbackContent(): Promise<any> {
    // Return cached config or default fallback
    try {
      const config = await cloudService.fetchConfig();
      if (config) {
        return config;
      }
    } catch (error) {
      console.error('Failed to fetch fallback config:', error);
    }

    // Return default fallback
    return {
      layout: 'fullscreen',
      sections: [],
      ticker: { text: 'Offline Mode', position: 'bottom', color: '#ffffff', speed: 6 },
      fallback: {
        mode: 'message',
        message: 'Device is offline. Please check your internet connection.',
      },
    };
  }

  cleanup(): void {
    this.stopPeriodicSync();
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }
}

export default new OfflineService();
