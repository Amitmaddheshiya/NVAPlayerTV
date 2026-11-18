/** Add device-scoped Cloud credentials to a media file URL without changing
 * its path or existing query parameters. The plain media URL stays separate
 * for cache identity; playback uses this authenticated URL. */
export function addCloudDeviceAccess(value: string, deviceId: string, deviceToken = ''): string {
  const url = String(value || '');
  if (!deviceId || !url.includes('/api/media/file/')) return url;

  const hashIndex = url.indexOf('#');
  const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const fragment = hashIndex >= 0 ? url.slice(hashIndex) : '';
  const queryIndex = withoutHash.indexOf('?');
  const base = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : '';
  const params = new URLSearchParams(query);

  params.set('deviceId', deviceId);
  if (deviceToken) params.set('deviceToken', deviceToken);
  else params.delete('deviceToken');

  return `${base}?${params.toString()}${fragment}`;
}
