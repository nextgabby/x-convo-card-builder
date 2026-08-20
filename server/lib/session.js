import session from 'express-session';
import SqliteStoreFactory from 'better-sqlite3-session-store';
import db from '../db/index.js';

const SqliteStore = SqliteStoreFactory(session);

export const SESSION_COOKIE_NAME = 'cardforge.sid';

export function sessionCookieOptions() {
  return {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    path: '/',
  };
}

export function createSession() {
  const secret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret === 'dev-secret-change-me') {
      throw new Error('SESSION_SECRET is required in production');
    }
  }

  return session({
    name: SESSION_COOKIE_NAME,
    store: new SqliteStore({
      client: db,
      expired: { clear: true, intervalMs: 900000 },
    }),
    secret: secret || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: sessionCookieOptions(),
  });
}

export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

export function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

export function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
}

export function destroySession(req, res) {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => {
      clearSessionCookie(res);
      if (err) reject(err);
      else resolve();
    });
  });
}
