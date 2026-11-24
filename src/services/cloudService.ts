import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAppMode } from './setupService';
import { DeviceInfo } from 'react-native-device-info';
import RNFS from 'react-native-fs';
import { DEFAULT_TEST_CLOUD_API_URL } from './cloudRuntimeConfig';

const CLOUD_MODE_KEY = '@signage_cloud_mode';
const CLOUD_API_URL_KEY = '@signage_cloud_api_url';
const DEVICE_ID_KEY = '@signage_device_id';
const AUTH_TOKEN_KEY = '@signage_auth_token';
const DEVICE_TOKEN_KEY = '@signage_device_token';
const DEVICE_TOKEN_EXPIRY_KEY = '@signage_device_token_expiry';
const CLOUD_CONFIG_VERSION_KEY = '@cloud_config_version';

interface CloudConfig {
  enabled: boolean;
  apiUrl: string;
  deviceId: string;
  authToken?: string;
}

interface HeartbeatData {
  deviceId: string;
  status: 'online' | 'offline';
  storage: {
    used: number;
    total: number;
  };
  appVersion: string;
  location?: string;
  configVersion?: number;
}

class CloudService {
  private config: CloudConfig | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private socket: any = null;

  async initialize(): Promise<void> {
    const [enabledFlag, savedApiUrl, savedDeviceId, appMode] = await Promise.all([
      AsyncStorage.getItem(CLOUD_MODE_KEY),
      AsyncStorage.getItem(CLOUD_API_URL_KEY),
      AsyncStorage.getItem(DEVICE_ID_KEY),
      getAppMode(),
    ]);
    const enabled = appMode === 'cloudMode' || (appMode == null && enabledFlag === 'true');
    const apiUrl = String(savedApiUrl || DEFAULT_TEST_CLOUD_API_URL).trim().replace(/\/+$/, '');
    const deviceId = savedDeviceId || (enabled ? await this.getOrCreateDeviceId() : null);
    const authToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);

