// SQLite durability on ephemeral hosts (Railway, no volume) via Cloudflare R2.
// On boot we restore the DB from a PRIVATE R2 bucket if there's no local file;
// while running we snapshot it to R2 periodically and on shutdown. Keeps the
// app's synchronous SQLite exactly as-is — no Postgres/async rewrite.
//
//   R2_DB_BUCKET   a PRIVATE bucket (NEVER the public media bucket — the DB has
//                  password hashes + orders). Unset → backups disabled.
//
// A "push-token" makes external pushes (scripts/db-push.js) authoritative: when a
// push writes a new token, running instances detect it and STOP backing up (so
// they can't clobber the pushed snapshot). An admin "reload" then stages the
// pushed snapshot and restarts to apply it.
//
// restoreIfNeeded()/applyIncomingIfPresent() must run BEFORE ./db is required (it
// opens/creates the file), so they only touch fs + R2, never ./db.
const fs = require("fs");
const path = require("path");
const r2 = require("./r2");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "vitrine.db");
const INCOMING = DB_PATH + ".incoming";
const DB_BUCKET = process.env.R2_DB_BUCKET || "";
const KEY = "vitrine.db";
const TOKEN_KEY = "db/push-token";
const enabled = () => !!(r2.r2Configured && DB_BUCKET);

let lastToken = null; // the push-token this instance's data corresponds to

async function readToken() {
  try { const b = await r2.getObjectFrom(DB_BUCKET, TOKEN_KEY); return b ? b.toString() : null; }
  catch { return null; }
}

// Validate a candidate DB file (must be SQLite with products). Returns row count.
function validateDb(file) {
  const t = new DatabaseSync(file, { readOnly: true });
  try { return t.prepare("SELECT COUNT(*) c FROM products").get().c; }
  finally { try { t.close(); } catch {} }
}

async function restoreIfNeeded() {
  if (!enabled()) return;
  try {
    if (fs.existsSync(DB_PATH) && fs.statSync(DB_PATH).size > 0) return; // already have data
    const buf = await r2.getObjectFrom(DB_BUCKET, KEY);
    if (!buf) { console.log("db: no R2 snapshot yet — starting fresh (will seed)"); return; }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_PATH, buf);
    for (const s of ["-wal", "-shm"]) { try { fs.unlinkSync(DB_PATH + s); } catch {} }
    console.log(`db: restored ${(buf.length / 1e6).toFixed(2)} MB from R2`);
  } catch (e) { console.error("db restore failed:", e?.message || e); }
}

// If an admin reload staged a snapshot, swap it in before the DB opens.
function applyIncomingIfPresent() {
  if (!fs.existsSync(INCOMING)) return false;
  try {
    const n = validateDb(INCOMING);
    if (!n) throw new Error("staged snapshot has no products");
    fs.renameSync(INCOMING, DB_PATH);
    for (const s of ["-wal", "-shm"]) { try { fs.unlinkSync(DB_PATH + s); } catch {} }
    console.log(`db: applied staged R2 reload (${n} products)`);
    return true;
  } catch (e) { console.error("apply staged reload failed:", e?.message || e); try { fs.unlinkSync(INCOMING); } catch {} return false; }
}

// A consistent copy via VACUUM INTO (safe to take while the DB is in use).
function snapshotBuffer() {
  const db = require("./db"); // lazy — only after the DB is open
  const tmp = path.join(DATA_DIR, `.snapshot-${process.pid}-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  const buf = fs.readFileSync(tmp);
  try { fs.unlinkSync(tmp); } catch {}
  return buf;
}

let backingUp = false;
async function backupNow(reason) {
  if (!enabled() || backingUp) return 0;
  // Don't clobber an external push: if R2's token changed since we loaded, a
  // db-push happened — leave it for a reload to apply.
  const cur = await readToken();
  if (cur && lastToken && cur !== lastToken) {
    console.log("db: external push detected (token changed) — skipping backup; reload to apply");
    return 0;
  }
  backingUp = true;
  try {
    const buf = snapshotBuffer();
    await r2.putObjectTo(DB_BUCKET, KEY, buf, "application/x-sqlite3");
    console.log(`db: backed up ${(buf.length / 1e6).toFixed(2)} MB to R2${reason ? " (" + reason + ")" : ""}`);
    return buf.length;
  } catch (e) { console.error("db backup failed:", e?.message || e); return 0; }
  finally { backingUp = false; }
}

// Used by scripts/db-push.js: upload the local DB AND bump the push-token so live
// instances yield to it.
async function pushExternal() {
  if (!enabled()) throw new Error("R2_DB_BUCKET not set");
  const buf = snapshotBuffer();
  await r2.putObjectTo(DB_BUCKET, KEY, buf, "application/x-sqlite3");
  const token = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  await r2.putObjectTo(DB_BUCKET, TOKEN_KEY, Buffer.from(token), "text/plain");
  return buf.length;
}

// Used by the admin reload endpoint: pull R2's snapshot to a staged file (applied
// on next boot). Returns product count. Does NOT touch the live DB file.
async function stageReloadFromR2() {
  if (!enabled()) throw new Error("R2_DB_BUCKET not set");
  const buf = await r2.getObjectFrom(DB_BUCKET, KEY);
  if (!buf) throw new Error("no snapshot in R2");
  fs.writeFileSync(INCOMING, buf);
  let n;
  try { n = validateDb(INCOMING); } catch (e) { try { fs.unlinkSync(INCOMING); } catch {} throw new Error("invalid snapshot: " + e.message); }
  if (!n) { try { fs.unlinkSync(INCOMING); } catch {} throw new Error("snapshot has no products"); }
  return n;
}

function startBackups(intervalMs = 120000) {
  if (!enabled()) { if (r2.r2Configured) console.log("db: R2_DB_BUCKET unset — DB backups OFF"); return; }
  let real = false;
  try { real = require("./db").prepare("SELECT 1 FROM products WHERE import_source IS NOT NULL LIMIT 1").get() != null; } catch (e) {}
  if (!real) { console.log("db: seed-only DB — backups OFF (protects the R2 snapshot)"); return; }
  readToken().then(t => { lastToken = t; }); // remember the token our data matches
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

module.exports = { restoreIfNeeded, applyIncomingIfPresent, backupNow, pushExternal, stageReloadFromR2, startBackups, DB_PATH, enabled };
