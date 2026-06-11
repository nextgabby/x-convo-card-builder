import crypto from 'crypto';

const X_AUTH_URL = 'https://x.com/i/oauth2/authorize';
const X_TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const X_API_BASE = 'https://api.x.com/2';
const X_ADS_BASE = 'https://ads-api.x.com/12';

const SCOPES = 'tweet.read tweet.write media.write users.read offline.access';

// --- OAuth 1.0a signing (required for Ads API) ---

function percentEncode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function generateOAuth1Header(method, url, params = {}, accessToken, tokenSecret) {
  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_KEY_SECRET;

  if (!consumerKey || !accessToken) return null;

  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
  };

  const allParams = { ...oauthParams, ...params };
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys.map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`).join('&');

  const baseString = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret || '')}`;

  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
  oauthParams.oauth_signature = signature;

  const header = 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(', ');

  return header;
}

// Pick the right OAuth 1.0a token source based on whether user tokens are provided
function getOAuth1Header(method, url, params = {}, userTokens = null) {
  const accessToken = userTokens ? userTokens.accessToken : process.env.X_ACCESS_TOKEN;
  const tokenSecret = userTokens ? userTokens.accessTokenSecret : process.env.X_ACCESS_TOKEN_SECRET;
  return generateOAuth1Header(method, url, params, accessToken, tokenSecret);
}

// --- OAuth 1.0a 3-legged flow (for users to connect their own Ads accounts) ---

export async function getOAuth1RequestToken(callbackUrl) {
  const url = 'https://api.x.com/oauth/request_token';
  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_KEY_SECRET;

  const oauthParams = {
    oauth_callback: callbackUrl,
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: '1.0',
  };

  const allParams = { ...oauthParams };
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys.map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`).join('&');

  const baseString = `POST&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(consumerSecret)}&`;

  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
  oauthParams.oauth_signature = signature;

  const header = 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(', ');

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: header },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Request token failed: ${err}`);
  }

  const body = await res.text();
  const parsed = Object.fromEntries(new URLSearchParams(body));
  return {
    oauthToken: parsed.oauth_token,
    oauthTokenSecret: parsed.oauth_token_secret,
  };
}

export function getOAuth1AuthorizeUrl(oauthToken) {
  return `https://api.x.com/oauth/authorize?oauth_token=${oauthToken}`;
}

export async function exchangeOAuth1Token(oauthToken, oauthTokenSecret, oauthVerifier) {
  const url = 'https://api.x.com/oauth/access_token';
  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_KEY_SECRET;

  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: oauthToken,
    oauth_verifier: oauthVerifier,
    oauth_version: '1.0',
  };

  const sortedKeys = Object.keys(oauthParams).sort();
  const paramString = sortedKeys.map((k) => `${percentEncode(k)}=${percentEncode(oauthParams[k])}`).join('&');

  const baseString = `POST&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(oauthTokenSecret)}`;

  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
  oauthParams.oauth_signature = signature;

  const header = 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(', ');

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: header },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Access token exchange failed: ${err}`);
  }

  const body = await res.text();
  const parsed = Object.fromEntries(new URLSearchParams(body));
  return {
    accessToken: parsed.oauth_token,
    accessTokenSecret: parsed.oauth_token_secret,
    userId: parsed.user_id,
    screenName: parsed.screen_name,
  };
}

export function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

export function getAuthUrl(state, codeChallenge) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.X_CLIENT_ID,
    redirect_uri: process.env.X_REDIRECT_URI,
    scope: SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${X_AUTH_URL}?${params}`;
}

export async function exchangeCode(code, codeVerifier) {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.X_REDIRECT_URI,
    code_verifier: codeVerifier,
  });

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${auth}`,
    },
    body: params,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  return res.json();
}

export async function refreshAccessToken(refreshToken) {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${auth}`,
    },
    body: params,
  });

  if (!res.ok) {
    throw new Error('Failed to refresh token');
  }

  return res.json();
}

export async function getMe(accessToken) {
  const res = await fetch(`${X_API_BASE}/users/me?user.fields=profile_image_url,name,username`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch user');
  }

  const { data } = await res.json();
  return data;
}

