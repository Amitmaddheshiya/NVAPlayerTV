import RNFS from "react-native-fs";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules } from "react-native";
import { getServer } from "./serverService";
import cloudService from "./cloudService";

const { DeviceIdModule } = NativeModules as any;

type MediaCacheMode = "lan" | "cloud";
export const CLOUD_ACTIVE_CACHE_GENERATION_KEY = "@cloud_active_cache_generation";
const MEDIA_ROOT_DIR = `${RNFS.DocumentDirectoryPath}/media`;
const CACHE_PATHS: Record<MediaCacheMode, { dir: string; files: string; manifest: string; list: string }> = {
  lan: {
    dir: MEDIA_ROOT_DIR,
    files: `${MEDIA_ROOT_DIR}/files`,
    manifest: `${MEDIA_ROOT_DIR}/manifest.json`,
    list: `${MEDIA_ROOT_DIR}/list-cache.json`,
  },
  cloud: {
    dir: `${MEDIA_ROOT_DIR}/cloud`,
    files: `${MEDIA_ROOT_DIR}/cloud/files`,
    manifest: `${MEDIA_ROOT_DIR}/cloud/manifest.json`,
    list: `${MEDIA_ROOT_DIR}/cloud/list-cache.json`,
  },
};
let activeMediaCacheMode: MediaCacheMode = "lan";
let activeCloudCacheGeneration = "legacy";
let MEDIA_DIR = CACHE_PATHS.lan.dir;
let MEDIA_ROOT = CACHE_PATHS.lan.files;
let MANIFEST_PATH = CACHE_PATHS.lan.manifest;
let LIST_CACHE_PATH = CACHE_PATHS.lan.list;
const MEDIA_FETCH_TIMEOUT_MS = 8000;
const MEDIA_FETCH_BACKOFF_BASE_MS = 1500;
const MEDIA_FETCH_BACKOFF_MAX_MS = 30000;
const DOWNLOAD_CONCURRENCY = 6;
const LARGE_MEDIA_BYTES = 300 * 1024 * 1024;
const LARGE_MEDIA_CONCURRENCY = 2;
const LARGE_VIDEO_CACHE_DEFER_MS = 0;
const LIST_REFRESH_MIN_INTERVAL_MS = 3000;
const SMALL_FILE_AWAIT_BYTES = 5 * 1024 * 1024;
const DOWNLOAD_MAX_RETRIES = 5;
const DOWNLOAD_RETRY_DELAY_MS = 1500;
const DOWNLOAD_CONNECTION_TIMEOUT_MS = 30000;
const DOWNLOAD_READ_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_MIN_FREE_BYTES = 500 * 1024 * 1024;
const VIDEO_FILE_RE = /\.(mp4|m4v|mov|mkv|webm)(\?.*)?$/i;
const CLOUD_VIDEO_FILE_RE = /\.(mp4|m4v|mov|mkv|webm|avi|3gp|mpg|mpeg)(\?.*)?$/i;
const VIDEO_DOWNLOAD_CONCURRENCY = 2;
const CACHE_SUMMARY_TTL_MS = 3000;
const LOW_STORAGE_HARD_LIMIT_BYTES = 1200 * 1024 * 1024;
const LOW_STORAGE_SOFT_LIMIT_BYTES = 2200 * 1024 * 1024;
const LOW_STORAGE_SMALL_FILE_BYTES = 10 * 1024 * 1024;
const LOW_STORAGE_MEDIUM_FILE_BYTES = 24 * 1024 * 1024;
const LOW_STORAGE_VIDEO_FILE_BYTES = 40 * 1024 * 1024;
const LOW_STORAGE_ROOM_TOTAL_BYTES = 5 * 1024 * 1024 * 1024;

function getAdaptiveDownloadConcurrency(): number {
  try {
    const stats = DeviceIdModule?.getStorageStats?.();
    const freeBytes = Number(stats?.freeBytes || 0);
    if (!freeBytes || Number.isNaN(freeBytes)) return DOWNLOAD_CONCURRENCY;
    if (freeBytes < 1 * 1024 * 1024 * 1024) return Math.min(3, DOWNLOAD_CONCURRENCY);
    if (freeBytes < 3 * 1024 * 1024 * 1024) return Math.min(4, DOWNLOAD_CONCURRENCY);
    if (freeBytes < 8 * 1024 * 1024 * 1024) return Math.min(6, DOWNLOAD_CONCURRENCY);
    return DOWNLOAD_CONCURRENCY;
  } catch {
    return DOWNLOAD_CONCURRENCY;
  }
}

type CacheProgress = {
  received: number;
  total: number;
  percent: number;
  updatedAt: number;
};

const progressMap: Record<string, CacheProgress> = {};
const progressListeners = new Set<(path: string, progress: CacheProgress) => void>();
let downloadConcurrencyOverride: number | null = null;

export function subscribeCacheProgress(
  handler: (path: string, progress: CacheProgress) => void
) {
  progressListeners.add(handler);
  return () => progressListeners.delete(handler);
}

export function setDownloadConcurrencyOverride(value: number | null) {
  if (value === null || value === undefined) {
    downloadConcurrencyOverride = null;
    return;
  }
  const safeValue = Number(value);
  downloadConcurrencyOverride = Number.isFinite(safeValue) ? Math.max(1, safeValue) : null;
}

export function getCacheProgress(path: string): CacheProgress | null {
  return progressMap[path] || null;
}

function emitProgress(path: string, progress: CacheProgress) {
  progressMap[path] = progress;
  for (const listener of progressListeners) {
    try {
      listener(path, progress);
    } catch {
      // ignore
    }
  }
}

function invalidateCacheSummary() {
  cacheSummaryCache.at = 0;
}

function clearProgressForMissingPaths(activeUrls: Set<string>) {
  for (const key of Object.keys(progressMap)) {
    if (!activeUrls.has(key)) {
      delete progressMap[key];
    }
  }
}

function markCachedProgress(path: string, totalBytes = 0) {
  emitProgress(path, {
    total: Math.max(0, Number(totalBytes || 0)),
    received: Math.max(0, Number(totalBytes || 0)),
    percent: 100,
    updatedAt: Date.now(),
  });
}
// Short grace period avoids deleting files that might still be in active playback pipeline.
const CACHE_RETENTION_MS = 2 * 60 * 1000;

export type MediaItem = {
  name?: string;
  originalName?: string;
  section?: number;
  url?: string;
  type?: string;
  page?: number;
  pageCount?: number;
  size?: number;
  mtimeMs?: number;
  hash?: string;
  remoteUrl?: string;
  localPath?: string;
};

type PlaybackOverride = {
  sourceId: string;
  items: MediaItem[];
  activatedAt: number;
};

type ManifestEntry = {
  url: string;
  localPath: string;
  size: number;
  mtimeMs: number;
  hash?: string;
  lastSeenAt?: number;
};

type ManifestMap = Record<string, ManifestEntry>;

type ListCacheState = {
  list: MediaItem[];
  at: number;
  inFlight: Promise<MediaItem[]> | null;
  etag: string;
  backoffFailCount: number;
  backoffUntilMs: number;
  lastBackoffLogAtMs: number;
};
const listCacheStates: Record<MediaCacheMode, ListCacheState> = {
  lan: { list: [], at: 0, inFlight: null, etag: "", backoffFailCount: 0, backoffUntilMs: 0, lastBackoffLogAtMs: 0 },
  cloud: { list: [], at: 0, inFlight: null, etag: "", backoffFailCount: 0, backoffUntilMs: 0, lastBackoffLogAtMs: 0 },
};
const inFlightDownloads = new Map<string, Promise<string | null>>();
const activePlaybackUrls = new Map<string, string>();
const manifestBaselines = new WeakMap<ManifestMap, ManifestMap>();
const manifestFilePaths = new WeakMap<ManifestMap, string>();
let manifestWriteQueue: Promise<void> = Promise.resolve();
let prioritySection = 0;
let nonPriorityThrottleMs = 0;
const lastMediaLogAtBySection: Record<number, number> = {};
const lastMediaLogKeyBySection: Record<number, string> = {};
let cacheSummaryCache = { at: 0, total: 0, cached: 0, percent: 0 };
let playbackOverride: PlaybackOverride | null = null;
let pinnedCloudConfigUrls = new Set<string>();

function normalizeGeneration(value?: string | number | null): string {
  const generation = String(value || "legacy").trim();
  return /^[a-zA-Z0-9_-]{1,100}$/.test(generation) ? generation : "legacy";
}

