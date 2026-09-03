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
  const n = await backup.pushExternal();
  console.log(n ? `Pushed local DB to R2 (${(n/1e6).toFixed(2)} MB) + bumped push-token.\nClick "Reload catalogue from R2" in the admin (or redeploy) to apply it live.` : "Push failed — check R2_DB_BUCKET / credentials.");
  process.exit(n ? 0 : 1);
})();
