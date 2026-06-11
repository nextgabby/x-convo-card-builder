import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../lib/session.js';
import { createConversationCard, createAdsTweet, registerMediaLibrary } from '../lib/xClient.js';

const router = Router();

router.use(requireAuth);

function getUserTokens(user) {
  if (!user.oauth1_access_token || !user.oauth1_access_token_secret) return null;
  return {
    accessToken: user.oauth1_access_token,
    accessTokenSecret: user.oauth1_access_token_secret,
  };
}

// Ensure a media_key has the type prefix (e.g. "3_123" for images, "13_123" for video)
function ensureMediaKeyPrefix(key, mediaType) {
  if (!key || /^\d+_/.test(key)) return key;
  const isVid = (mediaType || '').includes('video');
  return `${isVid ? '13' : '3'}_${key}`;
}

router.post('/api/publish', async (req, res) => {
  try {
    const { cardId, postText, promotedOnly } = req.body;

    if (!cardId || !postText) {
      return res.status(400).json({ error: 'cardId and postText are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const userTokens = getUserTokens(user);
    if (!userTokens) {
      return res.status(400).json({ error: 'Ads account not connected. Please connect your X Ads account first.' });
    }

    if (!user.ad_account_id) {
      return res.status(400).json({ error: 'No ads account linked. An ads account is required to publish conversation cards.' });
    }

    const card = db
      .prepare('SELECT * FROM cards WHERE id = ? AND user_id = ?')
      .get(cardId, req.session.userId);
    if (!card) return res.status(404).json({ error: 'Card not found' });

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

    // Create tweet via Ads API with the card_uri attached
    const adsTweetRes = await createAdsTweet(user.ad_account_id, {
      text: postText,
      cardUri,
      asUserId: user.id,
      nullcast: !!promotedOnly,
      userTokens,
    });
    const tweetId = adsTweetRes.data?.id_str || adsTweetRes.data?.id;

    // Update card status
    db.prepare(`
      UPDATE cards SET
        status = 'published',
        tweet_id = ?,
        post_text = ?,
        promoted_only = ?,
        updated_at = unixepoch()
      WHERE id = ?
    `).run(tweetId || null, postText, promotedOnly ? 1 : 0, card.id);

    res.json({
      ok: true,
      tweetId,
      cardUri,
    });
  } catch (err) {
    console.error('Publish error:', err);
    const status = err.status || 500;
    res.status(status).json({ error: err.message, resetIn: err.resetIn });
  }
});

export default router;
