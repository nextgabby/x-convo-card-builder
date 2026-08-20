/**
 * Static OAuth / session compliance checks for legal review.
 * Does not call X live. Exit 0 = all assertions passed.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import { generatePKCE } from '../lib/xClient.js';
import { encryptToken, decryptToken, isEncrypted, safeEqual } from '../lib/crypto.js';
import { sessionCookieOptions, SESSION_COOKIE_NAME } from '../lib/session.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const authJs = read('server/routes/auth.js');
const xClientJs = read('server/lib/xClient.js');
const sessionJs = read('server/lib/session.js');
const indexJs = read('server/index.js');
const usersJs = read('server/lib/users.js');
const loginJsx = read('client/src/pages/Login.jsx');
const authCtx = read('client/src/context/AuthContext.jsx');
const clientSrc = [
  loginJsx,
  authCtx,
  read('client/src/App.jsx'),
  read('client/src/hooks/useAuth.js'),
].join('\n');

const failures = [];
function check(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    failures.push({ name, error: err.message });
    console.log(`FAIL  ${name}: ${err.message}`);
  }
}

check('PKCE S256: 32-byte verifier and SHA-256 challenge', () => {
  const { verifier, challenge } = generatePKCE();
  assert.equal(Buffer.from(verifier, 'base64url').length, 32);
  assert.notEqual(verifier, challenge);
  const { verifier: v2, challenge: c2 } = generatePKCE();
  assert.notEqual(verifier, v2);
  assert.notEqual(challenge, c2);
  assert.match(xClientJs, /code_challenge_method: 'S256'/);
});

check('Authorize URL uses env redirect_uri, state, PKCE — not a user query param', () => {
  assert.match(xClientJs, /redirect_uri: process\.env\.X_REDIRECT_URI/);
  assert.match(xClientJs, /code_challenge: codeChallenge/);
  assert.match(xClientJs, /state,/);
  assert.doesNotMatch(xClientJs, /req\.query\.redirect/);
  assert.match(authJs, /process\.env\.X_REDIRECT_URI/);
});

check('Token exchange is confidential client + PKCE on the server', () => {
  assert.match(xClientJs, /grant_type: 'authorization_code'/);
  assert.match(xClientJs, /code_verifier: codeVerifier/);
  assert.match(xClientJs, /Authorization: `Basic \$\{auth\}`/);
  assert.match(xClientJs, /X_CLIENT_SECRET/);
});

check('Client bundle has no client secret, access token, or PKCE verifier', () => {
  assert.doesNotMatch(clientSrc, /X_CLIENT_SECRET/);
  assert.doesNotMatch(clientSrc, /access_token/);
  assert.doesNotMatch(clientSrc, /refresh_token/);
  assert.doesNotMatch(clientSrc, /codeVerifier/);
  assert.doesNotMatch(clientSrc, /code_verifier/);
});

check('OAuth state is required and compared with timingSafeEqual', () => {
  assert.match(authJs, /!code \|\| !state \|\| !req\.session\.oauthState/);
  assert.match(authJs, /safeEqual\(String\(state\), String\(req\.session\.oauthState\)\)/);
  assert.equal(safeEqual('abc123', 'abc123'), true);
  assert.equal(safeEqual('abc123', 'abc124'), false);
  assert.equal(safeEqual('', ''), false);
  assert.equal(safeEqual(undefined, undefined), false);
});

check('Session is saved before OAuth redirect and regenerated after login', () => {
  assert.match(authJs, /await saveSession\(req\)/);
  assert.match(authJs, /await regenerateSession\(req\)/);
  assert.match(authJs, /establishSession/);
});

check('Session cookie is httpOnly, SameSite=lax, named, Secure in production', () => {
  const cookie = sessionCookieOptions();
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, 'lax');
  assert.equal(cookie.path, '/');
  assert.equal(SESSION_COOKIE_NAME, 'cardforge.sid');
  assert.match(sessionJs, /secure: process\.env\.NODE_ENV === 'production'/);
  assert.match(sessionJs, /saveUninitialized: false/);
});

check('Logout revokes OAuth 2 token, nulls stored secrets, and clears cookie', () => {
  assert.match(authJs, /revokeOAuth2Token\(user\.refresh_token\)/);
  assert.match(authJs, /clearUserTokens\(userId\)/);
  assert.match(authJs, /destroySession\(req, res\)/);
  assert.match(usersJs, /oauth1_access_token = NULL/);
  assert.match(sessionJs, /clearCookie\(SESSION_COOKIE_NAME/);
  assert.match(xClientJs, /api\.x\.com\/2\/oauth2\/revoke/);
});

check('/auth/me does not return token fields', () => {
  const meStart = authJs.indexOf("router.get('/auth/me'");
  assert.ok(meStart >= 0);
  const meBlock = authJs.slice(meStart);
  assert.match(meBlock, /adsConnected:/);
  assert.match(meBlock, /needsAdsAccount:/);
  assert.doesNotMatch(meBlock, /access_token:/);
  assert.doesNotMatch(meBlock, /refresh_token:/);
  assert.doesNotMatch(meBlock, /oauth1_access_token:/);
});

check('OAuth 1.0a user-token fallback to env is gone', () => {
  assert.doesNotMatch(xClientJs, /X_ACCESS_TOKEN/);
  assert.match(xClientJs, /if \(!userTokens\?\.accessToken \|\| !userTokens\?\.accessTokenSecret\) return null/);
});

check('OAuth 1.0a request token is bound to the session', () => {
  assert.match(authJs, /req\.session\.oauth1Token = oauthToken/);
  assert.match(authJs, /safeEqual\(String\(oauth_token\), String\(req\.session\.oauth1Token/);
});

check('Tokens encrypt at rest when TOKEN_ENCRYPTION_KEY is set', () => {
  process.env.TOKEN_ENCRYPTION_KEY = 'compliance-test-key';
  const enc = encryptToken('secret-oauth-token');
  assert.equal(isEncrypted(enc), true);
  assert.equal(decryptToken(enc), 'secret-oauth-token');
  assert.notEqual(enc, 'secret-oauth-token');
  assert.equal(decryptToken('legacy-plaintext'), 'legacy-plaintext');
  assert.match(usersJs, /encryptToken\(accessToken\)/);
});

check('Production refuses to boot without SESSION_SECRET, TOKEN_ENCRYPTION_KEY, HTTPS URLs', () => {
  assert.match(indexJs, /TOKEN_ENCRYPTION_KEY/);
  assert.match(indexJs, /SESSION_SECRET/);
  assert.match(indexJs, /X_REDIRECT_URI\?\.startsWith\('https:\/\/'\)/);
  assert.match(indexJs, /CLIENT_URL\?\.startsWith\('https:\/\/'\)/);
  assert.match(indexJs, /process\.exit\(1\)/);
});

check('Helmet, auth rate limits, and trust proxy are enabled', () => {
  assert.match(indexJs, /helmet\(/);
  assert.match(indexJs, /app\.use\('\/auth\/login', authLimiter\)/);
  assert.match(indexJs, /app\.use\('\/auth\/callback', authLimiter\)/);
  assert.match(indexJs, /trust proxy/);
});

check('Login starts OAuth via same-origin /auth/login (no token in the browser)', () => {
  assert.match(loginJsx, /window\.location\.href = '\/auth\/login'/);
});

check('Unauthorized client path logs out server-side', () => {
  assert.match(authCtx, /\/auth\/logout/);
  assert.match(authCtx, /handleUnauthorized/);
});

check('Ads account selection is verified against the token holder\'s account list', () => {
  assert.match(authJs, /accounts\.some\(\(a\) => a\.id === adAccountId\)/);
});

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}

console.log('\nAll OAuth compliance assertions passed.');