function getCachePaths(mode: MediaCacheMode, generation?: string) {
  if (mode !== "cloud") return CACHE_PATHS.lan;
  const selected = normalizeGeneration(generation ?? activeCloudCacheGeneration);
  if (selected === "legacy") return CACHE_PATHS.cloud;
  const dir = `${CACHE_PATHS.cloud.dir}/generations/${selected}`;
  return { dir, files: `${dir}/files`, manifest: `${dir}/manifest.json`, list: `${dir}/list-cache.json` };
}

/** Select the committed Cloud cache generation. Staging downloads never change this pointer. */
export async function setCloudCacheGeneration(generation?: string | number | null): Promise<void> {
  activeCloudCacheGeneration = normalizeGeneration(generation);
  if (activeMediaCacheMode === "cloud") applyMediaCacheMode("cloud");
  await ensureMediaDirs("cloud");
}

/** Keep the active generation and one rollback generation; remove older staged/orphan generations. */
export async function pruneCloudCacheGenerations(keep: Array<string | number | null | undefined> = []): Promise<void> {
  try {
    const root = `${CACHE_PATHS.cloud.dir}/generations`;
    const preserve = new Set([activeCloudCacheGeneration, ...keep.map(normalizeGeneration)]);
    if (await RNFS.exists(root)) {
      const entries = await RNFS.readDir(root);
      for (const entry of entries) {
        if (!entry.isDirectory() || preserve.has(entry.name)) continue;
        await RNFS.unlink(entry.path);
      }
    }
    if (activeCloudCacheGeneration !== "legacy" && !preserve.has("legacy")) {
      for (const legacyPath of [CACHE_PATHS.cloud.files, CACHE_PATHS.cloud.manifest, CACHE_PATHS.cloud.list]) {
        if (await RNFS.exists(legacyPath)) await RNFS.unlink(legacyPath);
      }
    }
  } catch (error) {
    console.warn("Cloud cache generation cleanup deferred", error);
  }
}

function normalizeCacheUrl(value: string): string {
  return String(value || "").trim().split(/[?#]/, 1)[0];
}

/** Keep every asset in the saved Cloud config while it is the offline source of truth. */
export function setCloudConfigMediaUrls(urls: string[]): void {
  pinnedCloudConfigUrls = new Set((Array.isArray(urls) ? urls : []).map(normalizeCacheUrl).filter(Boolean));
}

function getListCacheState(mode: MediaCacheMode = activeMediaCacheMode): ListCacheState {
  return listCacheStates[mode];
}

function applyMediaCacheMode(mode: MediaCacheMode) {
  activeMediaCacheMode = mode;
  const paths = getCachePaths(mode);
  MEDIA_DIR = paths.dir;
  MEDIA_ROOT = paths.files;
  MANIFEST_PATH = paths.manifest;
  LIST_CACHE_PATH = paths.list;
  for (const key of Object.keys(progressMap)) delete progressMap[key];
  invalidateCacheSummary();
}

export async function setMediaCacheMode(mode: MediaCacheMode): Promise<void> {
  if (mode === "cloud") {
    try {
      activeCloudCacheGeneration = normalizeGeneration(await AsyncStorage.getItem(CLOUD_ACTIVE_CACHE_GENERATION_KEY));
    } catch {
      activeCloudCacheGeneration = "legacy";
    }
  }
  applyMediaCacheMode(mode);
  if (mode === "cloud") {
    await cloudService.initialize();
    await ensureMediaDirs("cloud");
    await migrateLegacyCloudCache();
    return;
  }

  // LAN startup must not depend on Cloud credentials or Cloud cache files.
  // The legacy Cloud migration runs when Cloud mode is selected, after its
  // directory has been created.
  await ensureMediaDirs("lan");
}

/** Register the Cloud media item currently being rendered so low-space cache
 * maintenance never unlinks a file underneath an active native player. */
export function setActiveCloudPlaybackMedia(owner: string, mediaUrl?: string): void {
  const safeOwner = String(owner || "").trim();
  if (!safeOwner) return;
  const safeUrl = String(mediaUrl || "").trim();
  if (safeUrl) activePlaybackUrls.set(safeOwner, safeUrl);
  else activePlaybackUrls.delete(safeOwner);
}

export function getActiveMediaCachePaths() {
  return { directory: MEDIA_DIR, files: MEDIA_ROOT, manifest: MANIFEST_PATH, list: LIST_CACHE_PATH };
}

export async function clearMediaCache(mode: MediaCacheMode = activeMediaCacheMode): Promise<void> {
  const pendingDownloads = Array.from(inFlightDownloads.entries())
    .filter(([key]) => key.startsWith(`${mode}|`))
    .map(([, task]) => task);
  await Promise.allSettled(pendingDownloads);
  await manifestWriteQueue;

  const paths = getCachePaths(mode);
  if (await RNFS.exists(paths.dir)) await RNFS.unlink(paths.dir);
  await RNFS.mkdir(paths.dir);
  await RNFS.mkdir(paths.files);

  const state = getListCacheState(mode);
  state.list = [];
  state.at = 0;
  state.inFlight = null;
  state.etag = "";
  state.backoffFailCount = 0;
  state.backoffUntilMs = 0;
  state.lastBackoffLogAtMs = 0;
  if (mode === activeMediaCacheMode) {
    for (const key of Object.keys(progressMap)) delete progressMap[key];
    invalidateCacheSummary();
  }
}

function getListBackoffDelayMs(state: ListCacheState): number {
  const exp = Math.min(state.backoffFailCount, 6);
  const base = MEDIA_FETCH_BACKOFF_BASE_MS * Math.pow(2, exp);
  const jitter = Math.floor(Math.random() * 600);
  return Math.min(MEDIA_FETCH_BACKOFF_MAX_MS, base + jitter);
}

export function setPrioritySection(section: number) {
  const value = Number(section || 0);
  prioritySection = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function setNonPriorityThrottleMs(ms: number) {
  const value = Number(ms || 0);
  nonPriorityThrottleMs = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export async function resetMediaRuntimeState(options: { clearListCache?: boolean; clearPlaybackOverride?: boolean } = {}) {
  if (options.clearPlaybackOverride) {
    playbackOverride = null;
  }
  const listState = getListCacheState();
  listState.list = [];
  listState.at = 0;
  listState.inFlight = null;
  listState.etag = "";
  listState.backoffFailCount = 0;
  listState.backoffUntilMs = 0;
  listState.lastBackoffLogAtMs = 0;
  cacheSummaryCache = { at: 0, total: 0, cached: 0, percent: 0 };
  for (const key of Object.keys(progressMap)) {
    delete progressMap[key];
  }
  if (options.clearListCache) {
    try {
      if (await RNFS.exists(LIST_CACHE_PATH)) {
        await RNFS.unlink(LIST_CACHE_PATH);
      }
    } catch {
      // ignore cleanup errors
    }
  }
}

function mediaItemFingerprint(item: MediaItem): string {
  return [
    String(item?.url || ""),
    String(item?.remoteUrl || ""),
    String(item?.localPath || ""),
    String(item?.name || ""),
    String(item?.originalName || ""),
    String(item?.type || ""),
    Number(item?.section || 0),
    Number(item?.page || 0),
    Number(item?.pageCount || 0),
    Number(item?.size || 0),
    Number(item?.mtimeMs || 0),
    String(item?.hash || ""),
  ].join("|");
}

function sameMediaList(a: MediaItem[], b: MediaItem[]): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (mediaItemFingerprint(a[i]) !== mediaItemFingerprint(b[i])) {
      return false;
    }
  }
  return true;
}

function fetchWithTimeout(
  url: string,
  timeoutMs = MEDIA_FETCH_TIMEOUT_MS,
  headers: Record<string, string> = {}
): Promise<Response> {
  return Promise.race([
    fetch(url, {
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        ...headers,
      },
    }),
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error("media-fetch-timeout")), timeoutMs)
    ),
  ]);
}

function safeName(value: string, fallback = "media"): string {
  const name = String(value || fallback)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
  return name || fallback;
}

async function ensureMediaDirs(mode: MediaCacheMode = activeMediaCacheMode, generation?: string) {
  const paths = getCachePaths(mode, generation);
  const mediaDir = paths.dir;
  const mediaRoot = paths.files;
  await RNFS.mkdir(mediaDir);
  await RNFS.mkdir(mediaRoot);
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const exists = await RNFS.exists(filePath);
    if (!exists) return fallback;
    const raw = await RNFS.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, payload: any) {
  await RNFS.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}

