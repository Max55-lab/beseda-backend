// Unified DB adapter — SQLite (default) or Postgres (if DATABASE_URL is set).
// Both expose the same async API: prepare(sql).run/get/all (all async).
const path = require("path");

let db;
let isPostgres = false;

if (process.env.DATABASE_URL) {
  isPostgres = true;
  const { Pool } = require("pg");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });

  // init tables
  const initSql = `
    CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT DEFAULT 'govornik', created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS words (id SERIAL PRIMARY KEY, rijec TEXT NOT NULL, izgovor TEXT, vrsta TEXT, znacenje TEXT NOT NULL, primjer TEXT, prijevod TEXT, govor_id TEXT, tema TEXT, izvor TEXT, status TEXT DEFAULT 'pending', user_id INTEGER REFERENCES users(id), level TEXT, translation TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS collections (id SERIAL PRIMARY KEY, naziv TEXT NOT NULL, user_id INTEGER REFERENCES users(id), rijeci TEXT DEFAULT '[]', created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS recordings (id SERIAL PRIMARY KEY, rijec_id INTEGER REFERENCES words(id), user_id INTEGER REFERENCES users(id), mime TEXT, data BYTEA, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS lessons (id SERIAL PRIMARY KEY, title TEXT NOT NULL, level TEXT DEFAULT 'A1', description TEXT, word_ids TEXT NOT NULL);
  `;
  pool.query(initSql).then(() => console.log("Postgres tablice inicijalizirane.")).catch((e) => console.error("PG init error:", e.message));

  function convertSql(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }

  db = {
    isPostgres: true,
    prepare: (sql) => {
      const pgSql = convertSql(sql);
      return {
        run: async (...params) => {
          const r = await pool.query(pgSql, params);
          return { changes: r.rowCount, lastInsertRowid: r.rows[0]?.id };
        },
        get: async (...params) => {
          const r = await pool.query(pgSql, params);
          return r.rows[0];
        },
        all: async (...params) => {
          const r = await pool.query(pgSql, params);
          return r.rows;
        },
      };
    },
    exec: async (sql) => pool.query(sql),
    pool,
  };
} else {
  isPostgres = false;
  const { DatabaseSync } = require("node:sqlite");
  const dbPath = process.env.DB_PATH || path.join(__dirname, "beseda.db");
  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec("PRAGMA journal_mode = WAL");

  // create tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT DEFAULT 'govornik', created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS words (id INTEGER PRIMARY KEY AUTOINCREMENT, rijec TEXT NOT NULL, izgovor TEXT, vrsta TEXT, znacenje TEXT NOT NULL, primjer TEXT, prijevod TEXT, govor_id TEXT, tema TEXT, izvor TEXT, status TEXT DEFAULT 'pending', user_id INTEGER, level TEXT, translation TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS collections (id INTEGER PRIMARY KEY AUTOINCREMENT, naziv TEXT NOT NULL, user_id INTEGER, rijeci TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS recordings (id INTEGER PRIMARY KEY AUTOINCREMENT, rijec_id INTEGER, user_id INTEGER, mime TEXT, data BLOB, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS lessons (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, level TEXT DEFAULT 'A1', description TEXT, word_ids TEXT NOT NULL);
  `);
  // migrations
  for (const col of ["level TEXT", "translation TEXT"]) {
    try { sqlite.exec(`ALTER TABLE words ADD COLUMN ${col}`); } catch (e) {}
  }

  db = {
    isPostgres: false,
    prepare: (sql) => {
      const stmt = sqlite.prepare(sql);
      return {
        run: async (...params) => {
          const info = stmt.run(...params);
          return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
        },
        get: async (...params) => stmt.get(...params),
        all: async (...params) => stmt.all(...params),
      };
    },
    exec: async (sql) => sqlite.exec(sql),
  };
}

module.exports = db;