// SQLite durability on ephemeral hosts (Railway, no volume) via Cloudflare R2.
// On boot we restore the DB from a PRIVATE R2 bucket if there's no local file;
// while running we snapshot it to R2 periodically and on shutdown. Keeps the
// app's synchronous SQLite exactly as-is — no Postgres/async rewrite.
//
//   R2_DB_BUCKET   a PRIVATE bucket (NEVER the public media bucket — the DB has
//                  password hashes + orders). Unset → backups disabled.
//
// restoreIfNeeded() must run BEFORE ./db is required (it opens/creates the file),
// so it only touches fs + R2, never ./db.
const fs = require("fs");
const path = require("path");
const r2 = require("./r2");

const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "vitrine.db");
const DB_BUCKET = process.env.R2_DB_BUCKET || "";
const KEY = "vitrine.db";
const enabled = () => !!(r2.r2Configured && DB_BUCKET);

async function restoreIfNeeded() {
  if (!enabled()) return;
  try {
    if (fs.existsSync(DB_PATH) && fs.statSync(DB_PATH).size > 0) return; // already have data
    const buf = await r2.getObjectFrom(DB_BUCKET, KEY);
    if (!buf) { console.log("db: no R2 snapshot yet — starting fresh (will seed)"); return; }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_PATH, buf);
    // Drop any stale WAL/SHM so the restored snapshot is the source of truth.
    for (const s of ["-wal", "-shm"]) { try { fs.unlinkSync(DB_PATH + s); } catch {} }
    console.log(`db: restored ${(buf.length / 1e6).toFixed(2)} MB from R2`);
  } catch (e) { console.error("db restore failed:", e?.message || e); }
}

// A consistent copy via VACUUM INTO (safe to take while the DB is in use).
function snapshotBuffer() {
  const db = require("./db"); // lazy — only after restore + open
  const tmp = path.join(DATA_DIR, `.snapshot-${process.pid}-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  const buf = fs.readFileSync(tmp);
  try { fs.unlinkSync(tmp); } catch {}
  return buf;
}

let backingUp = false;
async function backupNow(reason) {
  if (!enabled() || backingUp) return 0;
  backingUp = true;
  try {
    const buf = snapshotBuffer();
    await r2.putObjectTo(DB_BUCKET, KEY, buf, "application/x-sqlite3");
    console.log(`db: backed up ${(buf.length / 1e6).toFixed(2)} MB to R2${reason ? " (" + reason + ")" : ""}`);
    return buf.length;
  } catch (e) { console.error("db backup failed:", e?.message || e); return 0; }
  finally { backingUp = false; }
}

function startBackups(intervalMs = 120000) {
  if (!enabled()) { if (r2.r2Configured) console.log("db: R2_DB_BUCKET unset — DB backups OFF"); return; }
  // Never back up a demo/seed-only DB — it would overwrite a real R2 snapshot with
  // placeholder data (e.g. a fresh container that auto-seeded before real data loaded).
  // Only arm once real catalogue data is present.
  let real = false;
  try { real = require("./db").prepare("SELECT 1 FROM products WHERE import_source IS NOT NULL LIMIT 1").get() != null; } catch (e) {}
  if (!real) { console.log("db: seed-only DB — backups OFF (protects the R2 snapshot)"); return; }
  const timer = setInterval(() => backupNow("interval"), intervalMs);
  timer.unref && timer.unref();
  let closing = false;
  const onExit = (sig) => {
    if (closing) return; closing = true;
    backupNow(sig).finally(() => process.exit(0));
  };
  process.on("SIGTERM", () => onExit("SIGTERM"));
  process.on("SIGINT", () => onExit("SIGINT"));
  console.log(`db: R2 backups ON → ${DB_BUCKET} every ${Math.round(intervalMs / 1000)}s`);
}

module.exports = { restoreIfNeeded, backupNow, startBackups, DB_PATH, enabled };
