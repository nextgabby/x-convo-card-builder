CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  display_name TEXT,
  profile_image_url TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at INTEGER,
  ad_account_id TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  x_card_uri TEXT,
  name TEXT,
  status TEXT DEFAULT 'draft',
  media_id TEXT,
  media_key TEXT,
  media_type TEXT,
  cover_media_id TEXT,
  cover_media_key TEXT,
  cover_media_type TEXT,
  media_preview_url TEXT,
  headline TEXT,
  prompts JSON,
  thank_you_text TEXT,
  thank_you_url TEXT,
  post_text TEXT,
  promoted_only INTEGER DEFAULT 1,
  tweet_id TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
