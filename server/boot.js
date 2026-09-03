// Production entry point. Restores the SQLite DB from the private R2 bucket
// BEFORE anything opens the database file, then hands off to the app. On a fresh
// Railway container (no volume) this pulls the latest snapshot; locally, or when
// a DB already exists, it's a no-op. See server/dbbackup.js.
try { require("dotenv").config(); } catch (_) {}

(async () => {
  const backup = require("./dbbackup");
  try {
    // An admin "reload" stages a snapshot to swap in on this boot; else restore
    // from R2 when there's no local DB. Both run before ./db opens the file.
    if (!backup.applyIncomingIfPresent()) await backup.restoreIfNeeded();
  } catch (e) { console.error("boot db-prep error:", e?.message || e); }
  require("./index"); // opens ./db (now restored) + listens + starts backups
})();
