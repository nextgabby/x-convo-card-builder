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
  // Use the media_key we already registered in the media library
  const mediaKey = '3_2031067612252196865';

  // Test 1: With title (single CTA)
  console.log('Test 1: Single CTA with title...');
  const url = `${ADS_BASE}/accounts/${AD_ACCOUNT_ID}/cards/image_conversation`;
  const params1 = {
    name: 'test_with_title',
    title: 'Join the conversation!',
    first_cta: '#TestCardForge',
    first_cta_tweet: 'Testing CardForge conversation cards!',
    thank_you_text: 'Thanks for testing!',
    media_key: mediaKey,
  };

  const auth1 = generateOAuth1Header('POST', url, params1);
  const body1 = new URLSearchParams(params1);
  const res1 = await fetch(url, {
    method: 'POST',
    headers: { Authorization: auth1, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body1.toString(),
  });
  console.log('Status:', res1.status);
  const text1 = await res1.text();
  console.log('Response:', text1.substring(0, 500));

  if (res1.status !== 200 && res1.status !== 201) {
    // Test 2: With second_cta (dual CTA, no title)
    console.log('\nTest 2: Dual CTA without title...');
    const params2 = {
      name: 'test_dual_cta',
      first_cta: '#TestCardForge',
      first_cta_tweet: 'Testing CardForge!',
      second_cta: '#CardForge2',
      second_cta_tweet: 'Also testing!',
      thank_you_text: 'Thanks for testing!',
      media_key: mediaKey,
    };

    const auth2 = generateOAuth1Header('POST', url, params2);
    const body2 = new URLSearchParams(params2);
    const res2 = await fetch(url, {
      method: 'POST',
      headers: { Authorization: auth2, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body2.toString(),
    });
    console.log('Status:', res2.status);
    const text2 = await res2.text();
    console.log('Response:', text2.substring(0, 500));
  }
}

main().catch(console.error);