async function readManifest(mode: MediaCacheMode = activeMediaCacheMode, generation?: string): Promise<ManifestMap> {
  const manifestPath = getCachePaths(mode, generation).manifest;
  const manifest = await readJsonFile<ManifestMap>(manifestPath, {});
  manifestBaselines.set(manifest, JSON.parse(JSON.stringify(manifest)) as ManifestMap);
  manifestFilePaths.set(manifest, manifestPath);
  return manifest;
}

async function writeManifest(manifest: ManifestMap) {
  const manifestPath = manifestFilePaths.get(manifest) || MANIFEST_PATH;
  const baseline = manifestBaselines.get(manifest) || {};
  const snapshot = JSON.parse(JSON.stringify(manifest)) as ManifestMap;
  const baselineSnapshot = JSON.parse(JSON.stringify(baseline)) as ManifestMap;
  const writeTask = manifestWriteQueue.then(async () => {
    const latest = await readJsonFile<ManifestMap>(manifestPath, {});
    const merged: ManifestMap = { ...latest };
    const keys = new Set([...Object.keys(baselineSnapshot), ...Object.keys(snapshot)]);
    for (const key of keys) {
      const before = baselineSnapshot[key];
      const after = snapshot[key];
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      if (after === undefined) delete merged[key];
      else merged[key] = after;
    }
    await writeJsonFile(manifestPath, merged);
    manifestBaselines.set(manifest, JSON.parse(JSON.stringify(merged)) as ManifestMap);
    manifestFilePaths.set(manifest, manifestPath);
    invalidateCacheSummary();
  });
  manifestWriteQueue = writeTask.catch(() => undefined);
  await writeTask;
}

async function readListCache(mode: MediaCacheMode = activeMediaCacheMode): Promise<MediaItem[]> {
  const listPath = getCachePaths(mode).list;
  const list = await readJsonFile<MediaItem[]>(listPath, []);
  return Array.isArray(list) ? list : [];
}

async function writeListCache(list: MediaItem[], mode: MediaCacheMode = activeMediaCacheMode) {
  const listPath = getCachePaths(mode).list;
  const listState = getListCacheState(mode);
  if (sameMediaList(listState.list, list)) {
    listState.at = Date.now();
    return;
  }
  await writeJsonFile(listPath, list);
  listState.list = list;
  listState.at = Date.now();
  invalidateCacheSummary();
}

function isLegacyCloudUrl(value: string): boolean {
  const apiUrl = cloudService.getApiUrl();
  if (!apiUrl) return false;
  try {
    return new URL(value).origin === new URL(apiUrl).origin;
  } catch {
    return false;
  }
}

async function migrateLegacyCloudCache(): Promise<void> {
  const markerPath = `${CACHE_PATHS.cloud.dir}/.legacy-cache-migrated`;
  if (await RNFS.exists(markerPath)) return;

  const legacyManifest = await readJsonFile<ManifestMap>(CACHE_PATHS.lan.manifest, {});
  const cloudManifest: ManifestMap = {};
  for (const [url, entry] of Object.entries(legacyManifest)) {
    if (!isLegacyCloudUrl(url) || !entry?.localPath || !(await fileExists(entry.localPath))) continue;
    const fileName = String(entry.localPath).split(/[\\/]/).pop() || safeName(url);
    const targetPath = `${CACHE_PATHS.cloud.files}/${fileName}`;
    try {
      if (!(await fileExists(targetPath))) await RNFS.copyFile(entry.localPath, targetPath);
      cloudManifest[url] = { ...entry, localPath: targetPath };
    } catch {
      // A failed legacy copy is left in the old cache; normal sync can download it again.
    }
  }

  const legacyList = await readJsonFile<MediaItem[]>(CACHE_PATHS.lan.list, []);
  const cloudList: MediaItem[] = [];
  for (const item of Array.isArray(legacyList) ? legacyList : []) {
    const url = String(item?.url || "");
    if (!isLegacyCloudUrl(url)) continue;
    const entry = cloudManifest[url];
    cloudList.push(entry
      ? { ...item, localPath: entry.localPath, remoteUrl: localUri(entry.localPath) }
      : item);
  }

  await writeJsonFile(CACHE_PATHS.cloud.manifest, cloudManifest);
  await writeJsonFile(CACHE_PATHS.cloud.list, cloudList);
  await writeJsonFile(CACHE_PATHS.lan.list, (Array.isArray(legacyList) ? legacyList : []).filter((item) => !isLegacyCloudUrl(String(item?.url || ""))));
  await RNFS.writeFile(markerPath, String(Date.now()), "utf8");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return await RNFS.exists(path);
  } catch {
    return false;
  }
}

function localUri(path: string): string {
  if (path.startsWith("file://")) return path;
  return `file://${path}`;
}

