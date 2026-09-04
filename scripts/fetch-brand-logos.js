/* ============================================================================
   Fetch brand logos from Brandfetch → R2 → brands.image.
   Uses the Brandfetch Search API to resolve each brand name to a domain, then the
   Brandfetch Logo Link CDN to pull the logo, uploads it to R2, and sets
   brands.image. Idempotent: brands already pointing at an R2 logo are skipped
   (use --force to refetch). Misses stay name-only (fill via admin later).

   Needs a free Brandfetch client id in .env (BRANDFETCH_CLIENT_ID, or
   BRANDFETCH_API_KEY as a fallback name). Run with the env loaded:
     node --env-file=.env scripts/fetch-brand-logos.js --limit=10   # dry-ish test
     node --env-file=.env scripts/fetch-brand-logos.js              # all brands
     node --env-file=.env scripts/fetch-brand-logos.js --force      # refetch all

   After a run: node scripts/db-push.js  →  admin "Reload catalogue from R2".
   ============================================================================ */
const path = require("path");
const crypto = require("crypto");
const db = require(path.join(__dirname, "..", "server", "db"));
const r2 = require(path.join(__dirname, "..", "server", "r2"));

const KEY = process.env.BRANDFETCH_CLIENT_ID || process.env.BRANDFETCH_API_KEY || "";
if (!r2.r2Configured) { console.error("R2 not configured — set R2_* in .env, run with --env-file=.env"); process.exit(1); }
if (!KEY) { console.error("Set BRANDFETCH_CLIENT_ID (or BRANDFETCH_API_KEY) in .env"); process.exit(1); }

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const limitArg = args.find(a => a.startsWith("--limit="));
let budget = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const CT_EXT = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/svg+xml": ".svg", "image/x-icon": ".ico", "image/vnd.microsoft.icon": ".ico" };
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// fetch with a hard timeout (this box's DNS stalls without one → the whole run hangs).
async function fetchT(url, opts = {}, ms = 15000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(t); }
}

async function withRetry(fn, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      if (!/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|socket hang up|timeout|HTTP 429|HTTP 5/i.test(e.message || "")) throw e;
      await sleep(500 * Math.pow(2, i) + Math.random() * 200);
    }
  }
  throw last;
}

// Resolve a brand name → best-matching domain via the Brandfetch Search API.
async function resolveDomain(name) {
  const url = `https://api.brandfetch.io/v2/search/${encodeURIComponent(name)}?c=${encodeURIComponent(KEY)}`;
  const r = await fetchT(url, { headers: { Accept: "application/json", "User-Agent": UA } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const list = await r.json();
  if (!Array.isArray(list) || !list.length) return null;
  const want = norm(name);
  // Prefer exact normalized-name match, then verified, then the first result.
  const exact = list.find(x => norm(x.name) === want) || list.find(x => norm(x.name).includes(want) || want.includes(norm(x.name)));
  return (exact || list.find(x => x.verified) || list[0]).domain || null;
}

// Download the Logo Link CDN image for a domain.
async function fetchLogo(domain) {
  const url = `https://cdn.brandfetch.io/${domain}/w/400/logo?c=${encodeURIComponent(KEY)}`;
  const r = await fetchT(url, { redirect: "follow", headers: { Accept: "image/*", "User-Agent": UA } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const ct = (r.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (!ct.startsWith("image/")) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 300) return null; // reject empty/placeholder
  return { buf, ext: CT_EXT[ct] || ".png", ct };
}

(async () => {
  const brands = db.prepare("SELECT key, name, image FROM brands ORDER BY (SELECT COUNT(*) FROM products p WHERE p.brand_key=brands.key AND (p.is_active IS NULL OR p.is_active=1)) DESC").all();
  let done = 0, skipped = 0, missed = 0;
  for (const b of brands) {
    if (budget <= 0) { console.log("\n(limit reached)"); break; }
    if (!FORCE && r2.keyFromUrl(b.image)) { skipped++; continue; } // already has an R2 logo
    try {
      const domain = await resolveDomain(b.name);
      if (!domain) { missed++; process.stdout.write("·"); await sleep(150); continue; }
      const logo = await withRetry(() => fetchLogo(domain));
      if (!logo) { missed++; process.stdout.write("·"); await sleep(150); continue; }
      const rkey = `brands/${b.key}-${crypto.randomBytes(3).toString("hex")}${logo.ext}`;
      const url = await r2.putObject(rkey, logo.buf, logo.ct);
      db.prepare("UPDATE brands SET image=? WHERE key=?").run(url, b.key);
      done++; budget--;
      process.stdout.write(done % 10 === 0 ? String(done) : "•");
    } catch (e) { missed++; process.stdout.write("x"); }
    await sleep(160);
  }
  console.log(`\nDone. logos set ${done} · already had ${skipped} · missed ${missed}. Next: node scripts/db-push.js → admin "Reload from R2".`);
  process.exit(0);
})();
