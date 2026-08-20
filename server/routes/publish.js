import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../lib/session.js';
import { requireAdsUser } from '../lib/users.js';
import { sendError } from '../lib/errors.js';
import { createConversationCard, createPollCard, createJsonCard, createAdsTweet, registerMediaLibrary, getAccountFeatures } from '../lib/xClient.js';
import { parsePollChoices, pollChoicesToApiParams, validatePollForPublish } from '../lib/polls.js';
import { parseCollectionItems, validateCollectionForPublish } from '../lib/collection.js';

const router = Router();

router.use(requireAuth);

// Ensure a media_key has the type prefix (e.g. "3_123" for images, "13_123" for video)
function ensureMediaKeyPrefix(key, mediaType) {
  if (!key || /^\d+_/.test(key)) return key;
  const isVid = (mediaType || '').includes('video');
  return `${isVid ? '13' : '3'}_${key}`;
}

async function attachTweet({ user, userTokens, card, postText, promotedOnly, cardUri }) {
  const adsTweetRes = await createAdsTweet(user.ad_account_id, {
    text: postText,
    cardUri,
    asUserId: user.id,
    nullcast: !!promotedOnly,
    userTokens,
  });
  const tweetId = adsTweetRes.data?.id_str || adsTweetRes.data?.id;

  db.prepare(`
    UPDATE cards SET
      status = 'published',
      tweet_id = ?,
      post_text = ?,
      promoted_only = ?,
      updated_at = unixepoch()
    WHERE id = ?
  `).run(tweetId || null, postText, promotedOnly ? 1 : 0, card.id);

  return { ok: true, tweetId, cardUri };
}

