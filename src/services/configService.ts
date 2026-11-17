import { readConfig, writeConfig } from "../utils/fileSystem";
import { getServer } from "./serverService";
import { NativeModules } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setPlaybackOverride } from "./mediaService";
import cloudService from "./cloudService";
import { getAppMode } from "./setupService";

const { DeviceIdModule } = NativeModules;
const CONFIG_FETCH_TIMEOUT_MS = 6000;

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
      const cloudConfigStr = await AsyncStorage.getItem('@cloud_device_config');
      if (cloudConfigStr) {
        const storedConfig = JSON.parse(cloudConfigStr);
        if (storedConfig && typeof storedConfig === "object") {
          const deviceId = cloudService.getDeviceId();
          const withDeviceAccess = (value: string) => {
            const url = String(value || '');
            if (!deviceId || !url.includes('/api/media/file/')) return url;
            const [base, query = ''] = url.split('?');
            const params = new URLSearchParams(query);
            params.set('deviceId', deviceId);
            return `${base}?${params.toString()}`;
          };
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
                }))
              : storedConfig.sections,
          };
          setConfig(cloudConfig);

          // Set playback override from cloud config sections (same logic as App.tsx)
          console.log('=== CONFIG SERVICE: Checking cloud config for playback override ===');
          console.log('Cloud config sections:', cloudConfig.sections);
          console.log('Sections is array:', Array.isArray(cloudConfig.sections));
          if (cloudConfig.sections && Array.isArray(cloudConfig.sections)) {
            console.log('=== CONFIG SERVICE: Setting playback override from saved cloud config ===');
            console.log('Sections count:', cloudConfig.sections.length);
            const mediaItems: any[] = [];
            cloudConfig.sections.forEach((section: any, index: number) => {
              console.log(`Section ${index + 1}:`, JSON.stringify(section));
              if (section.contentType === 'multimedia' && section.mediaUrls) {
                console.log(`Adding ${section.mediaUrls.length} media URLs from section ${index + 1}`);
                section.mediaUrls.forEach((url: string, urlIndex: number) => {
                  const metadata = Array.isArray(section.mediaItems)
                    ? section.mediaItems.find((item: any) => String(item?.url || '').split('?')[0] === String(url).split('?')[0])
                    : null;
                  mediaItems.push({
                    ...metadata,
                    url,
                    remoteUrl: url,
                    name: metadata?.name || url.split('/').pop() || `media_${urlIndex}`,
                    originalName: metadata?.originalName || url.split('/').pop() || `media_${urlIndex}`,
                    type: metadata?.type || (url.match(/\.(mp4|m4v|mov|mkv|webm|avi|3gp|mpg|mpeg)(\?|$)/i) ? 'video/mp4' : 'image/jpeg'),
                    size: Number(metadata?.size || 0),
                    section: index + 1, // Preserve actual section number
                  });
                });
              }
            });
            console.log('Total media items found:', mediaItems.length);
            if (mediaItems.length > 0) {
              console.log('Setting playback override from saved config with media items:', mediaItems.length);
              setPlaybackOverride('cloud-config', mediaItems);
            } else {
              console.log('No media URLs found in saved cloud config sections');
              setPlaybackOverride('cloud-config', []);
            }
          } else {
            console.log('Cloud config has no sections or sections is not an array');
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

