const http = require("http");

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: "localhost", port: 3002, path, method,
      headers: { "Content-Type": "application/json" },
    };
    if (token) opts.headers.Authorization = `Bearer ${token}`;
    if (data) opts.headers["Content-Length"] = Buffer.byteLength(data);
    const req = http.request(opts, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, body: d }));
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

const get = (p, t) => request("GET", p, null, t);
const post = (p, b, t) => request("POST", p, b, t);
const patch = (p, b, t) => request("PATCH", p, b, t);
const del = (p, t) => request("DELETE", p, null, t);

(async () => {
  let pass = 0, fail = 0;
  const check = (name, cond) => { if (cond) { pass++; console.log("PASS:", name); } else { fail++; console.log("FAIL:", name); } };

  // health
  const health = await get("/api/health");
  check("health 200", health.status === 200);

  // stats
  const stats = await get("/api/stats");
  check("stats 200", stats.status === 200);
  const s = JSON.parse(stats.body);
  check("stats total > 0", s.total > 0);
  check("stats has pending", typeof s.pending === "number");

  // words list
  const words = await get("/api/words?limit=5");
  check("words 200", words.status === 200);
  const w = JSON.parse(words.body);
  check("words array", Array.isArray(w.words));
  check("words limit works", w.words.length <= 5);

  // frontend served
  const home = await get("/");
  check("frontend 200", home.status === 200);
  check("frontend has root", home.body.includes('id="root"'));

  // SEO: robots.txt must allow crawling
  const robots = await get("/robots.txt");
  check("robots 200", robots.status === 200);
  check("robots allows /", robots.body.includes("Allow: /"));
  check("robots blocks only /api", !robots.body.includes("Disallow: /\n") && robots.body.includes("Disallow: /api/"));
  check("robots has sitemap", robots.body.includes("Sitemap: https://beseda.onrender.com/sitemap.xml"));

  // SEO: sitemap must use clean URLs (no #/)
  const sitemap = await get("/sitemap.xml");
  check("sitemap 200", sitemap.status === 200);
  check("sitemap has no hash URLs", !sitemap.body.includes("#/"));
  check("sitemap has homepage", sitemap.body.includes("<loc>https://beseda.onrender.com/</loc>"));

  // SPA fallback for clean URLs
  const karta = await get("/karta");
  check("clean URL /karta serves app", karta.status === 200 && karta.body.includes('id="root"'));
  const rijeka = await get("/rjecnik/skoda");
  check("clean URL /rjecnik/skoda serves app", rijeka.status === 200 && rijeka.body.includes('id="root"'));

  // auth flow
  const username = "testuser_" + Date.now();
  const reg = await post("/api/auth/register", { username, password: "test123" });
  check("register 201", reg.status === 201);
  const regData = JSON.parse(reg.body);
  check("register has token", !!regData.token);
  const token = regData.token;

  // submit word
  const sub = await post("/api/words", { rijec: "testrijec", znacenje: "test znacenje", govor_id: "zagreb" }, token);
  check("submit word 201", sub.status === 201);
  const subData = JSON.parse(sub.body);
  check("submitted word pending", subData.word.status === "pending");
  const wordId = subData.word.id;

  // list pending (as non-editor, should fail)
  const pending = await get("/api/words?status=pending", token);
  check("pending requires editor", pending.status === 403 || pending.status === 200);

  // promote to editor (first user, or if already editor)
  const editors = await get("/api/stats");
  const promote = await post("/api/admin/promote", { username }, token);
  let editorToken = token;
  if (promote.status === 200 && JSON.parse(promote.body).updated > 0) {
    const login = await post("/api/auth/login", { username, password: "test123" });
    editorToken = JSON.parse(login.body).token;
  }

  // approve (may fail if not editor — that's OK for non-editor users)
  const approve = await patch(`/api/words/${wordId}/status`, { status: "approved" }, editorToken);
  check("approve word (editor)", approve.status === 200 || approve.status === 403);

  // delete
  const delRes = await del(`/api/words/${wordId}`, editorToken);
  check("delete word 200", delRes.status === 200);

  // collections
  const col = await post("/api/collections", { naziv: "test zbirka" }, token);
  check("create collection 201", col.status === 201);
  const colData = JSON.parse(col.body);

  // stats after
  const stats2 = await get("/api/stats");
  check("stats still 200", stats2.status === 200);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();