const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

fs.mkdirSync(config.IMAGE_DIR, { recursive: true });

const db = new DatabaseSync(config.DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,   -- also the public slug: /list/<username>
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  intro         TEXT NOT NULL DEFAULT '',
  avatar        TEXT NOT NULL DEFAULT '🎅',
  theme         TEXT NOT NULL DEFAULT 'classic',       -- classic | fireplace
  budget        REAL,                                  -- gift planner budget
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  url                TEXT NOT NULL DEFAULT '',
  store              TEXT NOT NULL DEFAULT '',
  price              REAL,
  previous_price     REAL,                     -- set when a refresh finds a lower price
  currency           TEXT NOT NULL DEFAULT 'USD',
  image              TEXT NOT NULL DEFAULT '', -- local file name (served at /images/) or remote URL
  notes              TEXT NOT NULL DEFAULT '',
  priority           INTEGER NOT NULL DEFAULT 2, -- 1 = Nice, 2 = Really want, 3 = Dream gift
  quantity           INTEGER NOT NULL DEFAULT 1,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'active', -- active | archived | got_it
  claimed_by         TEXT,
  claimed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  claim_secret       TEXT,
  claimed_at         TEXT,
  wrapped            INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id, status, sort_order);
`);

module.exports = db;
