export function isHttpsUrl(value) {
  if (value == null || String(value).trim() === '') return true;
  try {
    const parsed = new URL(String(value).trim());
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function sanitizeHttpsUrl(value) {
  if (value == null || String(value).trim() === '') return null;
  const trimmed = String(value).trim();
  return isHttpsUrl(trimmed) ? trimmed : null;
}

export function sanitizePreviewUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('/api/media/preview/') || url.startsWith('/api/media/proxy?')) return url;
  return null;
}
