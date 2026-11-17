export function getMediaPathFromUrl(value: string): string | null {
  const url = String(value || '').split('?')[0];
  const marker = '/api/media/file/';
  const index = url.indexOf(marker);
  if (index < 0) return null;
  try {
    return decodeURIComponent(url.slice(index + marker.length)).replace(/^\/+/, '') || null;
  } catch {
    return null;
  }
}
