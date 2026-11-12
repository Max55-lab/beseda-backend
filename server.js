const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const db = require("./db-unified");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === "production") {
  console.error("JWT_SECRET must be set in production!");
  process.exit(1);
}
const SECRET = JWT_SECRET || "beseda-dev-secret-change-me";

function authMiddleware(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "nema tokena" });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: "nevaljan token" });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) return res.status(403).json({ error: "zabranjeno" });
    next();
  };
}

// ---------- AUTH ----------
app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username i password obavezni" });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const info = await db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(username, hash);
    const user = { id: info.lastInsertRowid, username, role: "govornik" };
    const token = jwt.sign(user, SECRET, { expiresIn: "30d" });
    res.status(201).json({ token, user });
  } catch (e) {
    if (String(e).includes("UNIQUE")) return res.status(409).json({ error: "korisnik već postoji" });
    res.status(500).json({ error: String(e) });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  const row = await db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!row || !bcrypt.compareSync(password || "", row.password_hash)) {
    return res.status(401).json({ error: "neispravni podaci" });
  }
  const user = { id: row.id, username: row.username, role: row.role };
  const token = jwt.sign(user, SECRET, { expiresIn: "30d" });
  res.json({ token, user });
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  const row = await db.prepare("SELECT id, username, role FROM users WHERE id = ?").get(req.user.id);
  res.json({ user: row || req.user });
});

// ---------- WORDS ----------
app.get("/api/words", async (req, res) => {
  const status = req.query.status || "approved";
  const govor = req.query.govor || "";
  const q = (req.query.q || "").trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
  let sql = "SELECT w.*, u.username AS autor FROM words w LEFT JOIN users u ON u.id = w.user_id";
  const where = [];
  const params = [];
  if (status !== "all") { where.push("w.status = ?"); params.push(status); }
  if (govor) { where.push("w.govor_id = ?"); params.push(govor); }
  if (q) { where.push("(w.rijec LIKE ? OR w.znacenje LIKE ?)"); params.push("%" + q + "%", "%" + q + "%"); }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY w.created_at DESC LIMIT ?";
  params.push(limit);
  const rows = await db.prepare(sql).all(...params);
  res.json({ count: rows.length, words: rows });
});

