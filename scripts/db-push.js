// Push the current LOCAL database to the private R2 bucket as the snapshot, so a
// Railway deploy restores it on next boot. Run after you've finished the catalogue
// locally (rewrite + publish + image migration):
//   node --env-file=.env scripts/db-push.js
const path = require("path");
const backup = require(path.join(__dirname, "..", "server", "dbbackup"));

(async () => {
  if (!backup.enabled()) {
    console.error("Not configured — set R2_DB_BUCKET (a PRIVATE bucket) + R2_* in .env, run with --env-file=.env");
    process.exit(1);
  }
  const n = await backup.backupNow("manual push");
  console.log(n ? "Pushed local DB to R2. Redeploy Railway to restore it." : "Push failed — check R2_DB_BUCKET / credentials.");
  process.exit(n ? 0 : 1);
})();
