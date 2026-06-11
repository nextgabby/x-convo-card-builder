import { Router } from 'express';
import multer from 'multer';
import db from '../db/index.js';
import { requireAuth } from '../lib/session.js';
import {
  uploadMediaSimple,
  uploadMediaChunked,
  registerMediaLibrary,
  getMediaLibrary,
} from '../lib/xClient.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024 * 1024 } });

router.use(requireAuth);

function getUser(userId) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

function getMediaCategory(mimeType) {
  if (mimeType.startsWith('video/')) return 'tweet_video';
  if (mimeType === 'image/gif') return 'tweet_gif';
  return 'tweet_image';
}

router.post('/api/media/upload', upload.single('file'), async (req, res) => {
  try {
    const user = getUser(req.session.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    const isVideo = file.mimetype.startsWith('video/');
    const mediaCategory = getMediaCategory(file.mimetype);

    // Use user's own OAuth 1.0a tokens if available, fall back to app tokens
    const userTokens = (user.oauth1_access_token && user.oauth1_access_token_secret)
      ? { accessToken: user.oauth1_access_token, accessTokenSecret: user.oauth1_access_token_secret }
      : null;

    // Upload via v1.1 with OAuth 1.0a (required for Ads API compatibility)
    let mediaId, mediaKey;
    if (!isVideo) {
      ({ mediaId, mediaKey } = await uploadMediaSimple(file.buffer, file.mimetype, mediaCategory, userTokens));
    } else {
      ({ mediaId, mediaKey } = await uploadMediaChunked(file.buffer, file.mimetype, mediaCategory, userTokens));
    }

    // Register in ad account media library if user has an ad account
    if (user.ad_account_id && mediaKey) {
      await registerMediaLibrary(user.ad_account_id, mediaKey, userTokens);
    }

    console.log('[Upload] Result:', { mediaId, mediaKey, mediaType: mediaCategory });
    res.json({ mediaId, mediaKey, mediaType: mediaCategory });
  } catch (err) {
    console.error('Media upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/media/studio', async (req, res) => {
  try {
    const user = getUser(req.session.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });

    if (!user.oauth1_access_token || !user.oauth1_access_token_secret || !user.ad_account_id) {
      return res.status(403).json({ error: 'Ads account not connected' });
    }

    const userTokens = {
      accessToken: user.oauth1_access_token,
      accessTokenSecret: user.oauth1_access_token_secret,
    };

    const { cursor, count = '50', q, media_type } = req.query;

    const result = await getMediaLibrary(
      user.ad_account_id,
      { cursor, count: parseInt(count, 10), q, mediaType: media_type },
      userTokens,
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
    console.error('Media studio fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Proxy authenticated media URLs (video.twimg.com, pbs.twimg.com) so the
// browser can load them without hitting CORS / auth 403s.
router.get('/api/media/proxy', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url parameter' });

    const parsed = new URL(url);
    const allowed = ['video.twimg.com', 'pbs.twimg.com', 'ton.twimg.com'];
    if (!allowed.includes(parsed.hostname)) {
      return res.status(403).json({ error: 'Domain not allowed' });
    }

    const upstream = await fetch(url);
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream returned ${upstream.status}` });
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
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
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