app.get("/api/words/:id", async (req, res) => {
  const row = await db.prepare("SELECT w.*, u.username AS autor FROM words w LEFT JOIN users u ON u.id = w.user_id WHERE w.id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "nije pronađeno" });
  res.json({ word: row });
});

app.post("/api/words", authMiddleware, async (req, res) => {
  const { rijec, izgovor, vrsta, znacenje, primjer, prijevod, govor_id, tema, izvor } = req.body || {};
  if (!rijec || !znacenje) return res.status(400).json({ error: "rijec i znacenje obavezni" });
  try {
    const info = await db.prepare(`
      INSERT INTO words (rijec, izgovor, vrsta, znacenje, primjer, prijevod, govor_id, tema, izvor, status, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(rijec, izgovor || null, vrsta || null, znacenje, primjer || null, prijevod || null, govor_id || null, tema || null, izvor || null, req.user.id);
    const row = await db.prepare("SELECT * FROM words WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json({ word: row });
  } catch (e) {
    if (String(e).includes("UNIQUE")) return res.status(409).json({ error: "word already exists" });
    res.status(500).json({ error: String(e) });
  }
});

app.patch("/api/words/:id/status", authMiddleware, requireRole("urednik"), async (req, res) => {
  const { status } = req.body || {};
  if (!["approved", "rejected", "pending"].includes(status)) return res.status(400).json({ error: "nevaljan status" });
  const info = await db.prepare("UPDATE words SET status = ? WHERE id = ?").run(status, req.params.id);
  res.json({ updated: info.changes });
});

app.delete("/api/words/:id", authMiddleware, async (req, res) => {
  const row = await db.prepare("SELECT * FROM words WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "nije pronađeno" });
  if (req.user.role !== "urednik" && row.user_id !== req.user.id) return res.status(403).json({ error: "zabranjeno" });
  const info = await db.prepare("DELETE FROM words WHERE id = ?").run(req.params.id);
  res.json({ deleted: info.changes });
});

// ---------- RECORDINGS ----------
app.get("/api/recordings/:rijecId", async (req, res) => {
  const rows = await db.prepare("SELECT id, rijec_id, user_id, mime, created_at FROM recordings WHERE rijec_id = ?").all(req.params.rijecId);
  res.json({ recordings: rows });
});

app.get("/api/recordings/:id/audio", async (req, res) => {
  const row = await db.prepare("SELECT mime, data FROM recordings WHERE id = ?").get(req.params.id);
  if (!row || !row.data) return res.status(404).json({ error: "nije pronađeno" });
  const buf = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
  res.set("Content-Type", row.mime || "audio/webm");
  res.send(buf);
});

app.post("/api/recordings", authMiddleware, async (req, res) => {
  const { rijec_id, mime, data } = req.body || {};
  if (!rijec_id || !data) return res.status(400).json({ error: "rijec_id i data obavezni" });
  try {
    const buf = Buffer.from(data, "base64");
    const info = await db.prepare("INSERT INTO recordings (rijec_id, user_id, mime, data) VALUES (?, ?, ?, ?)").run(rijec_id, req.user.id, mime || "audio/webm", buf);
    const row = await db.prepare("SELECT id, rijec_id, user_id, mime, created_at FROM recordings WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json({ recording: row });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.delete("/api/recordings/:id", authMiddleware, async (req, res) => {
  const row = await db.prepare("SELECT * FROM recordings WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "nije pronađeno" });
  if (req.user.role !== "urednik" && row.user_id !== req.user.id) return res.status(403).json({ error: "zabranjeno" });
  const info = await db.prepare("DELETE FROM recordings WHERE id = ?").run(req.params.id);
  res.json({ deleted: info.changes });
});

// ---------- COLLECTIONS ----------
app.get("/api/collections", authMiddleware, async (req, res) => {
  const rows = await db.prepare("SELECT * FROM collections WHERE user_id = ?").all(req.user.id);
  res.json({ collections: rows.map((r) => ({ ...r, rijeci: JSON.parse(r.rijeci || "[]") })) });
});

app.post("/api/collections", authMiddleware, async (req, res) => {
  const { naziv } = req.body || {};
  if (!naziv) return res.status(400).json({ error: "naziv obavezan" });
  const info = await db.prepare("INSERT INTO collections (naziv, user_id, rijeci) VALUES (?, ?, '[]')").run(naziv, req.user.id);
  const row = await db.prepare("SELECT * FROM collections WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ collection: { ...row, rijeci: JSON.parse(row.rijeci) } });
});

app.patch("/api/collections/:id", authMiddleware, async (req, res) => {
  const { rijeci } = req.body || {};
  const col = await db.prepare("SELECT * FROM collections WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!col) return res.status(404).json({ error: "nije pronađeno" });
  await db.prepare("UPDATE collections SET rijeci = ? WHERE id = ?").run(JSON.stringify(rijeci || []), req.params.id);
  res.json({ ok: true });
});

// ---------- STATS ----------
app.get("/api/stats", async (req, res) => {
  const total = (await db.prepare("SELECT COUNT(*) AS c FROM words").get()).c;
  const pending = (await db.prepare("SELECT COUNT(*) AS c FROM words WHERE status = 'pending'").get()).c;
  const users = (await db.prepare("SELECT COUNT(*) AS c FROM users").get()).c;
  res.json({ total, pending, users });
});

// ---------- HEALTH ----------
app.get("/api/health", (req, res) => res.json({ ok: true, service: "beseda-backend", db: db.isPostgres ? "postgres" : "sqlite" }));

// ---------- ADMIN ----------
app.post("/api/admin/promote", authMiddleware, async (req, res) => {
  const { username } = req.body || {};
  const editors = (await db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'urednik'").get()).c;
  if (editors > 0 && req.user.role !== "urednik") return res.status(403).json({ error: "zabranjeno" });
  const info = await db.prepare("UPDATE users SET role = 'urednik' WHERE username = ?").run(username);
  res.json({ updated: info.changes });
});

// ---------- FRONTEND ----------
const frontendPath = require("fs").existsSync(path.join(__dirname, "public", "index.html"))
  ? path.join(__dirname, "public")
  : (require("fs").existsSync(path.join(__dirname, "..", "beseda", "dist", "index.html"))
      ? path.join(__dirname, "..", "beseda", "dist")
      : null);
if (frontendPath) {
  app.use(express.static(frontendPath));
  app.use((req, res) => {
    if (req.path.startsWith("/api")) return res.status(404).json({ error: "not found" });
    res.sendFile(path.join(frontendPath, "index.html"));
  });
} else {
  app.get("/", (req, res) => res.json({ service: "beseda-backend", status: "ok" }));
}

const PORT = process.env.PORT || 3002;
// auto-seed if DB is empty
(async () => {
  try {
    const count = (await db.prepare("SELECT COUNT(*) AS c FROM words").get()).c;
    if (count === 0) {
      console.log("Auto-seeding database...");
      const { execSync } = require("child_process");
      execSync("node seed.mjs", { stdio: "inherit", cwd: __dirname });
    }
  } catch (e) {
    console.error("Auto-seed error:", e.message);
  }
  app.listen(PORT, () => console.log(`Beseda backend running on http://localhost:${PORT} (db: ${db.isPostgres ? "postgres" : "sqlite"})`));
})();