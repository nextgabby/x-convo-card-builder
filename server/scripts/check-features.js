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
  // Check features
  const featuresUrl = `${ADS_BASE}/accounts/${AD_ACCOUNT_ID}/features`;
  const featuresAuth = generateOAuth1Header('GET', featuresUrl);
  const featuresRes = await fetch(featuresUrl, { headers: { Authorization: featuresAuth } });
  console.log('Features status:', featuresRes.status);
  const featuresBody = await featuresRes.text();
  console.log('Features:', featuresBody);

  // List available card types by hitting the unified cards endpoint
  const cardsUrl = `${ADS_BASE}/accounts/${AD_ACCOUNT_ID}/cards`;
  const cardsAuth = generateOAuth1Header('GET', cardsUrl);
  const cardsRes = await fetch(cardsUrl, { headers: { Authorization: cardsAuth } });
  console.log('\nCards endpoint status:', cardsRes.status);
  const cardsBody = await cardsRes.text();
  console.log('Cards:', cardsBody.substring(0, 500));
}

main().catch(console.error);