    if (enabled && apiUrl && deviceId) {
      this.config = {
        enabled: true,
        apiUrl,
        deviceId,
        authToken: authToken || undefined,
      };
      if (appMode === 'cloudMode') {
        await AsyncStorage.multiSet([[CLOUD_MODE_KEY, 'true'], [CLOUD_API_URL_KEY, apiUrl]]);
      }
    } else {
      this.config = {
        enabled: false,
        apiUrl,
        deviceId: deviceId || await this.getOrCreateDeviceId(),
      };
    }
  }

  async ensureDeviceAuthToken(): Promise<string> {
    const cachedToken = await AsyncStorage.getItem(DEVICE_TOKEN_KEY);
    const cachedExpiry = Number(await AsyncStorage.getItem(DEVICE_TOKEN_EXPIRY_KEY) || 0);
    if (this.config) this.config.authToken = cachedToken || undefined;
    if (!this.config?.enabled || !this.config.apiUrl || !this.config.deviceId) return cachedToken || '';
    if (cachedToken && cachedExpiry > Date.now() + 60_000) return cachedToken;
    try {
      const response = await fetch(`${this.config.apiUrl}/api/devices/${this.config.deviceId}/activation?issueToken=true`);
      if (!response.ok) return cachedToken || '';
      const data = await response.json();
      if (!data?.activated || !data?.deviceToken) {
        await AsyncStorage.removeItem(DEVICE_TOKEN_KEY);
        await AsyncStorage.removeItem(DEVICE_TOKEN_EXPIRY_KEY);
        this.config.authToken = undefined;
        return '';
      }
      await AsyncStorage.setItem(DEVICE_TOKEN_KEY, data.deviceToken);
      const ttlSeconds = Math.max(60, Number(data.deviceTokenExpiresIn || 3600));
      await AsyncStorage.setItem(DEVICE_TOKEN_EXPIRY_KEY, String(Date.now() + ttlSeconds * 1000));
      this.config.authToken = data.deviceToken;
      return data.deviceToken;
    } catch {
      return cachedToken || '';
    }
  }

  async getOrCreateDeviceId(): Promise<string> {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = await DeviceInfo.getUniqueId();
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  }

  async setCloudMode(enabled: boolean, apiUrl: string): Promise<void> {
    const normalizedApiUrl = String(apiUrl || DEFAULT_TEST_CLOUD_API_URL).trim().replace(/\/+$/, '');
    this.config = {
      enabled,
      apiUrl: normalizedApiUrl,
      deviceId: this.config?.deviceId || await this.getOrCreateDeviceId(),
    };

    await AsyncStorage.setItem(CLOUD_MODE_KEY, enabled ? 'true' : 'false');
    await AsyncStorage.setItem(CLOUD_API_URL_KEY, normalizedApiUrl);

    if (enabled) {
      this.startHeartbeat();
    } else {
      this.stopHeartbeat();
    }
  }

  isEnabled(): boolean {
    return this.config?.enabled || false;
  }

  getApiUrl(): string {
    return this.config?.apiUrl || '';
  }

  getDeviceId(): string {
    return this.config?.deviceId || '';
  }

  getDeviceAuthTokenCached(): string {
    return this.config?.authToken || '';
  }

  async sendHeartbeat(): Promise<void> {
    if (!this.config?.enabled || !this.config.apiUrl) return;

    try {
      const deviceToken = await this.ensureDeviceAuthToken();
      if (!deviceToken) return;
      const storageInfo = await RNFS.getFSInfo();
      const appVersion = await DeviceInfo.getVersion();
      const deviceName = await DeviceInfo.getDeviceName();
      const [configVersionText, cachedConfig] = await Promise.all([
        AsyncStorage.getItem(CLOUD_CONFIG_VERSION_KEY),
        AsyncStorage.getItem('@cloud_device_config'),
      ]);
      const configVersion = cachedConfig ? Number(configVersionText || 0) : -1;

      const heartbeatData: HeartbeatData = {
        deviceId: this.config.deviceId,
        status: 'online',
        storage: {
          used: Math.max(0, storageInfo.totalSpace - storageInfo.freeSpace),
          total: storageInfo.totalSpace,
        },
        appVersion,
        configVersion,
      };

      const response = await fetch(`${this.config.apiUrl}/api/devices/${this.config.deviceId}/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deviceToken}`,
        },
        body: JSON.stringify({
          ...heartbeatData,
          deviceName: deviceName || 'TV Device',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Only newer config versions are returned by the backend.
        if (data.config) {
          if (await getAppMode() !== 'cloudMode') return;
          console.log('=== CLOUD SERVICE: Received config from heartbeat ===');
          // Do NOT store the config version here. The version is only acked
          // after the apply pipeline verifies the media cache and commits
          // (App.tsx config:update handler). Acking early would make the
          // backend stop resending the config if the apply fails or the app
          // restarts mid-download, leaving the TV stuck on an old config.
          await AsyncStorage.multiSet([
            ['@cloud_device_config', JSON.stringify(data.config)],
            ['@cloud_config_active', 'true'],
          ]);
          // Emit config update event
          const eventEmitter = require('../utils/EventEmitter').default;
          eventEmitter.emit('config:update', { config: data.config, configVersion: Number(data.configVersion || 0) });
        }

        // Emergency alert state is synced through heartbeat so a TV that missed
        // the socket push (offline, reconnecting, rebooted) still converges.
        if (Object.prototype.hasOwnProperty.call(data, 'emergencyAlert')) {
          const eventEmitter = require('../utils/EventEmitter').default;
          if (data.emergencyAlert && data.emergencyAlert.active) {
            eventEmitter.emit('emergency:alert', data.emergencyAlert);
          } else {
            eventEmitter.emit('emergency:alert:clear');
          }
        }
      } else if (response.status === 404) {
        // Device not registered - emit event to show activation screen
        console.log('=== CLOUD SERVICE: Device not registered in cloud ===');
        const eventEmitter = require('../utils/EventEmitter').default;
        eventEmitter.emit('device:not_registered');
      }
    } catch (error) {
      console.error('Heartbeat failed:', error);
    }
  }

  startHeartbeat(): void {
    this.stopHeartbeat();
    this.sendHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 60000); // A minute is enough for status and config-version sync.
  }

  async checkForUpdate(): Promise<{ hasUpdate: boolean; latestVersion: string; apkUrl: string } | null> {
    if (!this.config?.enabled || !this.config.apiUrl) return null;

    try {
      const response = await fetch(`${this.config.apiUrl}/api/config`);
      if (response.ok) {
        const data = await response.json();
        const currentVersion = await DeviceInfo.getVersion();
        const latestVersion = data.apkVersion;
        const apkUrl = data.apkUrl;

        console.log('=== APK Update Check ===');
        console.log('Current version:', currentVersion);
        console.log('Latest version:', latestVersion);
        console.log('Has update:', latestVersion !== currentVersion);

        if (latestVersion && latestVersion !== currentVersion) {
          return {
            hasUpdate: true,
            latestVersion,
            apkUrl: apkUrl || '',
          };
        }
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
    }

    return null;
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  async fetchConfig(): Promise<any> {
    if (!this.config?.enabled || !this.config.apiUrl) return null;

    try {
      const deviceToken = await this.ensureDeviceAuthToken();
      if (!deviceToken) return null;
      const response = await fetch(
        `${this.config.apiUrl}/api/devices/${this.config.deviceId}/cloud-config`,
        { headers: { Authorization: `Bearer ${deviceToken}` } }
      );
      if (!response.ok) return null;
      const data = await response.json();
      return data.config;
    } catch (error) {
      console.error('Fetch config failed:', error);
      return null;
    }
  }

  async reportPlaybackError(report: {
    section?: number;
    name?: string;
    mediaType?: string;
    message?: string;
  }): Promise<void> {
    if (!this.config?.enabled || !this.config.apiUrl || !this.config.deviceId) return;
    try {
      const deviceToken = await this.ensureDeviceAuthToken();
      if (!deviceToken) return;
      const response = await fetch(`${this.config.apiUrl}/api/devices/${encodeURIComponent(this.config.deviceId)}/health`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deviceToken}`,
        },
        body: JSON.stringify({
          kind: 'playback-error',
          section: Math.max(0, Math.min(3, Math.trunc(Number(report.section || 0)))),
          fileName: String(report.name || '').slice(0, 200),
          mediaType: String(report.mediaType || '').slice(0, 64),
          message: String(report.message || 'Media playback failed').slice(0, 500),
        }),
      });
      if (!response.ok) throw new Error(`health-report-http-${response.status}`);
    } catch (error) {
      console.warn('Cloud playback error report failed:', error);
    }
  }

  async downloadMedia(mediaUrl: string, localPath: string): Promise<boolean> {
    try {
      const deviceToken = await this.ensureDeviceAuthToken();
      if (!deviceToken) return false;
      const downloadResult = await RNFS.downloadFile({
        fromUrl: mediaUrl,
        toFile: localPath,
        headers: { Authorization: `Bearer ${deviceToken}` },
      });

      const result = await downloadResult.promise;
      return result.statusCode === 200;
    } catch (error) {
      console.error('Download media failed:', error);
      return false;
    }
  }

  async getMediaList(): Promise<any[] | null> {
    if (!this.config?.enabled || !this.config.apiUrl) return null;

    try {
      const deviceToken = await this.ensureDeviceAuthToken();
      if (!deviceToken) return null;
      const response = await fetch(`${this.config.apiUrl}/api/media/media-list?deviceId=${encodeURIComponent(this.config.deviceId)}`, {
        headers: { Authorization: `Bearer ${deviceToken}` },
      });
      if (!response.ok) return null;
      const data = await response.json();
      return Array.isArray(data) ? data : null;
    } catch (error) {
      console.error('Get media list failed:', error);
      return null;
    }
  }

  cleanup(): void {
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export default new CloudService();
