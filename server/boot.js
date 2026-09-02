// Production entry point. Restores the SQLite DB from the private R2 bucket
// BEFORE anything opens the database file, then hands off to the app. On a fresh
// Railway container (no volume) this pulls the latest snapshot; locally, or when
// a DB already exists, it's a no-op. See server/dbbackup.js.
try { require("dotenv").config(); } catch (_) {}

(async () => {
  try { await require("./dbbackup").restoreIfNeeded(); }
  catch (e) { console.error("boot restore error:", e?.message || e); }
  require("./index"); // opens ./db (now restored) + listens + starts backups
})();
