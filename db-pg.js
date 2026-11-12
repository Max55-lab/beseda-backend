// Postgres adapter (opcionalno) — aktivira se kad je postavljen DATABASE_URL.
// Koristi `pg` paket. Za instalaciju: npm install pg
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// Inicijalizacija tablica
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'govornik',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS words (
      id SERIAL PRIMARY KEY,
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
      user_id INTEGER REFERENCES users(id),
      level TEXT,
      translation TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS collections (
      id SERIAL PRIMARY KEY,
      naziv TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id),
      rijeci TEXT DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS recordings (
      id SERIAL PRIMARY KEY,
      rijec_id INTEGER REFERENCES words(id),
      user_id INTEGER REFERENCES users(id),
      mime TEXT,
      data BYTEA,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS lessons (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      level TEXT DEFAULT 'A1',
      description TEXT,
      word_ids TEXT NOT NULL
    );
  `);
  console.log("Postgres tablice inicijalizirane.");
}

// Wrapper koji oponaša better-sqlite3 API (prepare/run/get/all)
function prepare(sql) {
  // konvertiraj ? u $1, $2, ...
  let i = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++i}`);
  // konvertiraj SQLite-specific sintaksu
  const converted = pgSql
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, "SERIAL PRIMARY KEY")
    .replace(/datetime\('now'\)/gi, "NOW()");

  return {
    run: async (...params) => {
      const r = await pool.query(converted, params);
      return { changes: r.rowCount, lastInsertRowid: r.rows[0]?.id };
    },
    get: async (...params) => {
      const r = await pool.query(converted, params);
      return r.rows[0];
    },
    all: async (...params) => {
      const r = await pool.query(converted, params);
      return r.rows;
    },
  };
}

// Sync wrapper for compatibility (server.js uses sync calls)
// NOTE: This requires async/await in server.js. For simplicity, use SQLite for alpha.
module.exports = { pool, init, prepare, isPostgres: true };