export async function getAdAccounts(userTokens = null) {
  try {
    const url = `${X_ADS_BASE}/accounts`;
    const authHeader = getOAuth1Header('GET', url, {}, userTokens);

    if (!authHeader) {
      console.log('[Ads] OAuth 1.0a credentials not configured, skipping ads account fetch');
      return null;
    }

    const res = await fetch(url, {
      headers: { Authorization: authHeader },
    });

    console.log('[Ads] Fetching ad accounts, status:', res.status);

    if (!res.ok) {
      const err = await res.text();
      console.error('[Ads] Failed to fetch ad accounts:', res.status, err);
      return null;
    }

    const body = await res.json();
    const accounts = body.data || [];
    console.log('[Ads] Ad accounts:', JSON.stringify(accounts.map(a => ({ id: a.id, name: a.name }))));
    return accounts[0]?.id || null;
  } catch (err) {
    console.error('[Ads] Error fetching ad accounts:', err.message);
    return null;
  }
}

// --- Media Upload via v1.1 + OAuth 1.0a (required for Ads API media) ---
const X_UPLOAD_BASE = 'https://upload.x.com/1.1/media/upload.json';

// Construct a media_key from a media_id when the API doesn't return one.
// Prefix mapping: tweet_image=3, tweet_video=13, tweet_gif=16
function buildMediaKey(mediaId, mediaCategory) {
  const prefixes = { tweet_image: '3', tweet_video: '13', tweet_gif: '16' };
  const prefix = prefixes[mediaCategory] || '3';
  return `${prefix}_${mediaId}`;
}

// Simple upload for images (< 5MB)
export async function uploadMediaSimple(fileBuffer, mediaType, mediaCategory, userTokens = null) {
  console.log('[Media] Simple upload (v1.1 OAuth 1.0a):', { size: fileBuffer.length, mediaType, mediaCategory });

  const authHeader = getOAuth1Header('POST', X_UPLOAD_BASE, {}, userTokens);
  const formData = new FormData();
  formData.append('media_data', fileBuffer.toString('base64'));
  formData.append('media_category', mediaCategory);

  const res = await fetch(X_UPLOAD_BASE, {
    method: 'POST',
    headers: { Authorization: authHeader },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[Media] Simple upload failed:', res.status, err);
    throw new Error(`Media upload failed (${res.status}): ${err}`);
  }

  const body = await res.json();
  const mediaId = body.media_id_string;
  const mediaKey = body.media_key || buildMediaKey(mediaId, mediaCategory);
  console.log('[Media] Simple upload OK:', { mediaId, mediaKey, hadKey: !!body.media_key });
  return { mediaId, mediaKey };
}

// Chunked upload for videos via v1.1 INIT/APPEND/FINALIZE
export async function uploadMediaChunked(fileBuffer, mediaType, mediaCategory, userTokens = null) {
  console.log('[Media] Chunked upload (v1.1 OAuth 1.0a):', { size: fileBuffer.length, mediaType, mediaCategory });

  // INIT
  const initAuth = getOAuth1Header('POST', X_UPLOAD_BASE, {}, userTokens);
  const initForm = new FormData();
  initForm.append('command', 'INIT');
  initForm.append('total_bytes', fileBuffer.length.toString());
  initForm.append('media_type', mediaType);
  initForm.append('media_category', mediaCategory);

  const initRes = await fetch(X_UPLOAD_BASE, {
    method: 'POST',
    headers: { Authorization: initAuth },
    body: initForm,
  });

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`Media INIT failed (${initRes.status}): ${err}`);
  }

  const initBody = await initRes.json();
  const mediaId = initBody.media_id_string;
  console.log('[Media] INIT OK, media_id:', mediaId);

  // APPEND chunks
  const chunkSize = 5 * 1024 * 1024;
  let segmentIndex = 0;
  for (let offset = 0; offset < fileBuffer.length; offset += chunkSize) {
    const chunk = fileBuffer.subarray(offset, offset + chunkSize);
    const appendAuth = getOAuth1Header('POST', X_UPLOAD_BASE, {}, userTokens);
    const appendForm = new FormData();
    appendForm.append('command', 'APPEND');
    appendForm.append('media_id', mediaId);
    appendForm.append('segment_index', segmentIndex.toString());
    appendForm.append('media_data', chunk.toString('base64'));

    const appendRes = await fetch(X_UPLOAD_BASE, {
      method: 'POST',
      headers: { Authorization: appendAuth },
      body: appendForm,
    });

    if (!appendRes.ok) {
      const err = await appendRes.text();
      throw new Error(`Media APPEND failed (${appendRes.status}): ${err}`);
    }
    segmentIndex++;
  }

  // FINALIZE
  const finalAuth = getOAuth1Header('POST', X_UPLOAD_BASE, {}, userTokens);
  const finalForm = new FormData();
  finalForm.append('command', 'FINALIZE');
  finalForm.append('media_id', mediaId);

  const finalRes = await fetch(X_UPLOAD_BASE, {
    method: 'POST',
    headers: { Authorization: finalAuth },
    body: finalForm,
  });

  if (!finalRes.ok) {
    const err = await finalRes.text();
    throw new Error(`Media FINALIZE failed (${finalRes.status}): ${err}`);
  }

  const finalBody = await finalRes.json();
  const mediaKey = finalBody.media_key || buildMediaKey(mediaId, mediaCategory);
  console.log('[Media] Chunked upload OK:', { mediaId, mediaKey, hadKey: !!finalBody.media_key });

  // Poll processing status for video
  if (finalBody.processing_info) {
    let status = finalBody.processing_info;
    while (status.state === 'pending' || status.state === 'in_progress') {
      const waitSecs = status.check_after_secs || 5;
      await new Promise((r) => setTimeout(r, waitSecs * 1000));

      const statusParams = { command: 'STATUS', media_id: mediaId };
      const statusAuth = getOAuth1Header('GET', X_UPLOAD_BASE, statusParams, userTokens);
      const statusRes = await fetch(`${X_UPLOAD_BASE}?command=STATUS&media_id=${mediaId}`, {
        headers: { Authorization: statusAuth },
      });

      if (!statusRes.ok) {
        const err = await statusRes.text();
        throw new Error(`Media status check failed (${statusRes.status}): ${err}`);
      }
      const statusBody = await statusRes.json();
      status = statusBody.processing_info || { state: 'succeeded' };
      console.log('[Media] Processing status:', status.state);
    }

    if (status.state === 'failed') {
      throw new Error('Media processing failed: ' + JSON.stringify(status));
    }
  }

  return { mediaId, mediaKey };
}

