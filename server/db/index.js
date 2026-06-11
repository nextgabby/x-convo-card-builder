import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const dbPath = process.env.DATABASE_PATH || './data/cardforge.db';
const dbDir = dirname(dbPath);

mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// Migrations for existing databases
const columns = db.prepare("PRAGMA table_info(cards)").all().map(c => c.name);
if (!columns.includes('media_type')) {
  db.exec("ALTER TABLE cards ADD COLUMN media_type TEXT");
}
if (!columns.includes('media_key')) {
  db.exec("ALTER TABLE cards ADD COLUMN media_key TEXT");
}

// Add cover media type/key columns
if (!columns.includes('cover_media_key')) {
  db.exec("ALTER TABLE cards ADD COLUMN cover_media_key TEXT");
}
if (!columns.includes('cover_media_type')) {
  db.exec("ALTER TABLE cards ADD COLUMN cover_media_type TEXT");
}
if (!columns.includes('headline')) {
  db.exec("ALTER TABLE cards ADD COLUMN headline TEXT");
}
if (!columns.includes('media_preview_url')) {
  db.exec("ALTER TABLE cards ADD COLUMN media_preview_url TEXT");
}

// Add OAuth 1.0a user token columns
const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!userCols.includes('oauth1_access_token')) {
  db.exec("ALTER TABLE users ADD COLUMN oauth1_access_token TEXT");
}
if (!userCols.includes('oauth1_access_token_secret')) {
  db.exec("ALTER TABLE users ADD COLUMN oauth1_access_token_secret TEXT");
}

export default db;
