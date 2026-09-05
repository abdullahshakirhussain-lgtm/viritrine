/* Clear Brandfetch placeholder logos (blank fallback, or the generic "Brandfetch"
   wordmark returned when a domain has no real logo). Real logos are unique per
   brand; placeholders are byte-identical across many. We hash each R2 logo —
   ONLY counting genuine image responses (with retries, so network errors never
   masquerade as a shared placeholder) — and clear any hash shared by >=5 brands,
   plus the known blank fallback. Cleared brands fall back to a clean name tile.
     node --env-file=.env scripts/clean-placeholder-logos.js --dry
     node --env-file=.env scripts/clean-placeholder-logos.js */
const path = require("path");
const crypto = require("crypto");
const db = require(path.join(__dirname, "..", "server", "db"));

const DRY = process.argv.includes("--dry");
const BLANK_MD5 = "b23c4e5871012e6e52f025bb3d625e83"; // 606b transparent fallback
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getImage(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 12000);
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/*" }, signal: ac.signal });
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (r.ok && ct.startsWith("image/")) return Buffer.from(await r.arrayBuffer());
      return null; // a real non-image response (won't retry)
    } catch { await sleep(500 * (i + 1)); } // network hiccup → retry
    finally { clearTimeout(t); }
  }
  return undefined; // fetch kept failing → unknown, leave the brand alone
}

(async () => {
  const rows = db.prepare("SELECT key, name, image FROM brands WHERE image LIKE 'https://pub-%'").all();
  console.log("hashing", rows.length, "logos (image-only)…");
  const byHash = {}; let ok = 0, failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const buf = await getImage(rows[i].image);
    if (buf) { const h = crypto.createHash("md5").update(buf).digest("hex"); (byHash[h] = byHash[h] || []).push(rows[i]); ok++; }
    else if (buf === undefined) failed++;
    if ((i + 1) % 25 === 0) process.stdout.write(`\r  ${i + 1}/${rows.length}`);
    await sleep(25);
  }
  console.log(`\nhashed ${ok} · unreadable(skipped) ${failed}`);
  const toClear = [];
  for (const [h, list] of Object.entries(byHash)) {
    if (h === BLANK_MD5 || list.length >= 5) toClear.push(...list);
  }
  const groups = Object.entries(byHash).filter(([h, l]) => h === BLANK_MD5 || l.length >= 5).sort((a, b) => b[1].length - a[1].length);
  console.log("placeholder groups:");
  for (const [h, l] of groups) console.log(`  ${l.length}×  ${h.slice(0, 8)}  e.g. ${l.slice(0, 6).map(b => b.name).join(", ")}`);
  console.log(`${DRY ? "[dry] would clear" : "clearing"} ${toClear.length} placeholder logos.`);
  if (!DRY && toClear.length) { const upd = db.prepare("UPDATE brands SET image=NULL WHERE key=?"); db.transaction(() => toClear.forEach(b => upd.run(b.key)))(); }
  console.log("done. remaining with logos:", db.prepare("SELECT COUNT(*) c FROM brands WHERE image LIKE 'https://pub-%'").get().c);
  process.exit(0);
})();