async function publishPoll({ res, user, userTokens, card, postText, promotedOnly, draft }) {
  const choices = parsePollChoices(card.poll_choices);
  const pollError = validatePollForPublish({
    mediaKey: card.media_key,
    choices,
    durationMinutes: card.poll_duration_minutes,
  });
  if (pollError) return res.status(400).json({ error: pollError });

  // Duration starts when the X poll card is created, not when the tweet posts.
  if (draft) {
    db.prepare('UPDATE cards SET updated_at = unixepoch() WHERE id = ?').run(card.id);
    return res.json({ ok: true, localDraft: true });
  }

  let cardUri = card.x_card_uri;
  if (!cardUri) {
    const mediaKey = ensureMediaKeyPrefix(card.media_key, card.media_type);
    try {
      await registerMediaLibrary(user.ad_account_id, mediaKey, userTokens);
    } catch (e) {
      console.warn('[Publish] Poll media library registration warning:', e.message);
    }

    const features = await getAccountFeatures(user.ad_account_id, userTokens);
    if (features.length > 0 && !features.includes('PROMOTED_MEDIA_POLLS')) {
      return res.status(400).json({
        error: 'This Ads account does not have Media Forward Polls (PROMOTED_MEDIA_POLLS). Ask your X account manager to enable it.',
      });
    }

    const payload = {
      name: card.name || 'Media Poll',
      duration_in_minutes: card.poll_duration_minutes,
      media_key: mediaKey,
      ...pollChoicesToApiParams(choices),
    };

    console.log('[Publish] Creating poll card:', payload);
    const cardRes = await createPollCard(user.ad_account_id, payload, userTokens);
    cardUri = cardRes.data?.card_uri;
    if (cardUri) {
      db.prepare('UPDATE cards SET x_card_uri = ? WHERE id = ?').run(cardUri, card.id);
    }
  }

  if (cardUri) {
    cardUri = 'card://' + cardUri.replace(/^card:\/\//, '');
  }
  if (!cardUri) {
    return res.status(500).json({ error: 'Poll card creation failed. Cannot publish without a card.' });
  }

  const result = await attachTweet({ user, userTokens, card, postText, promotedOnly, cardUri });
  return res.json(result);
}

async function publishCollection({ res, user, userTokens, card, postText, promotedOnly, draft }) {
  const items = parseCollectionItems(card.collection_items).filter((item) => item.mediaKey);
  const collectionError = validateCollectionForPublish({
    mediaKey: card.media_key,
    items,
    title: card.headline,
    destinationUrl: card.destination_url,
  });
  if (collectionError) return res.status(400).json({ error: collectionError });

  // Always create a new X card. Reusing x_card_uri would republish an old
  // carousel if this collection was previously sent as slides.
  const coverKey = ensureMediaKeyPrefix(card.media_key, card.media_type);
  const itemKeys = items.map((item) => ensureMediaKeyPrefix(item.mediaKey, item.mediaType));
  for (const key of [coverKey, ...itemKeys]) {
    try {
      await registerMediaLibrary(user.ad_account_id, key, userTokens);
    } catch (e) {
      console.warn('[Publish] Collection media library registration warning:', e.message);
    }
  }

  const title = String(card.headline || '').trim();
  const destinationUrl = String(card.destination_url || '').trim();
  const slide = (mediaKey, slideTitle) => ([
    {
      title: slideTitle,
      destination: {
        url: destinationUrl,
        type: 'WEBSITE',
      },
      type: 'DETAILS',
    },
    {
      media_key: mediaKey,
      type: 'MEDIA',
    },
  ]);
  // First slide is the hero. Following slides are the thumbnails underneath.
  const payload = {
    name: card.name || 'Collection Ad',
    slides: [
      slide(coverKey, title),
      ...itemKeys.map((mediaKey) => slide(mediaKey, title)),
    ],
  };

  console.log('[Publish] Creating collection card:', payload);
  const cardRes = await createJsonCard(user.ad_account_id, payload, userTokens);
  let cardUri = cardRes.data?.card_uri;
  if (cardRes.data?.card_type) {
    console.log('[Publish] Collection card_type:', cardRes.data.card_type);
  }
  if (cardUri) {
    db.prepare('UPDATE cards SET x_card_uri = ? WHERE id = ?').run(cardUri, card.id);
  }

  if (cardUri) {
    cardUri = 'card://' + cardUri.replace(/^card:\/\//, '');
  }
  if (!cardUri) {
    return res.status(500).json({ error: 'Collection card creation failed. Cannot publish without a card.' });
  }

  if (draft) {
    db.prepare('UPDATE cards SET updated_at = unixepoch() WHERE id = ?').run(card.id);
    return res.json({ ok: true, cardUri });
  }

  const result = await attachTweet({ user, userTokens, card, postText, promotedOnly, cardUri });
  return res.json(result);
}

router.post('/api/publish', async (req, res) => {
  try {
    const { cardId, postText, promotedOnly, draft } = req.body;

    if (!cardId) {
      return res.status(400).json({ error: 'cardId is required' });
    }
    if (!draft && !postText) {
      return res.status(400).json({ error: 'postText is required when publishing' });
    }

    const ads = requireAdsUser(req, res);
    if (!ads) return;
    const { user, userTokens } = ads;

    const card = db
      .prepare('SELECT * FROM cards WHERE id = ? AND user_id = ?')
      .get(cardId, req.session.userId);
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const cardKind = card.card_type || 'conversation';
    if (cardKind === 'poll') {
      return await publishPoll({ res, user, userTokens, card, postText, promotedOnly, draft });
    }
    if (cardKind === 'collection') {
      return await publishCollection({ res, user, userTokens, card, postText, promotedOnly, draft });
    }

    // Validate required fields before calling X Ads API
    const prompts = card.prompts ? JSON.parse(card.prompts) : [];
    const validPrompts = prompts.filter(p => p.hashtag?.trim() && (p.tweetText?.trim() || p.headline?.trim()));
    if (!card.media_key) {
      return res.status(400).json({ error: 'Card media is required before publishing.' });
    }
    if (validPrompts.length < 1) {
      return res.status(400).json({ error: 'At least one CTA with a hashtag and post prompt is required.' });
    }
    if (validPrompts.length < 2 && !card.headline?.trim()) {
      return res.status(400).json({ error: 'Headline is required when using a single CTA.' });
    }
    if (!card.thank_you_text?.trim()) {
      return res.status(400).json({ error: 'Thank you text is required before publishing.' });
    }

    let cardUri = card.x_card_uri;

    // Create a Conversation Card via Ads API if one doesn't already exist
    if (!cardUri) {
      const isVideo = (card.media_type || '').includes('video');
      const mediaKey = ensureMediaKeyPrefix(card.media_key, card.media_type);
      const cardPayload = {};

      if (card.name) cardPayload.name = card.name;
      if (validPrompts.length < 2 && card.headline) {
        cardPayload.title = card.headline;
      }
      cardPayload.media_key = mediaKey;

      // Cover / unlocked media (pre-engagement display)
      if (card.cover_media_key) {
        const coverKey = ensureMediaKeyPrefix(card.cover_media_key, card.cover_media_type);

        // Ensure cover media is registered in the ads account media library
        try {
          await registerMediaLibrary(user.ad_account_id, coverKey, userTokens);
        } catch (e) {
          console.warn('[Publish] Cover media library registration warning:', e.message);
        }

        const coverIsVideo = (card.cover_media_type || '').includes('video');
        if (coverIsVideo) {
          cardPayload.unlocked_video_media_key = coverKey;
        } else {
          cardPayload.unlocked_image_media_key = coverKey;
        }
      }

      // CTA pairs
      const ordinals = ['first', 'second', 'third', 'fourth'];
      validPrompts.forEach((prompt, i) => {
        if (i >= 4) return;
        const prefix = ordinals[i];
        const hashtag = (prompt.hashtag || '').replace(/^#/, '');
        if (hashtag) cardPayload[`${prefix}_cta`] = `#${hashtag}`;
        const tweet = prompt.tweetText || prompt.headline || '';
        if (tweet) cardPayload[`${prefix}_cta_tweet`] = tweet;
      });

      cardPayload.thank_you_text = card.thank_you_text;
      if (card.thank_you_url) cardPayload.thank_you_url = card.thank_you_url;

      console.log('[Publish] Creating card:', { cardType: isVideo ? 'video_conversation' : 'image_conversation', ...cardPayload });

      const cardRes = await createConversationCard(
        user.ad_account_id,
        cardPayload,
        isVideo,
        userTokens
      );

      cardUri = cardRes.data?.card_uri;
      if (cardUri) {
        db.prepare('UPDATE cards SET x_card_uri = ? WHERE id = ?').run(cardUri, card.id);
      }
    }

    // Normalize card URI
    if (cardUri) {
      cardUri = 'card://' + cardUri.replace(/^card:\/\//, '');
    }

    if (!cardUri) {
      return res.status(500).json({ error: 'Conversation card creation failed. Cannot publish without a card.' });
    }

    // Draft mode: card created on X, skip tweet creation
    if (draft) {
      db.prepare('UPDATE cards SET updated_at = unixepoch() WHERE id = ?').run(card.id);
      return res.json({ ok: true, cardUri });
    }

    const result = await attachTweet({ user, userTokens, card, postText, promotedOnly, cardUri });
    res.json(result);
  } catch (err) {
    sendError(res, err, 'Publish failed');
  }
});

export default router;
