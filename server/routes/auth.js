import { Router } from 'express';
import crypto from 'crypto';
import db from '../db/index.js';
import {
  generatePKCE,
  getAuthUrl,
  exchangeCode,
  refreshAccessToken,
  getMe,
  getAdAccounts,
  getAccountFeatures,
  getOAuth1RequestToken,
  getOAuth1AuthorizeUrl,
  exchangeOAuth1Token,
} from '../lib/xClient.js';

const router = Router();

// --- OAuth 2.0 flow (basic user auth) ---

router.get('/auth/login', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const { verifier, challenge } = generatePKCE();

  req.session.oauthState = state;
  req.session.codeVerifier = verifier;

  const url = getAuthUrl(state, challenge);
  res.redirect(url);
});

router.get('/auth/callback', async (req, res) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

  // --- OAuth 1.0a callback (Ads account connection) ---
  if (req.query.oauth_token && req.query.oauth_verifier) {
    const { oauth_token, oauth_verifier } = req.query;

    if (!req.session?.userId) {
      return res.redirect(`${clientUrl}/dashboard?error=ads_auth_failed`);
    }

    try {
      const result = await exchangeOAuth1Token(
        oauth_token,
        req.session.oauth1TokenSecret,
        oauth_verifier
      );

      delete req.session.oauth1TokenSecret;

      // Fetch the user's ad accounts using their own tokens
      const userTokens = {
        accessToken: result.accessToken,
        accessTokenSecret: result.accessTokenSecret,
      };
      const adAccountId = await getAdAccounts(userTokens);
      if (adAccountId) {
        await getAccountFeatures(adAccountId, userTokens);
      }

      // Store user's OAuth 1.0a tokens and ad account
      db.prepare(`
        UPDATE users SET
          oauth1_access_token = ?,
          oauth1_access_token_secret = ?,
          ad_account_id = ?
        WHERE id = ?
      `).run(result.accessToken, result.accessTokenSecret, adAccountId, req.session.userId);

      console.log('[Auth] OAuth 1.0a connected for user', req.session.userId, 'ad account:', adAccountId);

      res.redirect(`${clientUrl}/dashboard?ads_connected=true`);
    } catch (err) {
      console.error('OAuth 1.0a callback error:', err);
      res.redirect(`${clientUrl}/dashboard?error=ads_auth_failed`);
    }
    return;
  }

  // --- OAuth 2.0 callback (user login) ---
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${clientUrl}?error=${encodeURIComponent(error)}`);
  }

  if (!code || state !== req.session.oauthState) {
    return res.redirect(`${clientUrl}?error=invalid_state`);
  }

  try {
    const tokens = await exchangeCode(code, req.session.codeVerifier);
    const user = await getMe(tokens.access_token);

    const expiresAt = Date.now() + tokens.expires_in * 1000;

    const upsert = db.prepare(`
      INSERT INTO users (id, username, display_name, profile_image_url, access_token, refresh_token, token_expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        display_name = excluded.display_name,
        profile_image_url = excluded.profile_image_url,
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        token_expires_at = excluded.token_expires_at
    `);

    upsert.run(
      user.id,
      user.username,
      user.name,
      user.profile_image_url,
      tokens.access_token,
      tokens.refresh_token,
      expiresAt
    );

    delete req.session.oauthState;
    delete req.session.codeVerifier;
    req.session.userId = user.id;

    res.redirect(`${clientUrl}/dashboard`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect(`${clientUrl}?error=auth_failed`);
  }
});

// --- OAuth 1.0a 3-legged flow (Ads API access) ---

router.get('/auth/ads/login', (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Must be logged in first' });
  }

  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const callbackUrl = `${clientUrl}/auth/callback`;

  getOAuth1RequestToken(callbackUrl)
    .then(({ oauthToken, oauthTokenSecret }) => {
      req.session.oauth1TokenSecret = oauthTokenSecret;
      res.redirect(getOAuth1AuthorizeUrl(oauthToken));
    })
    .catch((err) => {
      console.error('OAuth 1.0a request token error:', err);
      res.redirect(`${clientUrl}/dashboard?error=ads_auth_failed`);
    });
});

// --- Session ---

router.post('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ ok: true });
  });
});

router.get('/auth/me', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = db
    .prepare('SELECT id, username, display_name, profile_image_url, ad_account_id, oauth1_access_token, refresh_token, token_expires_at FROM users WHERE id = ?')
    .get(req.session.userId);

  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  // Refresh OAuth 2.0 token if expired (5-minute buffer)
  const FIVE_MINUTES = 5 * 60 * 1000;
  if (user.token_expires_at && user.token_expires_at < Date.now() + FIVE_MINUTES) {
    if (!user.refresh_token) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    try {
      const tokens = await refreshAccessToken(user.refresh_token);
      const expiresAt = Date.now() + tokens.expires_in * 1000;
      db.prepare(`
        UPDATE users SET access_token = ?, refresh_token = ?, token_expires_at = ? WHERE id = ?
      `).run(tokens.access_token, tokens.refresh_token, expiresAt, user.id);
    } catch {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
  }

  res.json({
    id: user.id,
    name: user.display_name,
    username: user.username,
    profileImageUrl: user.profile_image_url,
    adsConnected: !!(user.oauth1_access_token && user.ad_account_id),
  });
});

export default router;
