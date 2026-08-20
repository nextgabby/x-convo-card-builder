import { isHttpsUrl, sanitizePreviewUrl } from './urls.js';

export const COLLECTION_ITEM_MIN = 1;
export const COLLECTION_ITEM_MAX = 5;
export const COLLECTION_TITLE_MAX = 70;

export function parseCollectionItems(raw) {
  if (raw == null || raw === '') return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, COLLECTION_ITEM_MAX).map((item) => ({
      mediaId: item?.mediaId || item?.media_id || null,
      mediaKey: item?.mediaKey || item?.media_key || null,
      mediaType: item?.mediaType || item?.media_type || null,
      previewUrl: sanitizePreviewUrl(item?.previewUrl || item?.preview_url || '') || null,
    }));
  } catch {
    return [];
  }
}

export function serializeCollectionItems(items) {
  return JSON.stringify(parseCollectionItems(items));
}

export function validateCollectionForPublish({ mediaKey, items, title, destinationUrl }) {
  if (!mediaKey) return 'Cover media is required before publishing a collection ad.';
  const filled = parseCollectionItems(items).filter((item) => item.mediaKey);
  if (filled.length < COLLECTION_ITEM_MIN || filled.length > COLLECTION_ITEM_MAX) {
    return `A collection ad needs ${COLLECTION_ITEM_MIN}–${COLLECTION_ITEM_MAX} thumbnail images.`;
  }
  const keys = [mediaKey, ...filled.map((item) => item.mediaKey)].filter(Boolean);
  if (new Set(keys).size !== keys.length) {
    return 'Each collection slide must use a different image.';
  }
  if (!String(title || '').trim()) return 'A collection title is required.';
  if (String(title).trim().length > COLLECTION_TITLE_MAX) {
    return `Collection title must be ${COLLECTION_TITLE_MAX} characters or fewer.`;
  }
  if (!destinationUrl?.trim()) return 'A https destination URL is required.';
  if (!isHttpsUrl(destinationUrl)) return 'Destination URL must use https.';
  return null;
}
