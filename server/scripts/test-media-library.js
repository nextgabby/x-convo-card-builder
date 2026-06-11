import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import zlib from 'zlib';

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

function generatePNG(width, height, r = 29, g = 155, b = 240) {
  function crc32(buf) {
    let crc = 0xffffffff;
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const typeBytes = Buffer.from(type);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const combined = Buffer.concat([typeBytes, data]);
    const crcVal = crc32(combined);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crcVal);
    return Buffer.concat([len, combined, crcBuf]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.alloc(1 + width * 3);
  row[0] = 0;
  for (let x = 0; x < width; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
  const rawData = Buffer.concat(Array(height).fill(row));
  const compressed = zlib.deflateSync(rawData);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

const AD_ACCOUNT_ID = '18ce54dimaq';
const ADS_BASE = 'https://ads-api.x.com/12';

async function main() {
  // Step 1: Upload via v1.1
  console.log('Step 1: Upload 800x418 PNG via v1.1...');
  const png = generatePNG(800, 418);
  const uploadUrl = 'https://upload.x.com/1.1/media/upload.json';
  const uploadAuth = generateOAuth1Header('POST', uploadUrl);
  const formData = new FormData();
  formData.append('media_data', png.toString('base64'));
  formData.append('media_category', 'tweet_image');
  const uploadRes = await fetch(uploadUrl, { method: 'POST', headers: { Authorization: uploadAuth }, body: formData });
  const uploadBody = await uploadRes.json();
  console.log('Upload:', uploadRes.status, 'media_id:', uploadBody.media_id_string, 'media_key:', uploadBody.media_key);

  const mediaId = uploadBody.media_id_string;
  const mediaKey = uploadBody.media_key;

  // Step 2: Register in media library
  console.log('\nStep 2: Adding to media library...');
  const mlUrl = `${ADS_BASE}/accounts/${AD_ACCOUNT_ID}/media_library`;
  const mlParams = {
    media_key: mediaKey,
  };
  const mlAuth = generateOAuth1Header('POST', mlUrl, mlParams);
  const mlBody = new URLSearchParams(mlParams);
  const mlRes = await fetch(mlUrl, {
    method: 'POST',
    headers: { Authorization: mlAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: mlBody.toString(),
  });
  console.log('Media Library status:', mlRes.status);
  const mlResBody = await mlRes.text();
  console.log('Media Library response:', mlResBody.substring(0, 500));

  // Step 3: Try creating the card now
  console.log('\nStep 3: Creating image_conversation card...');
  const cardUrl = `${ADS_BASE}/accounts/${AD_ACCOUNT_ID}/cards/image_conversation`;
  const cardParams = {
    name: 'test_media_library_card',
    first_cta: '#TestCardForge',
    first_cta_tweet: 'Testing CardForge!',
    thank_you_text: 'Thanks!',
    media_key: mediaKey,
  };
  const cardAuth = generateOAuth1Header('POST', cardUrl, cardParams);
  const cardBody = new URLSearchParams(cardParams);
  const cardRes = await fetch(cardUrl, {
    method: 'POST',
    headers: { Authorization: cardAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: cardBody.toString(),
  });
  console.log('Card status:', cardRes.status);
  const cardResBody = await cardRes.text();
  console.log('Card response:', cardResBody);
}

main().catch(console.error);
