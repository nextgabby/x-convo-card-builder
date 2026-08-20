import db from '../db/index.js';
import { decryptToken, encryptToken, isEncrypted } from './crypto.js';

const TOKEN_FIELDS = [
  'access_token',
  'refresh_token',
  'oauth1_access_token',
  'oauth1_access_token_secret',
];

function persistEncrypted(user) {
  if (!process.env.TOKEN_ENCRYPTION_KEY) return;
  db.prepare(`
    UPDATE users SET
      access_token = ?,
      refresh_token = ?,
      oauth1_access_token = ?,
      oauth1_access_token_secret = ?
    WHERE id = ?
  `).run(
    encryptToken(user.access_token) || '',
    encryptToken(user.refresh_token),
    encryptToken(user.oauth1_access_token),
    encryptToken(user.oauth1_access_token_secret),
    user.id
  );
}

function hydrateUser(row) {
  if (!row) return null;
  const user = { ...row };
  let needsReencrypt = false;

  for (const field of TOKEN_FIELDS) {
    const stored = user[field];
    if (!stored) continue;
    if (!isEncrypted(stored) && process.env.TOKEN_ENCRYPTION_KEY) {
      needsReencrypt = true;
    }
    user[field] = decryptToken(stored);
  }

  if (needsReencrypt) persistEncrypted(user);
  return user;
}

export function getUser(userId) {
  if (!userId) return null;
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  return hydrateUser(row);
}

export function upsertOAuth2User(user, accessToken, refreshToken, expiresAt) {
  db.prepare(`
    INSERT INTO users (id, username, display_name, profile_image_url, access_token, refresh_token, token_expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
      display_name = excluded.display_name,
      profile_image_url = excluded.profile_image_url,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      token_expires_at = excluded.token_expires_at
  `).run(
    user.id,
    user.username,
    user.name,
    user.profile_image_url,
    encryptToken(accessToken) || '',
    encryptToken(refreshToken),
    expiresAt
  );
}

export function updateOAuth2Tokens(userId, accessToken, refreshToken, expiresAt) {
  db.prepare(`
    UPDATE users SET access_token = ?, refresh_token = ?, token_expires_at = ? WHERE id = ?
  `).run(encryptToken(accessToken) || '', encryptToken(refreshToken), expiresAt, userId);
}

export function setOAuth1(userId, accessToken, accessTokenSecret, adAccountId) {
  db.prepare(`
    UPDATE users SET
      oauth1_access_token = ?,
      oauth1_access_token_secret = ?,
      ad_account_id = ?
    WHERE id = ?
  `).run(
    encryptToken(accessToken),
    encryptToken(accessTokenSecret),
    adAccountId || null,
    userId
  );
}

export function setAdAccountId(userId, adAccountId) {
  db.prepare('UPDATE users SET ad_account_id = ? WHERE id = ?').run(adAccountId, userId);
}

export function clearUserTokens(userId) {
  db.prepare(`
    UPDATE users SET
      access_token = '',
      refresh_token = NULL,
      token_expires_at = NULL,
      oauth1_access_token = NULL,
      oauth1_access_token_secret = NULL,
      ad_account_id = NULL
    WHERE id = ?
  `).run(userId);
}

export function getUserTokens(user) {
  if (!user?.oauth1_access_token || !user?.oauth1_access_token_secret) return null;
  return {
    accessToken: user.oauth1_access_token,
    accessTokenSecret: user.oauth1_access_token_secret,
  };
}

export function requireAdsUser(req, res) {
  const user = getUser(req.session.userId);
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  const userTokens = getUserTokens(user);
  if (!userTokens) {
    res.status(403).json({ error: 'Ads account not connected' });
    return null;
  }
  if (!user.ad_account_id) {
    res.status(403).json({ error: 'Select an ads account before continuing' });
    return null;
  }
  return { user, userTokens };
}
