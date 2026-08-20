import { Router } from 'express';
import multer from 'multer';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import db from '../db/index.js';
import { requireAuth } from '../lib/session.js';
import { requireAdsUser } from '../lib/users.js';
import { sendError } from '../lib/errors.js';
import {
  uploadMediaSimple,
  uploadMediaChunked,
  registerMediaLibrary,
  getMediaLibrary,
} from '../lib/xClient.js';

const router = Router();

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 64 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_BYTES },
});

function uploadMedia(req, res, next) {
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ])(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File is too large' });
    }
    return res.status(400).json({ error: 'Upload failed' });
  });
}

router.use(requireAuth);

const ALLOWED_MEDIA_HOSTS = new Set(['video.twimg.com', 'pbs.twimg.com', 'ton.twimg.com']);

function previewDir(userId) {
  const dbPath = process.env.DATABASE_PATH || './data/cardforge.db';
  const dir = join(dirname(dbPath), 'previews', String(userId));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function safePreviewId(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

function extForMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'jpg';
}

function savePreviewFile(userId, mediaId, buffer, ext) {
  const id = safePreviewId(mediaId);
  if (!id || !buffer) return null;
  writeFileSync(join(previewDir(userId), `${id}.${ext}`), buffer);
  return `/api/media/preview/${id}`;
}

function getMediaCategory(mimeType) {
  if (mimeType.startsWith('video/')) return 'tweet_video';
  if (mimeType === 'image/gif') return 'tweet_gif';
  return 'tweet_image';
}

async function fetchAllowedMedia(url, hops = 0) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    const err = new Error('Only HTTPS media URLs are allowed');
    err.status = 403;
    throw err;
  }
  if (!ALLOWED_MEDIA_HOSTS.has(parsed.hostname)) {
    const err = new Error('Domain not allowed');
    err.status = 403;
    throw err;
  }

  const upstream = await fetch(url, { redirect: 'manual' });
  if (upstream.status >= 300 && upstream.status < 400) {
    const location = upstream.headers.get('location');
    if (!location || hops >= 3) {
      const err = new Error('Too many redirects');
      err.status = 403;
      throw err;
    }
    return fetchAllowedMedia(new URL(location, url).href, hops + 1);
  }
  return upstream;
}

router.post('/api/media/upload', uploadMedia, async (req, res) => {
  try {
    const ads = requireAdsUser(req, res);
    if (!ads) return;

    const file = req.files?.file?.[0];
    const thumbnail = req.files?.thumbnail?.[0];
    if (!file) return res.status(400).json({ error: 'No file provided' });

    const isVideo = file.mimetype.startsWith('video/');
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size > maxBytes) {
      return res.status(400).json({
        error: isVideo ? 'Video must be 64MB or smaller' : 'Image must be 15MB or smaller',
      });
    }

    const mediaCategory = getMediaCategory(file.mimetype);
    const { user, userTokens } = ads;

    let mediaId, mediaKey;
    if (!isVideo) {
      ({ mediaId, mediaKey } = await uploadMediaSimple(file.buffer, file.mimetype, mediaCategory, userTokens));
    } else {
      ({ mediaId, mediaKey } = await uploadMediaChunked(file.buffer, file.mimetype, mediaCategory, userTokens));
    }

    if (user.ad_account_id && mediaKey) {
      await registerMediaLibrary(user.ad_account_id, mediaKey, userTokens);
    }

    const previewSource = isVideo ? thumbnail : file;
    const previewUrl = previewSource
      ? savePreviewFile(user.id, mediaId, previewSource.buffer, extForMime(previewSource.mimetype))
      : null;

    console.log('[Upload] Result:', { mediaId, mediaKey, mediaType: mediaCategory, previewUrl });
    res.json({ mediaId, mediaKey, mediaType: mediaCategory, previewUrl });
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File is too large' });
    }
    sendError(res, err, 'Media upload failed');
  }
});

router.get('/api/media/studio', async (req, res) => {
  try {
    const ads = requireAdsUser(req, res);
    if (!ads) return;

    const { cursor, count = '50', q, media_type } = req.query;

    const result = await getMediaLibrary(
      ads.user.ad_account_id,
      { cursor, count: parseInt(count, 10), q, mediaType: media_type },
      ads.userTokens,
    );

    const items = result.data.map((item) => ({
      mediaKey: item.media_key,
      mediaType: item.media_type,
      mediaCategory: item.media_category,
      mediaUrl: item.media_url || null,
      posterUrl: item.poster_media_url || null,
      fileName: item.file_name || null,
      aspectRatio: item.aspect_ratio || null,
    }));

    res.json({ items, nextCursor: result.nextCursor });
  } catch (err) {
    sendError(res, err, 'Failed to load media library');
  }
});

router.get('/api/media/proxy', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url parameter' });

    const upstream = await fetchAllowedMedia(url);
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'Media unavailable' });
    }

    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    res.setHeader('Cache-Control', 'private, max-age=3600');

    const reader = upstream.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { res.end(); return; }
        if (!res.write(value)) {
          await new Promise((resolve) => res.once('drain', resolve));
        }
      }
    };
    await pump();
  } catch (err) {
    console.error('Media proxy error:', err);
    if (!res.headersSent) {
      const status = err.status || 500;
      res.status(status).json({ error: status === 403 ? err.message : 'Media proxy failed' });
    }
  }
});

router.get('/api/media/preview/:id', (req, res) => {
  const id = safePreviewId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid preview id' });

  const dir = previewDir(req.session.userId);
  const match = ['jpg', 'jpeg', 'png', 'webp', 'gif']
    .map((ext) => join(dir, `${id}.${ext}`))
    .find((file) => existsSync(file));

  if (!match) return res.status(404).json({ error: 'Preview not found' });

  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.sendFile(resolve(match));
});

router.get('/api/media/library', (req, res) => {
  const cards = db
    .prepare('SELECT media_id, cover_media_id FROM cards WHERE user_id = ? AND media_id IS NOT NULL')
    .all(req.session.userId);

  const mediaIds = new Set();
  cards.forEach((c) => {
    if (c.media_id) mediaIds.add(c.media_id);
    if (c.cover_media_id) mediaIds.add(c.cover_media_id);
  });

  res.json([...mediaIds].map((id) => ({ mediaId: id })));
});

export default router;
