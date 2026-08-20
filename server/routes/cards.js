import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db/index.js';
import { requireAuth } from '../lib/session.js';
import { requireAdsUser } from '../lib/users.js';
import { sendError } from '../lib/errors.js';
import { isHttpsUrl, sanitizePreviewUrl } from '../lib/urls.js';
import { getAccountFeatures, getConversationCard, listConversationCards } from '../lib/xClient.js';
import { parsePollChoices } from '../lib/polls.js';
import { parseCollectionItems, serializeCollectionItems } from '../lib/collection.js';

function nextPreviewUrl(incoming, existing) {
  if (incoming === undefined) return existing;
  if (incoming == null || incoming === '') return null;
  return sanitizePreviewUrl(incoming) || existing || null;
}

function normalizeCardType(value, fallback = 'conversation') {
  if (value === 'poll' || value === 'collection') return value;
  return fallback;
}

function toClientCard(card) {
  return {
    ...card,
    prompts: card.prompts ? JSON.parse(card.prompts) : [],
    pollChoices: parsePollChoices(card.poll_choices),
    pollDurationMinutes: card.poll_duration_minutes ?? null,
    collectionItems: parseCollectionItems(card.collection_items),
    destinationUrl: card.destination_url || null,
    promotedOnly: !!card.promoted_only,
    cardType: card.card_type || 'conversation',
  };
}

const router = Router();

router.use(requireAuth);

router.get('/api/cards', (req, res) => {
  const cards = db
    .prepare('SELECT * FROM cards WHERE user_id = ? ORDER BY updated_at DESC')
    .all(req.session.userId);

  res.json(cards.map(toClientCard));
});

router.get('/api/cards/:id', (req, res) => {
  const card = db
    .prepare('SELECT * FROM cards WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);

  if (!card) {
    return res.status(404).json({ error: 'Card not found' });
  }

  res.json(toClientCard(card));
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
    cardType,
    pollChoices,
    pollDurationMinutes,
    collectionItems,
    destinationUrl,
  } = req.body;

  if (thankYouUrl && !isHttpsUrl(thankYouUrl)) {
    return res.status(400).json({ error: 'Thank you URL must use https' });
  }
  if (destinationUrl && !isHttpsUrl(destinationUrl)) {
    return res.status(400).json({ error: 'Destination URL must use https' });
  }

  db.prepare(`
    INSERT INTO cards (id, user_id, card_type, name, headline, media_id, media_key, media_type, cover_media_id, cover_media_key, cover_media_type, media_preview_url, prompts, thank_you_text, thank_you_url, post_text, poll_choices, poll_duration_minutes, collection_items, destination_url, promoted_only)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    req.session.userId,
    normalizeCardType(cardType),
    name || null,
    headline || null,
    mediaId || null,
    mediaKey || null,
    mediaType || null,
    coverMediaId || null,
    coverMediaKey || null,
    coverMediaType || null,
    nextPreviewUrl(mediaPreviewUrl, null),
    prompts ? JSON.stringify(prompts) : null,
    thankYouText || null,
    thankYouUrl || null,
    postText || null,
    pollChoices !== undefined ? JSON.stringify(parsePollChoices(pollChoices)) : null,
    pollDurationMinutes != null && pollDurationMinutes !== '' ? Number(pollDurationMinutes) : null,
    collectionItems !== undefined ? serializeCollectionItems(collectionItems) : null,
    destinationUrl || null,
    promotedOnly !== undefined ? (promotedOnly ? 1 : 0) : 1
  );

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
  res.status(201).json(toClientCard(card));
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
    pollChoices,
    pollDurationMinutes,
    collectionItems,
    destinationUrl,
    status,
  } = req.body;

  if (thankYouUrl !== undefined && thankYouUrl && !isHttpsUrl(thankYouUrl)) {
    return res.status(400).json({ error: 'Thank you URL must use https' });
  }
  if (destinationUrl !== undefined && destinationUrl && !isHttpsUrl(destinationUrl)) {
    return res.status(400).json({ error: 'Destination URL must use https' });
  }

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
      poll_choices = ?,
      poll_duration_minutes = ?,
      collection_items = ?,
      destination_url = ?,
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
    nextPreviewUrl(mediaPreviewUrl, existing.media_preview_url),
    prompts !== undefined ? JSON.stringify(prompts) : existing.prompts,
    thankYouText !== undefined ? thankYouText : existing.thank_you_text,
    thankYouUrl !== undefined ? thankYouUrl : existing.thank_you_url,
    postText !== undefined ? postText : existing.post_text,
    pollChoices !== undefined ? JSON.stringify(parsePollChoices(pollChoices)) : existing.poll_choices,
    pollDurationMinutes !== undefined
      ? (pollDurationMinutes != null && pollDurationMinutes !== '' ? Number(pollDurationMinutes) : null)
      : existing.poll_duration_minutes,
    collectionItems !== undefined ? serializeCollectionItems(collectionItems) : existing.collection_items,
    destinationUrl !== undefined ? (destinationUrl || null) : existing.destination_url,
    promotedOnly !== undefined ? (promotedOnly ? 1 : 0) : existing.promoted_only,
    status || existing.status,
    req.params.id,
    req.session.userId
  );

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  res.json(toClientCard(card));
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

    const ads = requireAdsUser(req, res);
    if (!ads) return;

    // Extract card ID from card_uri (e.g. "card://12345" -> "12345")
    const xCardId = card.x_card_uri.replace(/^card:\/\//, '');
    const isVideo = (card.media_type || '').includes('video');

    const xCard = await getConversationCard(ads.user.ad_account_id, xCardId, isVideo, ads.userTokens);
    res.json(xCard);
  } catch (err) {
    sendError(res, err, 'Failed to fetch card from X');
  }
});

// List all conversation cards from the X Ads API
router.get('/api/x-cards', async (req, res) => {
  try {
    const ads = requireAdsUser(req, res);
    if (!ads) return;

    const { type = 'image_conversation', cursor, count } = req.query;
    const result = await listConversationCards(
      ads.user.ad_account_id,
      type,
      { cursor, count: count ? parseInt(count, 10) : 50 },
      ads.userTokens
    );

    res.json(result);
  } catch (err) {
    sendError(res, err, 'Failed to list cards from X');
  }
});

router.get('/api/account/features', async (req, res) => {
  try {
    const ads = requireAdsUser(req, res);
    if (!ads) return;
    const features = await getAccountFeatures(ads.user.ad_account_id, ads.userTokens);
    res.json({
      features,
      mediaPolls: features.includes('PROMOTED_MEDIA_POLLS'),
    });
  } catch (err) {
    sendError(res, err, 'Failed to load account features');
  }
});

export default router;
