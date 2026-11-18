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

export function normalizeUserFolder(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return 'general';
  if (raw.length > 200 || raw.startsWith('/') || /^[a-z]:/i.test(raw) || /[\u0000-\u001f]/.test(raw)) return null;
  const segments = raw.replace(/\\/g, '/').split('/');
  if (segments.some((segment) => {
    const trimmed = segment.trim();
    return !trimmed || trimmed === '.' || trimmed === '..' || trimmed.length > 100 ||
      /[<>:"|?*]/.test(trimmed) || /[. ]$/.test(trimmed) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(trimmed);
  })) return null;
  return segments.map((segment) => segment.trim()).join('/');
}
