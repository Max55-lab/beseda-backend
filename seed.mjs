import { RIJECI } from "../beseda/src/data/rijeci.js";
import { GOVORI } from "../beseda/src/data/govori.js";
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const db = require("./db.js");

const insert = db.prepare(`
  INSERT OR IGNORE INTO words (rijec, izgovor, vrsta, znacenje, primjer, prijevod, govor_id, tema, izvor, status, user_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', NULL)
`);

db.exec("BEGIN");
let n = 0;
for (const r of RIJECI) {
  const info = insert.run(r.rijec, r.izgovor, r.vrsta, r.znacenje, r.primjer, r.prijevod, r.govorId, r.tema, r.izvor);
  if (info.changes > 0) n++;
}
db.exec("COMMIT");
console.log(`Seeded ${n} zavičajnih riječi (od ${RIJECI.length}).`);
console.log("Govora:", GOVORI.length);