function hashString(value: string): string {
  let hash = 0;
  const input = String(value || "");
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function localPathFor(remoteUrl: string, section: number, name: string, mediaRoot = MEDIA_ROOT): string {
  const encoded = hashString(remoteUrl);
  const fileName = safeName(`${section}_${encoded}_${name}`);
  return `${mediaRoot}/${fileName}`;
}

export function setPlaybackOverride(sourceId: string, items: MediaItem[]) {
  const safeItems = Array.isArray(items)
    ? items
        .filter((item) => !!item && typeof item === "object")
        .map((item) => ({
          ...item,
          section: Math.max(1, Math.min(3, Number(item.section || 1))),
        }))
    : [];

  playbackOverride = {
    sourceId: String(sourceId || "runtime"),
    items: safeItems,
    activatedAt: Date.now(),
  };
  console.log('=== MEDIA SERVICE: Playback override set ===');
  console.log('Source ID:', sourceId);
  console.log('Items count:', safeItems.length);
  console.log('Items:', safeItems);
}

export function clearPlaybackOverride(sourceId?: string) {
  if (!playbackOverride) return;
  if (sourceId && playbackOverride.sourceId !== sourceId) return;
  console.log('=== MEDIA SERVICE: Playback override cleared ===');
  console.log('Source ID:', sourceId);
  playbackOverride = null;
}

export function getPlaybackOverride() {
  console.log('=== MEDIA SERVICE: getPlaybackOverride called ===');
  console.log('Current override:', playbackOverride ? 'SET' : 'NULL');
  if (playbackOverride) {
    console.log('Override source ID:', playbackOverride.sourceId);
    console.log('Override items count:', playbackOverride.items.length);
  }
  return playbackOverride;
}

function tempDownloadPathFor(targetPath: string): string {
  return `${targetPath}.part`;
}

function shouldCacheItem(item: MediaItem): boolean {
  const url = String(item?.url || "").trim();
  if (!url) return false;
  const sizeBytes = Number(item?.size || 0);
  const isVideo = isVideoItem(item);
  try {
    const stats = DeviceIdModule?.getStorageStats?.();
    const freeBytes = Number(stats?.freeBytes || 0);
    const totalBytes = Number(stats?.totalBytes || 0);
    const lowCapacityDevice =
      totalBytes > 0 && totalBytes <= LOW_STORAGE_ROOM_TOTAL_BYTES;
    if (freeBytes > 0 && freeBytes <= LOW_STORAGE_HARD_LIMIT_BYTES) {
      if (isVideo) {
        return sizeBytes > 0 && sizeBytes <= LOW_STORAGE_VIDEO_FILE_BYTES;
      }
      return sizeBytes <= 0 || sizeBytes <= LOW_STORAGE_SMALL_FILE_BYTES;
    }
    if (
      (freeBytes > 0 && freeBytes <= LOW_STORAGE_SOFT_LIMIT_BYTES) ||
      lowCapacityDevice
    ) {
      if (isVideo) {
        return sizeBytes > 0 && sizeBytes <= LOW_STORAGE_VIDEO_FILE_BYTES;
      }
      return sizeBytes <= 0 || sizeBytes <= LOW_STORAGE_MEDIUM_FILE_BYTES;
    }
    if (isVideo && sizeBytes > 0 && freeBytes > 0) {
      return freeBytes - sizeBytes >= DEFAULT_MIN_FREE_BYTES;
    }
  } catch {
    // ignore adaptive storage checks
  }
  return true;
}

export function isMediaCacheEligible(item: MediaItem): boolean {
  return shouldCacheItem(item);
}

function isVideoItem(item: MediaItem): boolean {
  const mime = String(item?.type || "").toLowerCase();
  if (mime.startsWith("video/")) return true;
  const name = String(item?.originalName || item?.name || item?.url || "");
  return (cloudService.isEnabled() ? CLOUD_VIDEO_FILE_RE : VIDEO_FILE_RE).test(name);
}

function getDownloadKey(item: MediaItem, mode: MediaCacheMode): string {
  return `${mode}|${String(item.url || "")}|${Number(item.size || 0)}|${Number(item.mtimeMs || 0)}`;
}

function isExpectedValue(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

async function computeFileHash(path: string, expectedHash = ""): Promise<string> {
  try {
    const hashFn = (RNFS as any)?.hash;
    if (typeof hashFn === "function") {
      // Older local manifests may carry SHA-1 checksums. Cloud uploads now
      // publish SHA-256, so select the algorithm from the checksum length.
      const algorithm = /^[a-f0-9]{40}$/i.test(expectedHash) ? "sha1" : "sha256";
      const value = await hashFn(path, algorithm);
      return String(value || "");
    }
  } catch {
    // ignore
  }
  return "";
}

async function isManifestEntryUsable(
  entry: ManifestEntry | undefined,
  expectedSize: number,
  expectedMtime: number,
  expectedHash: string
): Promise<boolean> {
  if (!entry?.localPath) return false;
  if (!(await fileExists(entry.localPath))) return false;

  const sizeExpected = isExpectedValue(expectedSize);
  const mtimeExpected = isExpectedValue(expectedMtime);
  const hashExpected = String(expectedHash || "").trim();
  if (!sizeExpected && !mtimeExpected) {
    if (hashExpected) {
      const actualHash = await computeFileHash(entry.localPath, hashExpected);
      if (!actualHash || actualHash !== hashExpected) return false;
      entry.hash = hashExpected;
    }
    entry.lastSeenAt = Date.now();
    return true;
  }

  try {
    const stat = await RNFS.stat(entry.localPath);
    const size = Number(stat?.size || 0);
    const sizeOk = !sizeExpected || size === expectedSize;
    const mtimeOk = !mtimeExpected || Number(entry.mtimeMs || 0) === expectedMtime;
    let hashOk = true;
    if (hashExpected) {
      const actualHash = await computeFileHash(entry.localPath, hashExpected);
      hashOk = !!actualHash && actualHash === hashExpected;
    }
    if (sizeOk && mtimeOk && hashOk) {
      if (sizeExpected && entry.size !== expectedSize) entry.size = expectedSize;
      if (mtimeExpected && entry.mtimeMs !== expectedMtime) entry.mtimeMs = expectedMtime;
      if (hashExpected && entry.hash !== hashExpected) entry.hash = hashExpected;
      entry.lastSeenAt = Date.now();
      return true;
    }
  } catch {
    // fallthrough
  }

  return false;
}

async function downloadIfNeeded(
  server: string,
  item: MediaItem,
  manifest: ManifestMap,
  mode: MediaCacheMode,
  generation?: string
): Promise<string | null> {
  const remotePath = String(item.url || "");
  if (!remotePath) return null;
  const remoteUrl = /^https?:\/\//i.test(remotePath) ? remotePath : `${server}${remotePath}`;
  const sourceName = String(item.originalName || item.name || "media.bin");
  const section = Number(item.section || 1);
  const mediaRoot = getCachePaths(mode, generation).files;
  const expectedSize = Number(item.size || 0);
  const expectedMtime = Number(item.mtimeMs || 0);
  const expectedHash = String(item.hash || "").trim();
  const entry = manifest[remotePath];

  if (await isManifestEntryUsable(entry, expectedSize, expectedMtime, expectedHash)) {
    markCachedProgress(remotePath, Number(entry?.size || expectedSize || 0));
    return entry!.localPath;
  }

  const targetPath = localPathFor(remoteUrl, section, sourceName, mediaRoot);
  const tempPath = tempDownloadPathFor(targetPath);
  emitProgress(remotePath, {
    total: expectedSize || 0,
    received: 0,
    percent: 0,
    updatedAt: Date.now(),
  });
  // If the file already exists locally (manifest missing), reuse it.
  try {
    if (await fileExists(targetPath)) {
      const stat = await RNFS.stat(targetPath);
      const size = Number(stat?.size || 0);
      if (!expectedSize || size === expectedSize) {
        if (expectedHash) {
          const actualHash = await computeFileHash(targetPath, expectedHash);
          if (!actualHash || actualHash !== expectedHash) {
            throw new Error("download-hash-mismatch");
          }
        }
      manifest[remotePath] = {
        url: remotePath,
        localPath: targetPath,
        size: expectedSize || size,
        mtimeMs: expectedMtime,
        hash: expectedHash || undefined,
        lastSeenAt: Date.now(),
      };
      await writeManifest(manifest);
      emitProgress(remotePath, {
        total: expectedSize || size || 0,
        received: expectedSize || size || 0,
          percent: 100,
          updatedAt: Date.now(),
        });
        invalidateCacheSummary();
        return targetPath;
      }
    }
  } catch {
    // continue to download
  }
  for (let attempt = 0; attempt < DOWNLOAD_MAX_RETRIES; attempt += 1) {
    try {
      try {
        if (await fileExists(tempPath)) {
          await RNFS.unlink(tempPath);
        }
      } catch {
        // clean previous temp file before retrying
      }
      try {
        if (await fileExists(targetPath)) {
          await RNFS.unlink(targetPath);
        }
      } catch {
        // clean partial files before retrying
      }
      const cloudDeviceToken = cloudService.isEnabled() ? await cloudService.ensureDeviceAuthToken() : '';
      if (cloudService.isEnabled() && !cloudDeviceToken) throw new Error('cloud-device-auth-required');
      const downloadUrl = `${remoteUrl}${remoteUrl.includes('?') ? '&' : '?'}ts=${Date.now()}`;
      const download = RNFS.downloadFile({
        fromUrl: downloadUrl,
        toFile: tempPath,
        headers: cloudDeviceToken ? { Authorization: `Bearer ${cloudDeviceToken}` } : undefined,
        background: false,
        discretionary: false,
        connectionTimeout: DOWNLOAD_CONNECTION_TIMEOUT_MS,
        readTimeout: DOWNLOAD_READ_TIMEOUT_MS,
        progressInterval: 500,
        progress: (data) => {
          const total = Number(data?.contentLength || 0);
          const received = Number(data?.bytesWritten || 0);
          if (!total) return;
          const percent = Math.max(0, Math.min(100, Math.round((received / total) * 100)));
          emitProgress(remotePath, {
            total,
            received,
            percent,
            updatedAt: Date.now(),
          });
        },
      });
      const result = await download.promise;
      if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new Error(`download-http-${result.statusCode}`);
      }

      const finalStat = await RNFS.stat(tempPath);
      const finalSize = Number(finalStat?.size || 0);
      if (expectedSize > 0 && finalSize !== expectedSize) {
        throw new Error(`download-size-mismatch:${finalSize}:${expectedSize}`);
      }
      if (expectedHash) {
        const actualHash = await computeFileHash(tempPath, expectedHash);
        if (!actualHash || actualHash !== expectedHash) {
          try {
            await RNFS.unlink(tempPath);
          } catch {
            // ignore
          }
          throw new Error("download-hash-mismatch");
        }
      }
      try {
        if (await fileExists(targetPath)) {
          await RNFS.unlink(targetPath);
        }
      } catch {
        // ignore previous file cleanup errors
      }
      await RNFS.moveFile(tempPath, targetPath);
      manifest[remotePath] = {
        url: remotePath,
        localPath: targetPath,
        size: expectedSize || finalSize,
        mtimeMs: expectedMtime,
        hash: expectedHash || undefined,
        lastSeenAt: Date.now(),
      };
      await writeManifest(manifest);
      emitProgress(remotePath, {
        total: expectedSize || finalSize || 0,
        received: expectedSize || finalSize || 0,
        percent: 100,
        updatedAt: Date.now(),
      });
      invalidateCacheSummary();
      return targetPath;
    } catch (downloadError: any) {
      console.warn('=== MEDIA DOWNLOAD FAILED:', String(remoteUrl || remotePath).slice(0, 160), '| attempt', attempt + 1, '| error:', String(downloadError?.message || downloadError));
      try {
        if (await fileExists(tempPath)) {
          await RNFS.unlink(tempPath);
        }
      } catch {
        // ignore temp cleanup errors
      }
      try {
        if (await fileExists(targetPath)) {
          const currentEntry = manifest[remotePath];
          if (!currentEntry || currentEntry.localPath !== targetPath) {
            await RNFS.unlink(targetPath);
          }
        }
      } catch {
        // ignore cleanup errors
      }
      if (attempt < DOWNLOAD_MAX_RETRIES - 1) {
        await new Promise<void>((resolve) => setTimeout(() => resolve(), DOWNLOAD_RETRY_DELAY_MS));
      }
    }
  }

  // A failed Cloud replacement must not discard the last applied manifest
  // entry: rollback may still use its old size/hash to resolve the prior file.
  if (mode !== "cloud") delete manifest[remotePath];
  await writeManifest(manifest);
  return null;
}

async function downloadIfNeededDeduped(
  server: string,
  item: MediaItem,
  manifest: ManifestMap,
  mode: MediaCacheMode = activeMediaCacheMode,
  generation?: string
): Promise<string | null> {
  const key = `${getDownloadKey(item, mode)}|${normalizeGeneration(generation ?? (mode === "cloud" ? activeCloudCacheGeneration : "legacy"))}`;
  const existing = inFlightDownloads.get(key);
  if (existing) return existing;

  const task = (async () => {
    try {
      return await downloadIfNeeded(server, item, manifest, mode, generation);
    } finally {
      inFlightDownloads.delete(key);
    }
  })();

  inFlightDownloads.set(key, task);
  return task;
}

async function removeStaleFiles(
  manifest: ManifestMap,
  activeUrls: Set<string>,
  options: { immediate?: boolean } = {},
  mode: MediaCacheMode = activeMediaCacheMode,
) {
  const now = Date.now();
  const activeList = Array.from(activeUrls);
  const activeCachedChecks = await Promise.all(
    activeList.map(async (url) => {
      const entry = manifest[url];
      if (!entry || !entry.localPath) return false;
      return await fileExists(entry.localPath);
    })
  );
  const activeCacheVerified =
    activeList.length === 0 ||
    activeCachedChecks.every((cached) => cached);

  for (const url of Object.keys(manifest)) {
    const entry = manifest[url];
    if (!entry) continue;
    const pinnedByCloudConfig = mode === "cloud" && pinnedCloudConfigUrls.has(normalizeCacheUrl(url));
    if (activeUrls.has(url) || pinnedByCloudConfig) {
      entry.lastSeenAt = now;
      continue;
    }
    if (!entry.lastSeenAt) {
      entry.lastSeenAt = now;
      if (!options.immediate) continue;
    }
    if (!activeCacheVerified) {
      // Keep the previous offline version until the active replacement set is fully cached.
      continue;
    }
    if (!options.immediate && now - Number(entry.lastSeenAt || 0) < CACHE_RETENTION_MS) continue;

    // Avoid unlinking immediately; a file can still be in active playback pipeline.
    // Delete only after a retention window to reduce playback risk.
    try {
      if (entry.localPath && (await fileExists(entry.localPath))) {
        await RNFS.unlink(entry.localPath);
      }
    } catch {
      // ignore
    }
    delete manifest[url];
  }
}

async function applyManifestToCachedList(list: MediaItem[], mode: MediaCacheMode = activeMediaCacheMode): Promise<MediaItem[]> {
  if (!Array.isArray(list) || !list.length) return [];
  try {
    await ensureMediaDirs(mode);
    const manifest = await readManifest(mode);
    let changed = false;

    const mapped = await Promise.all(
      list.map(async (item) => {
        const path = String(item?.url || "");
        if (!path) return item;
        const entry = manifest[path];
        if (!entry || !(await fileExists(entry.localPath))) return item;
        const fileUri = localUri(entry.localPath);
        markCachedProgress(path, Number(entry.size || item?.size || 0));
        if (item.remoteUrl !== fileUri || item.localPath !== entry.localPath) {
          changed = true;
          return { ...item, localPath: entry.localPath, remoteUrl: fileUri };
        }
        return item;
      })
    );

    if (changed) {
      await writeListCache(mapped, mode);
      return mapped;
    }

    return mapped;
  } catch {
    return list;
  }
}

async function runTasksWithConcurrency(
  tasks: Array<() => Promise<void>>,
  concurrency = DOWNLOAD_CONCURRENCY,
  options: { ignoreOverride?: boolean; delayMs?: number } = {}
) {
  const adaptive = getAdaptiveDownloadConcurrency();
  let safeConcurrency = Math.max(1, Number(concurrency || adaptive || 1));
  if (!options.ignoreOverride && downloadConcurrencyOverride !== null) {
    if (downloadConcurrencyOverride === 0) return;
    safeConcurrency = Math.max(1, Math.min(safeConcurrency, downloadConcurrencyOverride));
  }
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      try {
        await tasks[index]();
      } catch {
        // no-op
      }
      if (options.delayMs && options.delayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(() => resolve(), options.delayMs));
      }
    }
  }

  const workers = Array.from({ length: Math.min(safeConcurrency, tasks.length) }, () => worker());
  await Promise.allSettled(workers);
}

