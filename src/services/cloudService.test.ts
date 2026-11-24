/**
 * Regression tests for the APK cloud pipeline (cloudService).
 *
 * Covers the critical sync contract with the cloud backend:
 *  - device auth token caching/refresh/clearing
 *  - heartbeat payload (configVersion ack semantics — version is only acked
 *    after the apply pipeline commits, never here)
 *  - config delivery via heartbeat + config:update event
 *  - emergency alert convergence via heartbeat
 *  - device:not_registered on 404
 *  - playback error reporting bounds
 */

// --- In-memory AsyncStorage mock -------------------------------------------
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => (mockStore.has(key) ? mockStore.get(key)! : null)),
    setItem: jest.fn(async (key: string, value: string) => { mockStore.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { mockStore.delete(key); }),
    multiSet: jest.fn(async (pairs: [string, string][]) => { pairs.forEach(([k, v]) => mockStore.set(k, v)); }),
  },
}));

jest.mock('react-native-device-info', () => ({
  DeviceInfo: {
    getUniqueId: jest.fn(async () => 'test-device-unique-id'),
    getVersion: jest.fn(async () => '1.2.3'),
    getDeviceName: jest.fn(async () => 'Test TV'),
  },
}));

jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    getFSInfo: jest.fn(async () => ({ totalSpace: 16000000000, freeSpace: 12000000000 })),
    downloadFile: jest.fn(() => ({ promise: Promise.resolve({ statusCode: 200 }) })),
  },
}));

let mockAppMode: string | null = null;
jest.mock('./setupService', () => ({
  getAppMode: jest.fn(async () => mockAppMode),
}));

const mockEmit = jest.fn();
jest.mock('../utils/EventEmitter', () => ({
  __esModule: true,
  default: { emit: (...args: any[]) => mockEmit(...args) },
}));

import cloudService from './cloudService';
import RNFS from 'react-native-fs';

(global as any).fetch = jest.fn();

const API = 'http://cloud.test:3000';
const DEVICE_ID = 'test-device-unique-id';

const jsonResponse = (body: any, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

// Enable cloud mode via stored keys + initialize() — NOT setCloudMode(),
// which starts the heartbeat interval and fires an immediate sendHeartbeat
// that would pollute fetch mock call history.
const enableCloud = async () => {
  mockStore.set('@signage_cloud_mode', 'true');
  mockStore.set('@signage_cloud_api_url', API);
  mockStore.set('@signage_device_id', DEVICE_ID);
  await cloudService.initialize();
};

beforeEach(async () => {
  mockStore.clear();
  mockEmit.mockClear();
  (global.fetch as jest.Mock).mockReset();
  mockAppMode = 'cloudMode';
  cloudService.cleanup();
  await cloudService.initialize();
});

describe('cloudService.initialize', () => {
  it('enables cloud mode from appMode and normalizes the API URL', async () => {
    mockStore.set('@signage_cloud_api_url', `${API}///`);
    mockStore.set('@signage_device_id', DEVICE_ID);
    await cloudService.initialize();
    expect(cloudService.isEnabled()).toBe(true);
    expect(cloudService.getApiUrl()).toBe(API);
    expect(cloudService.getDeviceId()).toBe(DEVICE_ID);
  });

  it('stays disabled when appMode is not cloudMode and flag is unset', async () => {
    mockAppMode = null;
    mockStore.clear();
    await cloudService.initialize();
    expect(cloudService.isEnabled()).toBe(false);
  });
});

describe('ensureDeviceAuthToken', () => {
  it('returns cached token while it is still valid', async () => {
    await enableCloud();
    mockStore.set('@signage_device_token', 'cached-token');
    mockStore.set('@signage_device_token_expiry', String(Date.now() + 3600_000));
    await expect(cloudService.ensureDeviceAuthToken()).resolves.toBe('cached-token');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches a fresh token when the cached one is expired', async () => {
    await enableCloud();
    mockStore.set('@signage_device_token_expiry', String(Date.now() - 1000));
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({
      activated: true,
      deviceToken: 'fresh-token',
      deviceTokenExpiresIn: 3600,
    }));
    await expect(cloudService.ensureDeviceAuthToken()).resolves.toBe('fresh-token');
    expect(mockStore.get('@signage_device_token')).toBe('fresh-token');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      `${API}/api/devices/${DEVICE_ID}/activation?issueToken=true`
    );
  });

  it('clears stored token when the device is deactivated', async () => {
    await enableCloud();
    mockStore.set('@signage_device_token', 'stale-token');
    mockStore.set('@signage_device_token_expiry', String(Date.now() - 1000));
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ activated: false }));
    await expect(cloudService.ensureDeviceAuthToken()).resolves.toBe('');
    expect(mockStore.has('@signage_device_token')).toBe(false);
  });

  it('returns empty string when cloud is disabled', async () => {
    mockAppMode = null;
    mockStore.clear();
    await cloudService.initialize();
    await expect(cloudService.ensureDeviceAuthToken()).resolves.toBe('');
  });
});

