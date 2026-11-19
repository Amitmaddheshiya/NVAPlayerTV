const STORAGE_RESERVE_BYTES = 128 * 1024 * 1024;

const decodePath = (value: unknown): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let pathname = raw;
  try {
    pathname = new URL(raw, window.location.origin).pathname;
  } catch {
    pathname = raw.split('?')[0];
  }
  const marker = '/api/media/file/';
  const markerIndex = pathname.indexOf(marker);
  const key = markerIndex >= 0 ? pathname.slice(markerIndex + marker.length) : pathname;
  try {
    return decodeURIComponent(key).replace(/^\/+|\/+$/g, '');
  } catch {
    return key.replace(/^\/+|\/+$/g, '');
  }
};

export function estimateConfigCacheBytes(config: any, mediaList: any[]) {
  const selected = Array.from(new Set<string>(
    (Array.isArray(config?.sections) ? config.sections : [])
      .filter((section: any) => section?.contentType === 'multimedia')
      .flatMap((section: any) => Array.isArray(section?.mediaUrls) ? section.mediaUrls : [])
      .map(decodePath)
      .filter(Boolean)
  ));
  const mediaByPath = new Map<string, any>();
  (Array.isArray(mediaList) ? mediaList : []).forEach((media) => {
    [media?.path, media?.url].forEach((reference) => {
      const key = decodePath(reference);
      if (key) mediaByPath.set(key, media);
    });
  });
  let bytes = 0;
  let unknownFiles = 0;
  selected.forEach((path) => {
    const media = mediaByPath.get(path);
    const size = Math.max(0, Number(media?.size || 0));
    if (size > 0) bytes += size;
    else unknownFiles += 1;
  });
  return { bytes, unknownFiles, reserveBytes: STORAGE_RESERVE_BYTES };
}

export function getReportedFreeBytes(device: any): number | null {
  const total = Math.max(0, Number(device?.storage?.total || 0));
  const used = Math.max(0, Number(device?.storage?.used || 0));
  return total > 0 ? Math.max(0, total - used) : null;
}

export function formatStorageBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.ceil(bytes / (1024 ** 2))} MB`;
}

export function getInsufficientStorageDevices(config: any, mediaList: any[], devices: any[]) {
  const estimate = estimateConfigCacheBytes(config, mediaList);
  const requiredBytes = estimate.bytes + estimate.reserveBytes;
  const allDevices = Array.isArray(devices) ? devices : [];
  const insufficient = allDevices.flatMap((device) => {
    const freeBytes = getReportedFreeBytes(device);
    return freeBytes !== null && freeBytes < requiredBytes
      ? [{ deviceId: String(device.deviceId || ''), name: String(device.name || device.deviceId || 'TV'), freeBytes }]
      : [];
  });
  const unknownStorageDevices = allDevices
    .filter((device) => getReportedFreeBytes(device) === null)
    .map((device) => ({ deviceId: String(device.deviceId || ''), name: String(device.name || device.deviceId || 'TV') }));
  return { ...estimate, requiredBytes, insufficient, unknownStorageDevices };
}