// Register uploaded media in the ad account's media library (required for cards)
export async function registerMediaLibrary(adAccountId, mediaKey, userTokens = null) {
  const url = `${X_ADS_BASE}/accounts/${adAccountId}/media_library`;
  const params = { media_key: mediaKey };
  const authHeader = getOAuth1Header('POST', url, params, userTokens);

  if (!authHeader) return;

  console.log('[Ads] Registering media in library:', mediaKey);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[Ads] Media library registration failed:', res.status, err);
    // Non-fatal — card creation might still work without it
  } else {
    console.log('[Ads] Media registered in library');
  }
}

// Fetch media from the ad account's media library
export async function getMediaLibrary(adAccountId, { cursor, count = 50, q, mediaType } = {}, userTokens = null) {
  const url = `${X_ADS_BASE}/accounts/${adAccountId}/media_library`;

  const params = {};
  if (cursor) params.cursor = cursor;
  if (count) params.count = String(count);
  if (q) params.q = q;
  if (mediaType) params.media_type = mediaType;

  const authHeader = getOAuth1Header('GET', url, params, userTokens);
  if (!authHeader) {
    throw new Error('OAuth 1.0a credentials not configured for Ads API');
  }

  const qs = new URLSearchParams(params).toString();
  const fullUrl = qs ? `${url}?${qs}` : url;

  console.log('[Ads] Fetching media library:', { adAccountId, params });

  const res = await fetch(fullUrl, {
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Media library fetch failed (${res.status}): ${err}`);
  }

  const body = await res.json();
  return {
    data: body.data || [],
    nextCursor: body.next_cursor || null,
  };
}

// --- Cards & Tweets ---

export async function getAccountFeatures(adAccountId, userTokens = null) {
  const url = `${X_ADS_BASE}/accounts/${adAccountId}/features`;
  const authHeader = getOAuth1Header('GET', url, {}, userTokens);
  if (!authHeader) return [];

  try {
    const res = await fetch(url, { headers: { Authorization: authHeader } });
    if (!res.ok) return [];
    const body = await res.json();
    console.log('[Ads] Account features:', JSON.stringify(body.data));
    return body.data || [];
  } catch {
    return [];
  }
}

export async function createConversationCard(adAccountId, cardData, isVideo = false, userTokens = null) {
  const cardType = isVideo ? 'video_conversation' : 'image_conversation';
  const url = `${X_ADS_BASE}/accounts/${adAccountId}/cards/${cardType}`;

  // Conversation card endpoints use form-encoded params included in OAuth signature
  const params = {};
  for (const [k, v] of Object.entries(cardData)) {
    if (v != null && v !== '') params[k] = String(v);
  }

  const authHeader = getOAuth1Header('POST', url, params, userTokens);

  if (!authHeader) {
    throw new Error('OAuth 1.0a credentials not configured for Ads API');
  }

  console.log('[Ads] Creating conversation card:', { cardType, params });

  const body = new URLSearchParams(params);

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Re-sign on each attempt since OAuth nonce/timestamp must be fresh
    const header = attempt === 1 ? authHeader : getOAuth1Header('POST', url, params, userTokens);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: header,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (res.ok) return res.json();

    const err = await res.text();

    if (res.status === 503 && attempt < MAX_RETRIES) {
      const delay = 1000 * attempt;
      console.warn(`[Ads] Card creation 503, retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    console.error('[Ads] Card creation failed:', res.status, err);
    throw new Error(`Card creation failed (${res.status}): ${err}`);
  }
}

export async function getConversationCard(adAccountId, cardId, isVideo = false, userTokens = null) {
  const cardType = isVideo ? 'video_conversation' : 'image_conversation';
  const url = `${X_ADS_BASE}/accounts/${adAccountId}/cards/${cardType}/${cardId}`;

  const authHeader = getOAuth1Header('GET', url, {}, userTokens);
  if (!authHeader) {
    throw new Error('OAuth 1.0a credentials not configured for Ads API');
  }

  const res = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Card fetch failed (${res.status}): ${err}`);
  }

  return res.json();
}

export async function listConversationCards(adAccountId, cardType = 'image_conversation', { cursor, count = 50 } = {}, userTokens = null) {
  const url = `${X_ADS_BASE}/accounts/${adAccountId}/cards/${cardType}`;
  const params = {};
  if (cursor) params.cursor = cursor;
  if (count) params.count = String(count);

  const authHeader = getOAuth1Header('GET', url, params, userTokens);
  if (!authHeader) {
    throw new Error('OAuth 1.0a credentials not configured for Ads API');
  }

  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${url}${qs ? '?' + qs : ''}`, {
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Card list failed (${res.status}): ${err}`);
  }

  return res.json();
}

// Create a tweet via the Ads API (required for attaching card_uri)
export async function createAdsTweet(adAccountId, { text, cardUri, asUserId, nullcast = false, userTokens = null }) {
  const url = `${X_ADS_BASE}/accounts/${adAccountId}/tweet`;

  const params = { text, as_user_id: asUserId };
  if (cardUri) params.card_uri = cardUri;
  if (nullcast) params.nullcast = 'true';

  const authHeader = getOAuth1Header('POST', url, params, userTokens);
  if (!authHeader) {
    throw new Error('OAuth 1.0a credentials not configured for Ads API');
  }

  console.log('[Ads] Creating tweet:', { adAccountId, params });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });

  if (res.status === 429) {
    const rateLimitReset = res.headers.get('x-rate-limit-reset');
    const resetTime = rateLimitReset
      ? Math.ceil((parseInt(rateLimitReset) * 1000 - Date.now()) / 1000)
      : 60;
    throw Object.assign(
      new Error(`Rate limit reached. Try again in ${resetTime} seconds.`),
      { status: 429, resetIn: resetTime }
    );
  }

  if (!res.ok) {
    const err = await res.text();
    const error = new Error(`Ads tweet creation failed (${res.status}): ${err}`);
    error.status = res.status;
    throw error;
  }

  return res.json();
}