async function mapServerListToPlayable(
  serverList: MediaItem[],
  server: string,
  options: { awaitDownloads?: boolean; pruneStaleNow?: boolean } = {},
  mode: MediaCacheMode = activeMediaCacheMode
): Promise<MediaItem[]> {
  await ensureMediaDirs(mode);
  const manifest = await readManifest(mode);
  const listState = getListCacheState(mode);
  const activeUrls = new Set<string>();
  const uniqueByUrl = new Map<string, MediaItem>();

  for (const item of serverList) {
    const path = String(item?.url || "");
    if (!path) continue;
    activeUrls.add(path);
    if (!uniqueByUrl.has(path)) uniqueByUrl.set(path, item);
  }

  const resolvedByUrl: Record<string, string> = {};
  const pendingDownloads: Array<() => Promise<void>> = [];
  const pendingLargeDownloads: Array<() => Promise<void>> = [];
  const pendingVideoDownloads: Array<() => Promise<void>> = [];
  const deferredLargeVideoDownloads: Array<() => Promise<void>> = [];
  const priorityDownloads: Array<() => Promise<void>> = [];
  const priorityLargeDownloads: Array<() => Promise<void>> = [];
  const priorityVideoDownloads: Array<() => Promise<void>> = [];
  const priorityDeferredLargeVideoDownloads: Array<() => Promise<void>> = [];
  for (const [path, item] of uniqueByUrl.entries()) {
    const existing = manifest[path];
    if (existing) {
      const expectedSize = Number(item.size || 0);
      const expectedMtime = Number(item.mtimeMs || 0);
      const expectedHash = String(item.hash || "").trim();
      if (await isManifestEntryUsable(existing, expectedSize, expectedMtime, expectedHash)) {
        resolvedByUrl[path] = existing.localPath;
        markCachedProgress(path, Number(existing.size || item.size || 0));
        continue;
      }
    }

    // Keep playback immediate: use remote now, download cache in background.
    // Limit caching to reasonable file sizes to avoid memory pressure on TV devices.
    if (shouldCacheItem(item)) {
      const sizeBytes = Number(item?.size || 0);
      if (options.awaitDownloads && sizeBytes > 0 && sizeBytes <= SMALL_FILE_AWAIT_BYTES) {
        const localPathValue = await downloadIfNeededDeduped(server, item, manifest, mode);
        if (localPathValue) {
          resolvedByUrl[path] = localPathValue;
          continue;
        }
      }
      const task = async () => {
        const localPathValue = await downloadIfNeededDeduped(server, item, manifest, mode);
        if (localPathValue) {
          resolvedByUrl[path] = localPathValue;
        }
      };
      const isPriority = prioritySection > 0 && Number(item?.section || 0) === prioritySection;
      if (isVideoItem(item)) {
        if (sizeBytes > LARGE_MEDIA_BYTES) {
          (isPriority ? priorityDeferredLargeVideoDownloads : deferredLargeVideoDownloads).push(task);
        } else {
          (isPriority ? priorityVideoDownloads : pendingVideoDownloads).push(task);
        }
      } else if (sizeBytes > LARGE_MEDIA_BYTES) {
        (isPriority ? priorityLargeDownloads : pendingLargeDownloads).push(task);
      } else {
        (isPriority ? priorityDownloads : pendingDownloads).push(task);
      }
    }
  }

  const mapped = serverList.map((item) => {
    const path = String(item?.url || "");
    const localPathValue = resolvedByUrl[path];
    if (localPathValue) {
      return {
        ...item,
        localPath: localPathValue,
        remoteUrl: localUri(localPathValue),
      };
    }
    return {
      ...item,
      remoteUrl: /^https?:\/\//i.test(path) ? path : `${server}${path}`,
    };
  });

  await removeStaleFiles(manifest, activeUrls, { immediate: !!options.pruneStaleNow }, mode);
  clearProgressForMissingPaths(activeUrls);
  await writeManifest(manifest);
  if (!sameMediaList(listState.list, mapped)) {
    await writeListCache(mapped, mode);
  } else {
    listState.at = Date.now();
  }

  if (
    !pendingDownloads.length &&
    !pendingLargeDownloads.length &&
    !pendingVideoDownloads.length &&
    !deferredLargeVideoDownloads.length &&
    !priorityDownloads.length &&
    !priorityLargeDownloads.length &&
    !priorityVideoDownloads.length &&
    !priorityDeferredLargeVideoDownloads.length
  ) {
    return mapped;
  }

  const buildRefreshed = () =>
    serverList.map((item) => {
      const path = String(item?.url || "");
      const localPathValue = manifest[path]?.localPath;
      if (localPathValue) {
        markCachedProgress(path, Number(item?.size || 0));
        return {
          ...item,
          localPath: localPathValue,
          remoteUrl: localUri(localPathValue),
        };
      }
      return {
        ...item,
        remoteUrl: /^https?:\/\//i.test(path) ? path : `${server}${path}`,
      };
    });

  if (options.awaitDownloads) {
    if (priorityDownloads.length) {
      await runTasksWithConcurrency(priorityDownloads, DOWNLOAD_CONCURRENCY, {
        ignoreOverride: true,
      });
    }
    if (priorityVideoDownloads.length) {
      await runTasksWithConcurrency(priorityVideoDownloads, VIDEO_DOWNLOAD_CONCURRENCY, {
        ignoreOverride: true,
      });
    }
    if (priorityLargeDownloads.length) {
      await runTasksWithConcurrency(priorityLargeDownloads, LARGE_MEDIA_CONCURRENCY, {
        ignoreOverride: true,
      });
    }
    if (pendingDownloads.length) {
      await runTasksWithConcurrency(pendingDownloads, DOWNLOAD_CONCURRENCY, {
        ignoreOverride: true,
      });
    }
    if (pendingVideoDownloads.length) {
      await runTasksWithConcurrency(pendingVideoDownloads, VIDEO_DOWNLOAD_CONCURRENCY, {
        ignoreOverride: true,
      });
    }
    if (pendingLargeDownloads.length) {
      await runTasksWithConcurrency(pendingLargeDownloads, LARGE_MEDIA_CONCURRENCY, {
        ignoreOverride: true,
      });
    }
    if (priorityDeferredLargeVideoDownloads.length) {
      await runTasksWithConcurrency(priorityDeferredLargeVideoDownloads, 1, {
        ignoreOverride: true,
      });
    }
    if (deferredLargeVideoDownloads.length) {
      await runTasksWithConcurrency(deferredLargeVideoDownloads, 1, {
        ignoreOverride: true,
      });
    }
    const refreshed = buildRefreshed();
    await writeManifest(manifest);
    if (sameMediaList(listState.list, refreshed)) {
      listState.at = Date.now();
      return listState.list;
    }
    await writeListCache(refreshed, mode);
    return refreshed;
  }

  const backgroundSync = async () => {
    if (priorityDownloads.length) {
      await runTasksWithConcurrency(priorityDownloads, DOWNLOAD_CONCURRENCY, {
        ignoreOverride: true,
      });
    }
    if (priorityVideoDownloads.length) {
      await runTasksWithConcurrency(priorityVideoDownloads, VIDEO_DOWNLOAD_CONCURRENCY, {
        ignoreOverride: true,
      });
    }
    if (priorityLargeDownloads.length) {
      await runTasksWithConcurrency(priorityLargeDownloads, LARGE_MEDIA_CONCURRENCY, {
        ignoreOverride: true,
      });
    }
    if (pendingDownloads.length) {
      await runTasksWithConcurrency(pendingDownloads, DOWNLOAD_CONCURRENCY, {
        delayMs: nonPriorityThrottleMs,
      });
    }
    if (pendingVideoDownloads.length) {
      await runTasksWithConcurrency(pendingVideoDownloads, VIDEO_DOWNLOAD_CONCURRENCY, {
        delayMs: nonPriorityThrottleMs,
      });
    }
    if (pendingLargeDownloads.length) {
      await runTasksWithConcurrency(pendingLargeDownloads, LARGE_MEDIA_CONCURRENCY, {
        delayMs: nonPriorityThrottleMs,
      });
    }
    if (priorityDeferredLargeVideoDownloads.length || deferredLargeVideoDownloads.length) {
      setTimeout(() => {
        runTasksWithConcurrency(
          [...priorityDeferredLargeVideoDownloads, ...deferredLargeVideoDownloads],
          1,
          { delayMs: nonPriorityThrottleMs }
        )
          .then(async () => {
            const refreshed = buildRefreshed();
            await writeManifest(manifest);
            if (!sameMediaList(listState.list, refreshed)) {
              await writeListCache(refreshed, mode);
            } else {
              listState.at = Date.now();
            }
          })
          .catch(() => {
            // no-op
          });
      }, LARGE_VIDEO_CACHE_DEFER_MS);
    }
    const refreshed = buildRefreshed();
    await writeManifest(manifest);
    if (!sameMediaList(listState.list, refreshed)) {
      await writeListCache(refreshed, mode);
    } else {
      listState.at = Date.now();
    }
  };

  backgroundSync().catch(() => {
    // no-op
  });

  return mapped;
}

