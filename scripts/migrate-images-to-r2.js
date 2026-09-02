/* ============================================================================
   Migrate existing local /uploads images to Cloudflare R2 and rewrite the DB
   paths to R2 public URLs. Run once (locally) so every product/brand/hero/journal
   image lives on R2 and works on Railway (local /uploads files are gitignored and
   never deployed).

   Idempotent: rows already pointing at R2 (or with no local file) are skipped.
   Reads R2_* + serves via server/r2.js. Run with the env loaded:
     node --env-file=.env scripts/migrate-images-to-r2.js
     node --env-file=.env scripts/migrate-images-to-r2.js --limit=50   # test batch

   NOTE: imported competitor images are their copyright — this publishes them to
   your public bucket. That matches the "index now, replace later" choice; swap
   them for your own photography over time.
   ============================================================================ */
const path = require("path");
const fs = require("fs");
const db = require(path.join(__dirname, "..", "server", "db"));
const r2 = require(path.join(__dirname, "..", "server", "r2"));

if (!r2.r2Configured) { console.error("R2 not configured — set R2_* in .env and run with --env-file=.env"); process.exit(1); }

const UPLOAD_DIR = path.join(__dirname, "..", "server", "data", "uploads");
const CT = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".avif": "image/avif", ".mp4": "video/mp4", ".webm": "video/webm" };

const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith("--limit="));
let budget = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

// Each target: a table, its id column, and the image column(s) to migrate.
const TARGETS = [
  { table: "products",      idCol: "id",  cols: ["image"] },
  { table: "brands",        idCol: "key", cols: ["image"] },
  { table: "hero_slides",   idCol: "id",  cols: ["custom_video", "custom_poster"] },
  { table: "journal_posts", idCol: "id",  cols: ["cover_image"] },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Retry transient network/DNS errors (this box's resolver flakes under load) with
// exponential backoff, giving DNS time to recover between attempts.
async function withRetry(fn, tries = 6) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      const transient = /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|socket hang up|timeout/i.test(e.message || "");
      if (!transient) throw e;
      await sleep(400 * Math.pow(2, i) + Math.random() * 200); // 0.4s,0.8s,1.6s,3.2s,6.4s…
    }
  }
  throw lastErr;
}

async function migrateOne(url) {
  // Only local /uploads paths; leave R2/external URLs alone.
  if (!url || !String(url).startsWith("/uploads/")) return null;
  const rel = url.replace(/^\/uploads\//, "");
  const abs = path.join(UPLOAD_DIR, rel);
  if (!fs.existsSync(abs)) return null; // nothing local to move
  const ext = path.extname(abs).toLowerCase();
  const key = rel.replace(/\\/g, "/"); // preserve folder/name as the R2 key
  const body = fs.readFileSync(abs);
  return withRetry(() => r2.putObject(key, body, CT[ext] || "application/octet-stream"));
}

(async () => {
  let moved = 0, skipped = 0, missing = 0;
  for (const t of TARGETS) {
    const rows = db.prepare(`SELECT ${t.idCol} AS id, ${t.cols.join(", ")} FROM ${t.table}`).all();
    for (const row of rows) {
      for (const col of t.cols) {
        if (budget <= 0) { console.log("\n(limit reached)"); summarize(moved, skipped, missing); return; }
        const cur = row[col];
        if (!cur) continue;
        if (r2.keyFromUrl(cur)) { skipped++; continue; } // already on R2
        let newUrl;
        try { newUrl = await migrateOne(cur); }
        catch (e) { console.log(`\n  ! ${t.table}.${col} ${row.id}: ${e.message}`); continue; }
        if (!newUrl) { if (String(cur).startsWith("/uploads/")) missing++; continue; }
        db.prepare(`UPDATE ${t.table} SET ${col}=? WHERE ${t.idCol}=?`).run(newUrl, row.id);
        moved++; budget--;
        if (moved % 25 === 0) process.stdout.write(`\r  moved ${moved}…`);
        await sleep(30); // ease DNS/connection pressure
      }
    }
  }
  summarize(moved, skipped, missing);
})();

function summarize(moved, skipped, missing) {
  console.log(`\nDone. Moved ${moved} to R2 · ${skipped} already on R2 · ${missing} had no local file.`);
  process.exit(0);
}
