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

// Generate a valid PNG of specified dimensions (solid color, compresses well)
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
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const combined = Buffer.concat([typeBytes, data]);
    const crcVal = crc32(combined);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crcVal);
    return Buffer.concat([len, combined, crcBuf]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT - raw pixel data with filter byte
  const row = Buffer.alloc(1 + width * 3);
  row[0] = 0; // no filter
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const rawData = Buffer.concat(Array(height).fill(row));
  const compressed = zlib.deflateSync(rawData);

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', iend),
  ]);
}

const AD_ACCOUNT_ID = '18ce54dimaq';
const ADS_BASE = 'https://ads-api.x.com/12';

async function main() {
  // Step 1: Generate 800x418 PNG and upload via v1.1 with OAuth 1.0a
  console.log('Step 1: Generating 800x418 PNG...');
  const png = generatePNG(800, 418);
  console.log('PNG size:', png.length, 'bytes');

  console.log('Uploading via v1.1...');
  const uploadUrl = 'https://upload.x.com/1.1/media/upload.json';
  const uploadAuth = generateOAuth1Header('POST', uploadUrl);

  const formData = new FormData();
  formData.append('media_data', png.toString('base64'));
  formData.append('media_category', 'tweet_image');

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: uploadAuth },
    body: formData,
  });

  console.log('Upload status:', uploadRes.status);
  const uploadBody = await uploadRes.json();
  console.log('Upload response:', JSON.stringify(uploadBody).substring(0, 300));

  const mediaKey = uploadBody.media_key;
  const mediaId = uploadBody.media_id_string;
  console.log('media_id:', mediaId, 'media_key:', mediaKey);

  if (!mediaKey) {
    console.error('No media_key');
    return;
  }

  // Step 2: Create image_conversation card
  console.log('\nStep 2: Creating image_conversation card...');
  const url = `${ADS_BASE}/accounts/${AD_ACCOUNT_ID}/cards/image_conversation`;
  const params = {
    name: 'test_800x418_card',
    first_cta: '#TestCardForge',
    first_cta_tweet: 'Testing CardForge conversation cards!',
    thank_you_text: 'Thanks for testing!',
    media_key: mediaKey,
  };

  console.log('Card params:', JSON.stringify(params));

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
