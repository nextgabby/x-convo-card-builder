import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

const db = new Database(join(__dirname, '../data/cardforge.db'));
const user = db.prepare('SELECT access_token FROM users LIMIT 1').get();
const ACCESS_TOKEN = user.access_token;

function percentEncode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function generateOAuth1Header(method, url, params = {}) {
  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_KEY_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const tokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

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

  return 'OAuth ' + Object.keys(oauthParams).sort().map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`).join(', ');
}

const AD_ACCOUNT_ID = '18ce54dimaq';
const ADS_BASE = 'https://ads-api.x.com/12';

async function main() {
  // Step 1: Upload a fresh image via v2 media upload (OAuth 2.0)
  console.log('Step 1: Uploading fresh image via v2...');

  // 1x1 red PNG
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
    0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  const formData = new FormData();
  const blob = new Blob([pngHeader], { type: 'image/png' });
  formData.append('media', blob, 'test.png');
  formData.append('media_category', 'tweet_image');

  const uploadRes = await fetch('https://api.x.com/2/media/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    body: formData,
  });

  console.log('Upload status:', uploadRes.status);
  const uploadBody = await uploadRes.json();
  console.log('Upload response:', JSON.stringify(uploadBody));

  const mediaId = uploadBody.data?.id;
  const mediaKey = uploadBody.data?.media_key;
  console.log('media_id:', mediaId, 'media_key:', mediaKey);

  if (!mediaKey) {
    console.error('No media_key in response, cannot proceed');
    return;
  }

  // Step 2: Create conversation card (OAuth 1.0a)
  console.log('\nStep 2: Creating image_conversation card...');

  const url = `${ADS_BASE}/accounts/${AD_ACCOUNT_ID}/cards/image_conversation`;
  const params = {
    name: 'test_full_flow_card',
    first_cta: '#TestCardForge',
    first_cta_tweet: 'Testing CardForge conversation cards!',
    thank_you_text: 'Thanks for testing!',
    media_key: mediaKey,
  };

  console.log('Card params:', params);

  const authHeader = generateOAuth1Header('POST', url, params);
  const body = new URLSearchParams(params);

  const cardRes = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  console.log('Card status:', cardRes.status);
  const cardBody = await cardRes.text();
  console.log('Card response:', cardBody);
}

main().catch(console.error);
