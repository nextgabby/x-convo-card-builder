import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db/index.js';
import { requireAuth } from '../lib/session.js';
import { getConversationCard, listConversationCards } from '../lib/xClient.js';

const router = Router();

router.use(requireAuth);

router.get('/api/cards', (req, res) => {
  const cards = db
    .prepare('SELECT * FROM cards WHERE user_id = ? ORDER BY updated_at DESC')
    .all(req.session.userId);

  const parsed = cards.map((c) => ({
    ...c,
    prompts: c.prompts ? JSON.parse(c.prompts) : [],
    promotedOnly: !!c.promoted_only,
  }));

  res.json(parsed);
});

router.get('/api/cards/:id', (req, res) => {
  const card = db
    .prepare('SELECT * FROM cards WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);

  if (!card) {
    return res.status(404).json({ error: 'Card not found' });
  }

  res.json({
    ...card,
    prompts: card.prompts ? JSON.parse(card.prompts) : [],
    promotedOnly: !!card.promoted_only,
  });
});

router.post('/api/cards', (req, res) => {
  const id = uuid();
  const {
    name,
    headline,
    mediaId,
    mediaKey,
    mediaType,
    coverMediaId,
    coverMediaKey,
    coverMediaType,
    mediaPreviewUrl,
    prompts,
    thankYouText,
    thankYouUrl,
    postText,
    promotedOnly,
  } = req.body;

  db.prepare(`
    INSERT INTO cards (id, user_id, name, headline, media_id, media_key, media_type, cover_media_id, cover_media_key, cover_media_type, media_preview_url, prompts, thank_you_text, thank_you_url, post_text, promoted_only)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    req.session.userId,
    name || null,
    headline || null,
    mediaId || null,
    mediaKey || null,
    mediaType || null,
    coverMediaId || null,
    coverMediaKey || null,
    coverMediaType || null,
    mediaPreviewUrl || null,
    prompts ? JSON.stringify(prompts) : null,
    thankYouText || null,
    thankYouUrl || null,
    postText || null,
    promotedOnly !== undefined ? (promotedOnly ? 1 : 0) : 1
  );

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
  res.status(201).json({
    ...card,
    prompts: card.prompts ? JSON.parse(card.prompts) : [],
    promotedOnly: !!card.promoted_only,
  });
});

router.put('/api/cards/:id', (req, res) => {
  const existing = db
    .prepare('SELECT * FROM cards WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);

  if (!existing) {
    return res.status(404).json({ error: 'Card not found' });
  }

  const {
    name,
    headline,
    mediaId,
    mediaKey,
    mediaType,
    coverMediaId,
    coverMediaKey,
    coverMediaType,
    mediaPreviewUrl,
    prompts,
    thankYouText,
    thankYouUrl,
    postText,
    promotedOnly,
    status,
  } = req.body;

  db.prepare(`
    UPDATE cards SET
      name = ?,
      headline = ?,
      media_id = ?,
      media_key = ?,
      media_type = ?,
      cover_media_id = ?,
      cover_media_key = ?,
      cover_media_type = ?,
      media_preview_url = ?,
      prompts = ?,
      thank_you_text = ?,
      thank_you_url = ?,
      post_text = ?,
      promoted_only = ?,
      status = ?,
      updated_at = unixepoch()
    WHERE id = ? AND user_id = ?
  `).run(
    name !== undefined ? name : existing.name,
    headline !== undefined ? headline : existing.headline,
    mediaId !== undefined ? mediaId : existing.media_id,
    mediaKey !== undefined ? mediaKey : existing.media_key,
    mediaType !== undefined ? mediaType : existing.media_type,
    coverMediaId !== undefined ? coverMediaId : existing.cover_media_id,
    coverMediaKey !== undefined ? coverMediaKey : existing.cover_media_key,
    coverMediaType !== undefined ? coverMediaType : existing.cover_media_type,
    mediaPreviewUrl !== undefined ? mediaPreviewUrl : existing.media_preview_url,
    prompts !== undefined ? JSON.stringify(prompts) : existing.prompts,
    thankYouText !== undefined ? thankYouText : existing.thank_you_text,
    thankYouUrl !== undefined ? thankYouUrl : existing.thank_you_url,
    postText !== undefined ? postText : existing.post_text,
    promotedOnly !== undefined ? (promotedOnly ? 1 : 0) : existing.promoted_only,
    status || existing.status,
    req.params.id,
    req.session.userId
  );

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  res.json({
    ...card,
    prompts: card.prompts ? JSON.parse(card.prompts) : [],
    promotedOnly: !!card.promoted_only,
  });
});

router.delete('/api/cards/:id', (req, res) => {
  const result = db
    .prepare('DELETE FROM cards WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.session.userId);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Card not found' });
  }

  res.json({ ok: true });
});

// Fetch a published card's details from the X Ads API
router.get('/api/cards/:id/x-card', async (req, res) => {
  try {
    const card = db
      .prepare('SELECT * FROM cards WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.session.userId);

    if (!card) return res.status(404).json({ error: 'Card not found' });
    if (!card.x_card_uri) return res.status(400).json({ error: 'Card has not been published yet' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    if (!user?.oauth1_access_token || !user?.ad_account_id) {
      return res.status(403).json({ error: 'Ads account not connected' });
    }

    const userTokens = {
      accessToken: user.oauth1_access_token,
      accessTokenSecret: user.oauth1_access_token_secret,
    };

    // Extract card ID from card_uri (e.g. "card://12345" -> "12345")
    const xCardId = card.x_card_uri.replace(/^card:\/\//, '');
    const isVideo = (card.media_type || '').includes('video');

    const xCard = await getConversationCard(user.ad_account_id, xCardId, isVideo, userTokens);
    res.json(xCard);
  } catch (err) {
    console.error('X card fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// List all conversation cards from the X Ads API
router.get('/api/x-cards', async (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    if (!user?.oauth1_access_token || !user?.ad_account_id) {
      return res.status(403).json({ error: 'Ads account not connected' });
    }

    const userTokens = {
      accessToken: user.oauth1_access_token,
      accessTokenSecret: user.oauth1_access_token_secret,
    };

    const { type = 'image_conversation', cursor, count } = req.query;
    const result = await listConversationCards(
      user.ad_account_id,
      type,
      { cursor, count: count ? parseInt(count, 10) : 50 },
      userTokens
    );

    res.json(result);
  } catch (err) {
    console.error('X cards list error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
