const { DatabaseSync } = require("node:sqlite");
const path = require("path");

const DB_PATH = path.join(__dirname, "beseda.db");
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");

// migracija: dodaj nove stupce ako ne postoje (prije indeksa)
try { db.exec("ALTER TABLE words ADD COLUMN level TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE words ADD COLUMN translation TEXT"); } catch (e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'govornik',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rijec TEXT NOT NULL,
    izgovor TEXT,
    vrsta TEXT,
    znacenje TEXT NOT NULL,
    primjer TEXT,
    prijevod TEXT,
    govor_id TEXT,
    tema TEXT,
    izvor TEXT,
    status TEXT DEFAULT 'pending',
    user_id INTEGER,
    level TEXT,
    translation TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_words_status ON words(status);
  CREATE INDEX IF NOT EXISTS idx_words_govor ON words(govor_id);
  CREATE INDEX IF NOT EXISTS idx_words_level ON words(level);

  CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    naziv TEXT NOT NULL,
    user_id INTEGER,
    rijeci TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rijec_id INTEGER,
    user_id INTEGER,
    mime TEXT,
    data BLOB,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (rijec_id) REFERENCES words(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    level TEXT DEFAULT 'A1',
    description TEXT,
    word_ids TEXT NOT NULL
  );
`);

// migracija: dodaj nove stupce ako ne postoje (već pokrenuto na vrhu)
module.exports = db;