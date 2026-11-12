const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const db = require("./db.js");
const A1 = require("../hr-bs-learn/backend/seed-data.js");

const insert = db.prepare(`
  INSERT OR IGNORE INTO words (rijec, izgovor, vrsta, znacenje, primjer, prijevod, govor_id, tema, izvor, status, user_id, level, translation)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', NULL, ?, ?)
`);

db.exec("BEGIN");
let n = 0;
for (const r of A1) {
  const info = insert.run(
    r.word, r.word, r.pos, r.translation, "", r.translation,
    null, "standardno", "hr-bs-learn seed", r.level || "A1", r.translation
  );
  if (info.changes > 0) n++;
}
db.exec("COMMIT");
console.log(`Seeded ${n} HR/BS riječi (od ${A1.length}).`);