function sanitizeCachedList(list: MediaItem[]): MediaItem[] {
  if (!Array.isArray(list)) return [];
  return list.filter((item) => {
    if (!item || typeof item !== "object") return false;
    return !!item.url;
  });
}

function normalizeMediaList(list: MediaItem[]): MediaItem[] {
  if (!Array.isArray(list) || !list.length) return [];
  const seen = new Set<string>();
  const result: MediaItem[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const url = String(item.url || "").trim();
    if (!url) continue;
    const name = String(item.originalName || item.name || "").trim();
    const size = Number(item.size || 0);
    const mtime = Number(item.mtimeMs || 0);
    const section = Number(item.section || 0);
    const page = Number(item.page || 0);
    const key = `${url}|${name}|${size}|${mtime}|${section}|${page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

async function fetchServerMediaList(server: string, mode: MediaCacheMode = activeMediaCacheMode): Promise<MediaItem[]> {
  const listState = getListCacheState(mode);
  const deviceId = await DeviceIdModule.getDeviceId();
  const headers: Record<string, string> = {};
  if (listState.etag) headers["If-None-Match"] = listState.etag;
  const res = await fetchWithTimeout(
    `${server}/media-list?deviceId=${deviceId}&ts=${Date.now()}`,
    MEDIA_FETCH_TIMEOUT_MS,
    headers
  );
  if (res.status === 304) {
    if (listState.list.length) return listState.list;
    const cached = normalizeMediaList(sanitizeCachedList(await readListCache(mode)));
    return cached;
  }
  if (!res.ok) {
    throw new Error(`media-http-${res.status}`);
  }
  const etag = res.headers?.get?.("ETag");
  if (etag) listState.etag = etag;
  const list = await res.json();
  if (!Array.isArray(list)) return [];
  return normalizeMediaList(list);
}

async function loadCachedPlayableList(): Promise<MediaItem[]> {
  const mode = activeMediaCacheMode;
  const listState = getListCacheState(mode);
  if (listState.list.length) return listState.list;
  try {
    const cached = normalizeMediaList(sanitizeCachedList(await readListCache(mode)));
    const mapped = await applyManifestToCachedList(cached, mode);
    listState.list = mapped;
    listState.at = Date.now();
    return mapped;
  } catch (e) {
    console.log("Load cached playable list failed", e);
    return [];
  }
}

async function refreshPlayableList(
  options: {
    blockUntilCached?: boolean;
    blockUntilCachedSmallBytes?: number;
    pruneStaleNow?: boolean;
    force?: boolean;
    forceHard?: boolean;
  } = {}
): Promise<MediaItem[]> {
  const now = Date.now();
  const mode = activeMediaCacheMode;
  const listState = getListCacheState(mode);
  const server = getServer();
  if (!server) {
    return loadCachedPlayableList();
  }

  const ageMs = now - listState.at;
  if (!options.force && listState.list.length && ageMs < LIST_REFRESH_MIN_INTERVAL_MS) {
    return listState.list;
  }

  if ((!options.force || !options.forceHard) && listState.backoffUntilMs && now < listState.backoffUntilMs) {
    return loadCachedPlayableList();
  }

  if (listState.inFlight) return listState.inFlight;

  listState.inFlight = (async () => {
    try {
      const list = await fetchServerMediaList(server, mode);
      listState.backoffFailCount = 0;
      listState.backoffUntilMs = 0;
      const totalBytes = list.reduce((sum, item) => sum + Number(item?.size || 0), 0);
      const smallLimit = Number(options.blockUntilCachedSmallBytes || 0);
      const awaitDownloads =
        !!options.blockUntilCached ||
        (smallLimit > 0 && totalBytes > 0 && totalBytes <= smallLimit);
      return mapServerListToPlayable(list, server, {
        awaitDownloads,
        pruneStaleNow: !!options.pruneStaleNow,
      }, mode);
    } catch (e) {
      listState.backoffFailCount += 1;
      listState.backoffUntilMs = Date.now() + getListBackoffDelayMs(listState);
      if (Date.now() - listState.lastBackoffLogAtMs > 5000) {
        listState.lastBackoffLogAtMs = Date.now();
        console.log("Media list fetch failed, backing off", e);
      }
      return loadCachedPlayableList();
    }
  })();

  try {
    return await listState.inFlight;
  } finally {
    listState.inFlight = null;
  }
}

export async function syncMedia(
  options: {
    blockUntilCached?: boolean;
    blockUntilCachedSmallBytes?: number;
    pruneStaleNow?: boolean;
    force?: boolean;
    forceHard?: boolean;
  } = {}
) {
  try {
    await refreshPlayableList(options);
    return true;
  } catch (e) {
    console.log("Media sync failed, using cached list", e);
    await loadCachedPlayableList();
    return false;
  }
}

export async function getMediaFiles(sectionIndex = 0, playlistNames?: string[]) {
  const sectionNo = sectionIndex + 1;
  // An omitted playlist means the legacy section playlist. An explicit empty
  // array is a valid profile playlist and intentionally plays no media.
  const requestedNames = Array.isArray(playlistNames)
    ? new Set(playlistNames.map((name) => String(name || "").trim()).filter(Boolean))
    : null;
  const selectPlaylist = (items: MediaItem[]) => {
    const sectionItems = items.filter((file) => Number(file.section || 0) === sectionNo);
    return requestedNames
      ? sectionItems.filter((file) => requestedNames.has(String(file.originalName || file.name || "")))
      : sectionItems;
  };

  console.log('=== MEDIA SERVICE: getMediaFiles called for section ===', sectionNo);
  console.log('Playback override variable:', playbackOverride ? 'SET' : 'NULL');
  if (playbackOverride) {
    console.log('=== MEDIA SERVICE: Using playback override for section ===', sectionNo);
    console.log('Override source ID:', playbackOverride.sourceId);
    console.log('Override items count:', playbackOverride.items.length);
    const filtered = playbackOverride.items.filter(
      (item) => Math.max(1, Number(item?.section || 1)) === sectionNo
    );
    console.log('Filtered items for section:', filtered.length);
    const resolved = await resolveCachedMediaItems(filtered);
    // Cloud playlists are offline snapshots. Never hand an uncached remote URL
    // to the cloud player as a streaming fallback.
    return activeMediaCacheMode === "cloud"
      ? resolved.filter((item) => !!item.localPath && /^file:\/\//i.test(String(item.remoteUrl || "")))
      : resolved;
  }

  try {
    const mapped = await refreshPlayableList();
    const filtered = selectPlaylist(mapped);
    try {
      const names = filtered
        .map((file) => String(file.originalName || file.name || file.url || ""))
        .filter(Boolean)
        .slice(0, 25);
      const key = `${filtered.length}|${names.join("|")}`;
      const now = Date.now();
      const lastAt = lastMediaLogAtBySection[sectionNo] || 0;
      if (key !== lastMediaLogKeyBySection[sectionNo] || now - lastAt > 10000) {
        lastMediaLogAtBySection[sectionNo] = now;
        lastMediaLogKeyBySection[sectionNo] = key;
        console.log(
          "Media list",
          `section=${sectionNo}`,
          `count=${filtered.length}`,
          names.length ? `items=${names.join(" | ")}` : "items=none"
        );
      }
    } catch {
      // ignore logging failures
    }
    return filtered;
  } catch (e) {
    console.log("Media list fetch failed, fallback to cache", e);
  }

  const cached = await loadCachedPlayableList();
  const filtered = selectPlaylist(cached);
  try {
    const names = filtered
      .map((file) => String(file.originalName || file.name || file.url || ""))
      .filter(Boolean)
      .slice(0, 25);
    const key = `cache|${filtered.length}|${names.join("|")}`;
    const now = Date.now();
    const lastAt = lastMediaLogAtBySection[sectionNo] || 0;
    if (key !== lastMediaLogKeyBySection[sectionNo] || now - lastAt > 10000) {
      lastMediaLogAtBySection[sectionNo] = now;
      lastMediaLogKeyBySection[sectionNo] = key;
      console.log(
        "Media list (cache)",
        `section=${sectionNo}`,
        `count=${filtered.length}`,
        names.length ? `items=${names.join(" | ")}` : "items=none"
      );
    }
  } catch {
    // ignore logging failures
  }
  return filtered;
}

export async function resolveCachedMediaItems(items: MediaItem[]): Promise<MediaItem[]> {
  if (!Array.isArray(items) || items.length === 0) return items || [];
  const mode = activeMediaCacheMode;
  try {
    const manifest = await readManifest(mode);
    const resolved = await Promise.all(items.map(async (item) => {
      const key = String(item?.url || "");
      const entry = key ? manifest[key] : null;
      const usable = entry?.localPath && await isManifestEntryUsable(
        entry,
        Number(item.size || 0),
        Number(item.mtimeMs || 0),
        String(item.hash || "")
      );
      return usable ? { ...item, localPath: entry.localPath, remoteUrl: localUri(entry.localPath) } : item;
    }));
    // Do not play a partial Cloud playlist or fall back to a remote URL. The
    // player gets the complete ordered section only after every item is local.
    if (mode === "cloud" && resolved.some((item) => !item.localPath || !/^file:\/\//i.test(String(item.remoteUrl || "")))) {
      return [];
    }
    return resolved;
  } catch {
    return mode === "cloud" ? [] : items;
  }
}

export async function hasCachedMedia(): Promise<boolean> {
  try {
    const list = await readListCache();
    return Array.isArray(list) && list.length > 0;
  } catch {
    return false;
  }
}

export async function pruneCacheIfLow(minFreeBytes = DEFAULT_MIN_FREE_BYTES) {
  try {
    const stats = DeviceIdModule?.getStorageStats?.();
    const freeBytes = Number(stats?.freeBytes || 0);
    if (!freeBytes || freeBytes >= minFreeBytes) return false;

    await ensureMediaDirs();
    const manifest = await readManifest();
    const activeUrls = new Set(activePlaybackUrls.values());
    if (activeMediaCacheMode === "cloud") {
      for (const url of pinnedCloudConfigUrls) activeUrls.add(url);
    }
    const entries = Object.values(manifest).filter(
      (entry) => entry?.localPath &&
        !activeUrls.has(String(entry.url || "")) &&
        !(activeMediaCacheMode === "cloud" && pinnedCloudConfigUrls.has(normalizeCacheUrl(String(entry.url || ""))))
    );
    if (!entries.length) return false;

    const sorted = entries.sort(
      (a, b) => Number(a.lastSeenAt || 0) - Number(b.lastSeenAt || 0)
    );

    let reclaimed = 0;
    for (const entry of sorted) {
      if (!entry?.localPath) continue;
      try {
        if (await fileExists(entry.localPath)) {
          await RNFS.unlink(entry.localPath);
          reclaimed += Number(entry.size || 0);
        }
      } catch {
        // ignore unlink errors
      }
      delete manifest[entry.url];
      if (freeBytes + reclaimed >= minFreeBytes) break;
    }

    await writeManifest(manifest);
    return true;
  } catch {
    return false;
  }
}

export type MediaPrefetchResult = {
  total: number;
  cached: number;
  failed: number;
  storageBlock?: { freeBytes: number; requiredBytes: number; reserveBytes: number };
};

export async function prefetchMediaItems(
  items: MediaItem[],
  onProgress?: (result: MediaPrefetchResult) => void | Promise<void>,
  generation?: string
): Promise<MediaPrefetchResult> {
  const requestedItems = (Array.isArray(items) ? items : []).filter((item) => !!item?.url);
  const uniqueItems = Array.from(new Map(
    requestedItems.map((item) => [String(item.url), item])
  ).values());
  const assignmentsByUrl = new Map<string, number>();
  requestedItems.forEach((item) => {
    const key = String(item.url);
    assignmentsByUrl.set(key, (assignmentsByUrl.get(key) || 0) + 1);
  });
  const result: MediaPrefetchResult = { total: requestedItems.length, cached: 0, failed: 0 };
  try {
    const mode = activeMediaCacheMode;
    const server = mode === "cloud" ? cloudService.getApiUrl() : getServer();
    if (!uniqueItems.length) return result;
    if (!server) return { ...result, failed: result.total };

    const safeGeneration = mode === "cloud" && generation ? normalizeGeneration(generation) : undefined;
    await ensureMediaDirs(mode, safeGeneration);
    const manifest = await readManifest(mode, safeGeneration);
    const preflightCachedUrls = new Set<string>();
    if (mode === "cloud" && safeGeneration) {
      // A config update is staged into a fresh generation so the active
      // playlist can keep playing. Reuse verified files from the active
      // generation by copying them locally instead of downloading unchanged
      // media from the server again.
      const activeManifest = safeGeneration !== activeCloudCacheGeneration
        ? await readManifest("cloud", activeCloudCacheGeneration)
        : null;
      const reuseCandidates: Array<{ item: MediaItem; entry: ManifestEntry }> = [];
      const assignments = new Map<string, number>();
      requestedItems.forEach((item) => {
        const key = String(item.url || "");
        assignments.set(key, (assignments.get(key) || 0) + 1);
      });
      let requiredBytes = 0;
      for (const item of uniqueItems) {
        const cached = await isManifestEntryUsable(
          manifest[String(item.url)],
          Number(item.size || 0),
          Number(item.mtimeMs || 0),
          String(item.hash || "")
        );
        const placementCount = assignments.get(String(item.url)) || 1;
        if (cached) {
          result.cached += placementCount;
          preflightCachedUrls.add(String(item.url));
        } else {
          const previousEntry = activeManifest?.[String(item.url)];
          if (previousEntry && await isManifestEntryUsable(
            previousEntry,
            Number(item.size || 0),
            Number(item.mtimeMs || 0),
            String(item.hash || "")
          )) {
            reuseCandidates.push({ item, entry: { ...previousEntry } });
          }
          // Copying needs space in the staged generation too, so include
          // reusable media in the same free-space preflight as downloads.
          requiredBytes += Math.max(0, Number(item.size || 0));
        }
      }
      const storageInfo = await RNFS.getFSInfo();
      const freeBytes = Math.max(0, Number(storageInfo?.freeSpace || 0));
      const reserveBytes = 128 * 1024 * 1024;
      if (freeBytes > 0 && freeBytes < requiredBytes + reserveBytes) {
        result.failed = Math.max(0, result.total - result.cached);
        result.storageBlock = { freeBytes, requiredBytes, reserveBytes };
        await onProgress?.({ ...result });
        return result;
      }

      const stagedFiles = getCachePaths("cloud", safeGeneration).files;
      for (const { item, entry } of reuseCandidates) {
        const url = String(item.url || "");
        const remotePath = /^https?:\/\//i.test(url) ? url : `${server}${url}`;
        const targetPath = localPathFor(
          remotePath,
          Number(item.section || 1),
          String(item.originalName || item.name || "media.bin"),
          stagedFiles
        );
        try {
          if (await fileExists(targetPath)) await RNFS.unlink(targetPath);
          await RNFS.copyFile(entry.localPath, targetPath);
          const stagedEntry: ManifestEntry = {
            ...entry,
            url,
            localPath: targetPath,
            size: Number(item.size || entry.size || 0),
            mtimeMs: Number(item.mtimeMs || entry.mtimeMs || 0),
            hash: String(item.hash || entry.hash || "") || undefined,
            lastSeenAt: Date.now(),
          };
          const copiedFileUsable = await isManifestEntryUsable(
            stagedEntry,
            Number(item.size || 0),
            Number(item.mtimeMs || 0),
            String(item.hash || "")
          );
          if (!copiedFileUsable) throw new Error("staged-copy-verification-failed");
          manifest[url] = stagedEntry;
          result.cached += assignments.get(url) || 1;
          preflightCachedUrls.add(url);
          emitProgress(url, {
            total: Number(item.size || entry.size || 0),
            received: Number(item.size || entry.size || 0),
            percent: 100,
            updatedAt: Date.now(),
          });
        } catch {
          try {
            if (await fileExists(targetPath)) await RNFS.unlink(targetPath);
          } catch {
            // keep the normal download path as the fallback
          }
        }
      }
    }
    const videoTasks: Array<() => Promise<void>> = [];
    const otherTasks: Array<() => Promise<void>> = [];

    for (const item of uniqueItems) {
      const task = async () => {
        const assignmentCount = assignmentsByUrl.get(String(item.url)) || 1;
        if (preflightCachedUrls.has(String(item.url))) {
          await onProgress?.({ ...result });
          return;
        }
        try {
          const requiresVerifiedGeneration = mode === "cloud" && !!safeGeneration;
          const cacheEligible = requiresVerifiedGeneration
            ? Number(item.size || 0) > 0
            : shouldCacheItem(item);
          if (!cacheEligible) {
            result.failed += assignmentCount;
          } else {
            const localPathValue = await downloadIfNeededDeduped(server, item, manifest, mode, safeGeneration);
            if (localPathValue && await fileExists(localPathValue)) result.cached += assignmentCount;
            else result.failed += assignmentCount;
          }
        } catch {
          result.failed += assignmentCount;
        }
        await onProgress?.({ ...result });
      };
      if (isVideoItem(item)) {
        videoTasks.push(task);
      } else {
        otherTasks.push(task);
      }
    }

    if (otherTasks.length) {
      const prefetchConcurrency = Math.max(2, Math.min(4, getAdaptiveDownloadConcurrency()));
      await runTasksWithConcurrency(otherTasks, prefetchConcurrency);
    }
    if (videoTasks.length) {
      await runTasksWithConcurrency(videoTasks, VIDEO_DOWNLOAD_CONCURRENCY);
    }

    await writeManifest(manifest);
    return result;
  } catch {
    return { ...result, failed: Math.max(result.failed, result.total - result.cached) };
  }
}

/** Count playlist placements whose local files still pass the saved metadata checks. */
export async function verifyCachedMediaItems(items: MediaItem[], generation?: string): Promise<MediaPrefetchResult> {
  const requestedItems = (Array.isArray(items) ? items : []).filter((item) => !!item?.url);
  const result: MediaPrefetchResult = { total: requestedItems.length, cached: 0, failed: 0 };
  if (!requestedItems.length) return result;

  try {
    const safeGeneration = activeMediaCacheMode === "cloud" && generation ? normalizeGeneration(generation) : undefined;
    const manifest = await readManifest(activeMediaCacheMode, safeGeneration);
    for (const item of requestedItems) {
      if (activeMediaCacheMode === "cloud" && safeGeneration && Number(item.size || 0) <= 0) {
        result.failed += 1;
        continue;
      }
      const entry = manifest[String(item.url || "")];
      if (await isManifestEntryUsable(
        entry,
        Number(item.size || 0),
        Number(item.mtimeMs || 0),
        String(item.hash || "")
      )) {
        result.cached += 1;
      } else {
        result.failed += 1;
      }
    }
    await writeManifest(manifest);
  } catch {
    result.failed = result.total - result.cached;
  }
  return result;
}

export async function getCacheSummary() {
  try {
    const mode = activeMediaCacheMode;
    const now = Date.now();
    if (now - cacheSummaryCache.at < CACHE_SUMMARY_TTL_MS) {
      return {
        total: cacheSummaryCache.total,
        cached: cacheSummaryCache.cached,
        percent: cacheSummaryCache.percent,
      };
    }
    const list = await readListCache(mode);
    if (!Array.isArray(list) || !list.length) {
      cacheSummaryCache = { at: now, total: 0, cached: 0, percent: 0 };
      return { total: 0, cached: 0, percent: 0 };
    }
    const manifest = await readManifest(mode);
    let cached = 0;
    for (const item of list) {
      const path = String(item?.url || "");
      const entry = manifest[path];
      if (entry?.localPath && (await fileExists(entry.localPath))) {
        cached += 1;
      }
    }
    const total = list.length;
    const percent = total ? Math.round((cached / total) * 100) : 0;
    cacheSummaryCache = { at: now, total, cached, percent };
    return { total, cached, percent };
  } catch {
    return { total: 0, cached: 0, percent: 0 };
  }
}