describe('sendHeartbeat', () => {
  const primeToken = async () => {
    await enableCloud();
    mockStore.set('@signage_device_token', 'device-token');
    mockStore.set('@signage_device_token_expiry', String(Date.now() + 3600_000));
  };

  it('is a no-op when cloud is disabled', async () => {
    mockAppMode = null;
    mockStore.clear();
    await cloudService.initialize();
    await cloudService.sendHeartbeat();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sends configVersion -1 when no config is cached (forces full config)', async () => {
    await primeToken();
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ success: true, configVersion: 3 }));
    await cloudService.sendHeartbeat();
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.configVersion).toBe(-1);
    expect(body.status).toBe('online');
    expect(body.appVersion).toBe('1.2.3');
    expect(options.headers.Authorization).toBe('Bearer device-token');
  });

  it('sends the persisted configVersion when a config is cached', async () => {
    await primeToken();
    mockStore.set('@cloud_device_config', JSON.stringify({ layout: 'grid' }));
    mockStore.set('@cloud_config_version', '7');
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ success: true, configVersion: 7 }));
    await cloudService.sendHeartbeat();
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body).configVersion).toBe(7);
  });

  it('stores config and emits config:update WITHOUT acking the version', async () => {
    await primeToken();
    const config = { layout: 'grid2', sections: [] };
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({
      success: true,
      configVersion: 9,
      config,
    }));
    await cloudService.sendHeartbeat();
    expect(mockStore.get('@cloud_device_config')).toBe(JSON.stringify(config));
    expect(mockStore.get('@cloud_config_active')).toBe('true');
    // Regression: version must NOT be persisted here — the apply pipeline acks
    // it only after media cache verification + commit (App.tsx handler).
    expect(mockStore.has('@cloud_config_version')).toBe(false);
    expect(mockEmit).toHaveBeenCalledWith('config:update', { config, configVersion: 9 });
  });

  it('does not store config when cloud mode is off', async () => {
    await primeToken();
    mockAppMode = null;
    mockStore.delete('@signage_cloud_mode');
    await cloudService.initialize();
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({
      success: true, configVersion: 2, config: { layout: 'x' },
    }));
    await cloudService.sendHeartbeat();
    expect(mockStore.has('@cloud_device_config')).toBe(false);
    expect(mockEmit).not.toHaveBeenCalledWith('config:update', expect.anything());
  });

  it('emits emergency:alert when heartbeat carries an active alert', async () => {
    await primeToken();
    const alert = { active: true, mediaUrl: 'http://x/a.mp4', message: 'Alert' };
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({
      success: true, configVersion: 1, emergencyAlert: alert,
    }));
    await cloudService.sendHeartbeat();
    expect(mockEmit).toHaveBeenCalledWith('emergency:alert', alert);
  });

  it('emits emergency:alert:clear when heartbeat carries no active alert', async () => {
    await primeToken();
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({
      success: true, configVersion: 1, emergencyAlert: null,
    }));
    await cloudService.sendHeartbeat();
    expect(mockEmit).toHaveBeenCalledWith('emergency:alert:clear');
  });

  it('emits device:not_registered on 404', async () => {
    await primeToken();
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ error: 'Device not registered' }, 404));
    await cloudService.sendHeartbeat();
    expect(mockEmit).toHaveBeenCalledWith('device:not_registered');
  });
});

describe('fetchConfig / getMediaList / reportPlaybackError / downloadMedia', () => {
  const primeToken = async () => {
    await enableCloud();
    mockStore.set('@signage_device_token', 'device-token');
    mockStore.set('@signage_device_token_expiry', String(Date.now() + 3600_000));
  };

  it('fetchConfig returns config on success and null on failure', async () => {
    await primeToken();
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ config: { layout: 'grid' } }));
    await expect(cloudService.fetchConfig()).resolves.toEqual({ layout: 'grid' });
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(cloudService.fetchConfig()).resolves.toBeNull();
  });

  it('getMediaList returns array or null', async () => {
    await primeToken();
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse([{ id: 'm1' }]));
    await expect(cloudService.getMediaList()).resolves.toEqual([{ id: 'm1' }]);
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ error: 'x' }, 403));
    await expect(cloudService.getMediaList()).resolves.toBeNull();
  });

  it('reportPlaybackError clamps section and truncates fields', async () => {
    await primeToken();
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ success: true }));
    await cloudService.reportPlaybackError({ section: 99, name: 'n'.repeat(300), message: 'm'.repeat(600) });
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.kind).toBe('playback-error');
    expect(body.section).toBe(3);
    expect(body.fileName).toHaveLength(200);
    expect(body.message).toHaveLength(500);
    expect(options.headers.Authorization).toBe('Bearer device-token');
  });

  it('downloadMedia returns true on HTTP 200 and false otherwise', async () => {
    await primeToken();
    await expect(cloudService.downloadMedia('http://x/v.mp4', '/tmp/v.mp4')).resolves.toBe(true);
    expect(RNFS.downloadFile).toHaveBeenCalledWith(expect.objectContaining({
      fromUrl: 'http://x/v.mp4',
      toFile: '/tmp/v.mp4',
      headers: { Authorization: 'Bearer device-token' },
    }));
    (RNFS.downloadFile as jest.Mock).mockReturnValueOnce({ promise: Promise.resolve({ statusCode: 404 }) });
    await expect(cloudService.downloadMedia('http://x/v.mp4', '/tmp/v.mp4')).resolves.toBe(false);
  });
});
