import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

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
  // Try creating a minimal image conversation card
  // Using a media_key from a previously uploaded image
  const url = `${ADS_BASE}/accounts/${AD_ACCOUNT_ID}/cards/image_conversation`;

  const params = {
    name: 'test_card_api_check',
    first_cta: '#TestHashtag',
    first_cta_tweet: 'Testing the conversation card API',
    thank_you_text: 'Thanks for participating!',
    media_key: '2031045753389359105',
  };

  console.log('Creating image_conversation card with params:', params);
  console.log('URL:', url);

  const authHeader = generateOAuth1Header('POST', url, params);
  const body = new URLSearchParams(params);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  console.log('Status:', res.status);
  const responseBody = await res.text();
  console.log('Response:', responseBody);
}

main().catch(console.error);
