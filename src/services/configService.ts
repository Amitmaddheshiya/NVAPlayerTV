import { readConfig, writeConfig } from "../utils/fileSystem";
import { getServer } from "./serverService";
import { NativeModules } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setCloudConfigMediaUrls, setPlaybackOverride } from "./mediaService";
import cloudService from "./cloudService";
import { getAppMode } from "./setupService";
import { addCloudDeviceAccess } from "./cloudMediaUrl";

const { DeviceIdModule } = NativeModules;
const CONFIG_FETCH_TIMEOUT_MS = 6000;

export type CloudConfigSyncReport = {
  configVersion: number;
  status: "pending" | "ready" | "failed";
  mediaTotal: number;
  mediaCached: number;
  requiredStorageBytes?: number;
  availableStorageBytes?: number;
  storageReserveBytes?: number;
  message?: string;
};

export async function reportCloudConfigSync(report: CloudConfigSyncReport): Promise<boolean> {
  try {
    await cloudService.initialize();
    const apiUrl = cloudService.getApiUrl();
    const deviceId = cloudService.getDeviceId();
    const token = await cloudService.ensureDeviceAuthToken();
    if (!apiUrl || !deviceId || !token) return false;
    const response = await fetch(`${apiUrl}/api/devices/${deviceId}/sync-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(report),
    });
    return response.ok;
  } catch (error) {
    console.warn("Cloud config sync status report failed", error);
    return false;
  }
}

function fetchWithTimeout(url: string, timeoutMs = CONFIG_FETCH_TIMEOUT_MS): Promise<Response> {
  return Promise.race([
    fetch(url, {
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    }),
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error("config-fetch-timeout")), timeoutMs)
    ),
  ]);
}

export async function loadConfig(setConfig: Function) {
  let lastError: any = null;
  let localCached: any = null;

  // Check if cloud config is active - if so, skip embedded CMS config loading
  try {
    const appMode = await getAppMode();
    if (appMode === "cloudMode") {
      console.log('Cloud config is active, skipping embedded CMS config load');
      // Load cloud config from AsyncStorage instead
      const cloudConfigStr = await AsyncStorage.getItem('@cloud_applied_config')
        || await AsyncStorage.getItem('@cloud_device_config');
      if (cloudConfigStr) {
        const storedConfig = JSON.parse(cloudConfigStr);
        if (storedConfig && typeof storedConfig === "object") {
          const savedMediaUrls = Array.isArray(storedConfig.sections)
            ? storedConfig.sections.flatMap((section: any) =>
                section?.contentType === "multimedia" && Array.isArray(section.mediaUrls) ? section.mediaUrls : []
              )
            : Array.isArray(storedConfig.mediaUrls) ? storedConfig.mediaUrls : [];
          setCloudConfigMediaUrls(savedMediaUrls);
          const deviceId = cloudService.getDeviceId();
          const withDeviceAccess = (value: string) => addCloudDeviceAccess(value, deviceId);
          const cloudConfig = {
            ...storedConfig,
            clock: storedConfig.widgets?.clock ?? storedConfig.clock,
            weather: storedConfig.widgets?.weather ?? storedConfig.weather,
            sections: Array.isArray(storedConfig.sections)
              ? storedConfig.sections.map((section: any) => ({
                  ...section,
                  mediaUrls: Array.isArray(section?.mediaUrls)
                    ? section.mediaUrls.map(withDeviceAccess)
                    : section?.mediaUrls,
                  mediaItems: Array.isArray(section?.mediaUrls)
                    ? section.mediaUrls.map((url: string) => {
                        const metadata = Array.isArray(section?.mediaItems)
                          ? section.mediaItems.find((item: any) => String(item?.url || '').split('?')[0] === String(url || '').split('?')[0])
                          : null;
                        return {
                          ...metadata,
                          url,
                          streamUrl: undefined,
                        };
                      })
                    : section?.mediaItems,
                }))
              : storedConfig.sections,
          };
          setConfig(cloudConfig);

          // Set playback override from cloud config sections (same logic as App.tsx)
          if (cloudConfig.sections && Array.isArray(cloudConfig.sections)) {
            console.log('Restoring Cloud playback override; section count:', cloudConfig.sections.length);
            const mediaItems: any[] = [];
            cloudConfig.sections.forEach((section: any, index: number) => {
              if (section.contentType === 'multimedia' && section.mediaUrls) {
                section.mediaUrls.forEach((url: string, urlIndex: number) => {
                  const metadata = Array.isArray(section.mediaItems)
                    ? section.mediaItems.find((item: any) => String(item?.url || '').split('?')[0] === String(url).split('?')[0])
                    : null;
                  mediaItems.push({
                    ...metadata,
                    url,
                    streamUrl: undefined,
                    remoteUrl: withDeviceAccess(url),
                    name: metadata?.name || url.split('/').pop() || `media_${urlIndex}`,
                    originalName: metadata?.originalName || url.split('/').pop() || `media_${urlIndex}`,
                    type: metadata?.type || (url.match(/\.(mp4|m4v|mov|mkv|webm|avi|3gp|mpg|mpeg)(\?|$)/i) ? 'video/mp4' : 'image/jpeg'),
                    size: Number(metadata?.size || 0),
                    section: index + 1, // Preserve actual section number
                  });
                });
              }
            });
            if (mediaItems.length > 0) {
              console.log('Setting Cloud playback override; media count:', mediaItems.length);
              setPlaybackOverride('cloud-config', mediaItems);
            } else {
              console.log('No media URLs found in saved Cloud config sections');
              setPlaybackOverride('cloud-config', []);
            }
          } else {
            console.log('Cloud config has no sections');
          }

          return cloudConfig;
        }
      }
      return null;
    }
  } catch (err) {
    console.log('Error checking cloud config flag:', err);
  }

  try {
    localCached = await readConfig();
    if (localCached && typeof localCached === "object") {
      setConfig(localCached);
    }
  } catch (cacheErr) {
    console.log("Initial cached config load failed", cacheErr);
  }

  try {
    const server = getServer();
    if (!server) throw new Error("server-not-ready");

    const deviceId = await DeviceIdModule.getDeviceId();

    const res = await fetchWithTimeout(
      `${server}/config?deviceId=${deviceId}&ts=${Date.now()}`
    );
    if (!res.ok) throw new Error(`config-http-${res.status}`);

    const config = await res.json();
    if (!config || typeof config !== "object") {
      throw new Error("config-invalid-payload");
    }

    await writeConfig(config);
    setConfig(config);
    return config;
  } catch (e) {
    lastError = e;
    console.log("Server config failed", e);
  }

  if (localCached && typeof localCached === "object") {
    return localCached;
  }

  try {
    const cached = await readConfig();
    if (cached && typeof cached === "object") {
      setConfig(cached);
      return cached;
    }
  } catch (cacheErr) {
    console.log("Cached config load failed", cacheErr);
  }

  if (lastError) {
    console.log("Config unavailable from both server and local cache");
  }
  return null;
}

