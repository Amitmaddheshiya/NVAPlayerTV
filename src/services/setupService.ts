import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules } from "react-native";

export type AppMode = "tvMode" | "cloudMode" | "adminOnlyMode";

const APP_MODE_KEY = "@app_mode";
const SETUP_COMPLETE_KEY = "@app_setup_completed";
const ADMIN_CMS_URL_KEY = "@admin_cms_url";
const { DeviceIdModule } = NativeModules as any;

function isAppMode(value: unknown): value is AppMode {
  return value === "tvMode" || value === "cloudMode" || value === "adminOnlyMode";
}

export async function getAppMode(): Promise<AppMode | null> {
  // Prioritize AsyncStorage for mode changes from UI
  const [completed, mode] = await Promise.all([
    AsyncStorage.getItem(SETUP_COMPLETE_KEY),
    AsyncStorage.getItem(APP_MODE_KEY),
  ]);

  if (completed === "true" && isAppMode(mode)) {
    // Sync to native module to keep it in sync
    try {
      DeviceIdModule?.setAppMode?.(mode);
    } catch {
      // Ignore native module errors
    }
    return mode;
  }

  // Fallback to native module if AsyncStorage is empty
  try {
    const nativeMode = DeviceIdModule?.getAppMode?.();
    if (isAppMode(nativeMode)) {
      await AsyncStorage.multiSet([
        [APP_MODE_KEY, nativeMode],
        [SETUP_COMPLETE_KEY, "true"],
      ]);
      return nativeMode;
    }
  } catch {
    // Fall back on error
  }

  return null;
}

export async function saveAppMode(mode: AppMode): Promise<void> {
  try {
    DeviceIdModule?.setAppMode?.(mode);
  } catch {
    // AsyncStorage remains a compatible fallback on older APKs.
  }
  await AsyncStorage.multiSet([
    [APP_MODE_KEY, mode],
    [SETUP_COMPLETE_KEY, "true"],
    // This is retained for older callers, but it must agree with the
    // authoritative app-mode value so a previous Cloud selection cannot
    // influence a later LAN or Admin-only session.
    ["@signage_cloud_mode", mode === "cloudMode" ? "true" : "false"],
  ]);
}

export async function resetAppMode(): Promise<void> {
  try {
    await DeviceIdModule?.clearAppMode?.();
  } catch {
    // Clear AsyncStorage even when an older native module lacks this method.
  }
  await Promise.all([
    AsyncStorage.multiRemove([APP_MODE_KEY, SETUP_COMPLETE_KEY]),
    AsyncStorage.setItem("@signage_cloud_mode", "false"),
  ]);
}

export async function getAdminCmsUrl(): Promise<string> {
  return (await AsyncStorage.getItem(ADMIN_CMS_URL_KEY)) || "";
}

export async function saveAdminCmsUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(ADMIN_CMS_URL_KEY, url);
}
