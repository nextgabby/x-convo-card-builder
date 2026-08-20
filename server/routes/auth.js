import { Router } from 'express';
import crypto from 'crypto';
import {
  generatePKCE,
  getAuthUrl,
  exchangeCode,
  refreshAccessToken,
  revokeOAuth2Token,
  getMe,
  listAdAccounts,
  getAccountFeatures,
  getOAuth1RequestToken,
  getOAuth1AuthorizeUrl,
  exchangeOAuth1Token,
} from '../lib/xClient.js';
import { safeEqual } from '../lib/crypto.js';
import {
  getUser,
  upsertOAuth2User,
  updateOAuth2Tokens,
  setOAuth1,
  setAdAccountId,
  clearUserTokens,
  getUserTokens,
} from '../lib/users.js';
import {
  requireAuth,
  saveSession,
  regenerateSession,
  destroySession,
} from '../lib/session.js';

const router = Router();

const refreshInflight = new Map();

function clientUrl() {
  return process.env.CLIENT_URL || 'http://localhost:5173';
}

async function establishSession(req, userId) {
  await regenerateSession(req);
  req.session.userId = userId;
  await saveSession(req);
}

async function refreshUserTokens(user) {
  const existing = refreshInflight.get(user.id);
  if (existing) {
    await existing;
    return getUser(user.id);
  }

  const pending = (async () => {
    const tokens = await refreshAccessToken(user.refresh_token);
    const expiresAt = Date.now() + tokens.expires_in * 1000;
    updateOAuth2Tokens(user.id, tokens.access_token, tokens.refresh_token, expiresAt);
  })();

  refreshInflight.set(user.id, pending);
  try {
    await pending;
  } finally {
    refreshInflight.delete(user.id);
  }
  return getUser(user.id);
}

// --- OAuth 2.0 flow (basic user auth) ---

router.get('/auth/login', async (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const { verifier, challenge } = generatePKCE();

  req.session.oauthState = state;
  req.session.codeVerifier = verifier;

  try {
    await saveSession(req);
    res.redirect(getAuthUrl(state, challenge));
  } catch (err) {
    console.error('Failed to persist login session:', err);
    res.redirect(`${clientUrl()}?error=auth_failed`);
  }
});

router.get('/auth/callback', async (req, res) => {
  const origin = clientUrl();

  // --- OAuth 1.0a callback (Ads account connection) ---
  if (req.query.oauth_token && req.query.oauth_verifier) {
    const { oauth_token, oauth_verifier } = req.query;

    if (!req.session?.userId) {
      return res.redirect(`${origin}/dashboard?error=ads_auth_failed`);
    }

    if (!safeEqual(String(oauth_token), String(req.session.oauth1Token || ''))) {
      return res.redirect(`${origin}/dashboard?error=ads_auth_failed`);
    }

    try {
      const result = await exchangeOAuth1Token(
        oauth_token,
        req.session.oauth1TokenSecret,
        oauth_verifier
      );

      const userId = req.session.userId;
      const userTokens = {
        accessToken: result.accessToken,
        accessTokenSecret: result.accessTokenSecret,
      };

      const accounts = await listAdAccounts(userTokens);
      const adAccountId = accounts.length === 1 ? accounts[0].id : null;
      if (adAccountId) {
        await getAccountFeatures(adAccountId, userTokens);
      }

      setOAuth1(userId, result.accessToken, result.accessTokenSecret, adAccountId);

      await establishSession(req, userId);

      console.log('[Auth] OAuth 1.0a connected for user', userId, 'ad account:', adAccountId);

      if (accounts.length === 0) {
        return res.redirect(`${origin}/dashboard?error=no_ads_account`);
      }
      if (!adAccountId) {
        return res.redirect(`${origin}/dashboard?select_ads=true`);
      }
      res.redirect(`${origin}/dashboard?ads_connected=true`);
    } catch (err) {
      console.error('OAuth 1.0a callback error:', err);
      res.redirect(`${origin}/dashboard?error=ads_auth_failed`);
    }
    return;
  }

  // --- OAuth 2.0 callback (user login) ---
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${origin}?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state || !req.session.oauthState || !safeEqual(String(state), String(req.session.oauthState))) {
    return res.redirect(`${origin}?error=invalid_state`);
  }

  try {
    const tokens = await exchangeCode(code, req.session.codeVerifier);
    const user = await getMe(tokens.access_token);
    const expiresAt = Date.now() + tokens.expires_in * 1000;

    upsertOAuth2User(user, tokens.access_token, tokens.refresh_token, expiresAt);
    await establishSession(req, user.id);

    res.redirect(`${origin}/dashboard`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect(`${origin}?error=auth_failed`);
  }
});

// --- OAuth 1.0a 3-legged flow (Ads API access) ---

router.get('/auth/ads/login', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Must be logged in first' });
  }

  const origin = clientUrl();
  const callbackUrl = process.env.X_REDIRECT_URI;

  try {
    const { oauthToken, oauthTokenSecret } = await getOAuth1RequestToken(callbackUrl);
    req.session.oauth1Token = oauthToken;
    req.session.oauth1TokenSecret = oauthTokenSecret;
    await saveSession(req);
    res.redirect(getOAuth1AuthorizeUrl(oauthToken));
  } catch (err) {
    console.error('OAuth 1.0a request token error:', err);
    res.redirect(`${origin}/dashboard?error=ads_auth_failed`);
  }
});

router.get('/auth/ads/accounts', requireAuth, async (req, res) => {
  try {
    const user = getUser(req.session.userId);
    const userTokens = getUserTokens(user);
    if (!userTokens) {
      return res.status(403).json({ error: 'Ads account not connected' });
    }
    const accounts = await listAdAccounts(userTokens);
    res.json({ accounts, selectedId: user.ad_account_id || null });
  } catch (err) {
    console.error('Ads account list error:', err);
    res.status(500).json({ error: 'Failed to load ads accounts' });
  }
});

router.post('/auth/ads/account', requireAuth, async (req, res) => {
  try {
    const { adAccountId } = req.body || {};
    if (!adAccountId) {
      return res.status(400).json({ error: 'adAccountId is required' });
    }

    const user = getUser(req.session.userId);
    const userTokens = getUserTokens(user);
    if (!userTokens) {
      return res.status(403).json({ error: 'Ads account not connected' });
    }

    const accounts = await listAdAccounts(userTokens);
    if (!accounts.some((a) => a.id === adAccountId)) {
      return res.status(400).json({ error: 'Invalid ads account' });
    }

    setAdAccountId(user.id, adAccountId);
    await getAccountFeatures(adAccountId, userTokens);
    res.json({ ok: true, adAccountId });
  } catch (err) {
    console.error('Ads account select error:', err);
    res.status(500).json({ error: 'Failed to select ads account' });
  }
});

// --- Session ---

router.post('/auth/logout', async (req, res) => {
  const userId = req.session?.userId;
  try {
    if (userId) {
      const user = getUser(userId);
      if (user?.refresh_token) {
        try {
          await revokeOAuth2Token(user.refresh_token);
        } catch (err) {
          console.error('Token revoke error:', err);
        }
      }
      clearUserTokens(userId);
    }
  } catch (err) {
    console.error('Logout cleanup error:', err);
  }

  try {
    await destroySession(req, res);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to logout' });
  }
});

router.get('/auth/me', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  let user = getUser(req.session.userId);
  if (!user) {
    try { await destroySession(req, res); } catch { /* ignore */ }
    return res.status(401).json({ error: 'User not found' });
  }

  const FIVE_MINUTES = 5 * 60 * 1000;
  if (user.token_expires_at && user.token_expires_at < Date.now() + FIVE_MINUTES) {
    if (!user.refresh_token) {
      try { await destroySession(req, res); } catch { /* ignore */ }
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    try {
      user = await refreshUserTokens(user);
    } catch (err) {
      console.error('Token refresh error:', err);
      try {
        clearUserTokens(user.id);
        await destroySession(req, res);
      } catch { /* ignore */ }
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
  }

  res.json({
    id: user.id,
    name: user.display_name,
    username: user.username,
    profileImageUrl: user.profile_image_url,
    adsConnected: !!(user.oauth1_access_token && user.ad_account_id),
    needsAdsAccount: !!(user.oauth1_access_token && !user.ad_account_id),
  });
});

export default router;
