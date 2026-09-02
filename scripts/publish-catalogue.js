/* ============================================================================
   Curate + publish the imported catalogue.

   Two jobs:
     --remap     Rewrite each imported draft's messy Shopify category (388 raw
                 product_types) into one of the shop's canonical categories
                 (skincare | makeup | fragrance | body). Idempotent.
     --publish   Flip imported drafts live (is_active=1). SAFE BY DEFAULT: only
                 publishes drafts whose copy has been rewritten (meta_title set
                 by scripts/rewrite-copy.js), so the competitors' verbatim text
                 never goes live. --force ignores that guard.

   Flags: [source]  --limit=N  --skincare (only facial-skincare-tagged)  --force
   No flag → readiness summary (nothing is changed).

   Usage (repo root):
     node scripts/publish-catalogue.js                     # summary only
     node scripts/publish-catalogue.js --remap             # tidy categories
     node scripts/publish-catalogue.js --publish --limit=50 --skincare
     node scripts/publish-catalogue.js --publish --force   # publish drafts as-is
   ============================================================================ */
const path = require("path");
const db = require(path.join(__dirname, "..", "server", "db"));

// Canonical categories (must match products.jsx CATEGORIES + the categories table).
// Priority order matters: first match wins.
const CATEGORY_RULES = [
  ["makeup",    [/mascara/, /lipstick/, /\blip (balm|gloss|tint|liner|stick|crayon)/, /foundation/, /concealer/, /eyeliner/, /eyeshadow/, /\bblush\b/, /kajal/, /cushion/, /\bcompact\b/, /\bbrow\b/, /\bnail/, /makeup/, /\bprimer\b/, /setting (spray|powder)/, /highlighter/, /\bmakeup/]],
  ["fragrance", [/perfume/, /cologne/, /body mist/, /\bmist\b/, /\bedt\b/, /\bedp\b/, /eau de/, /fragrance/, /deodorant/, /roll[-\s]?on/, /antiperspirant/, /\bscent\b/]],
  ["body",      [/body/, /shower/, /\bhand (wash|cream|soap|lotion)/, /\bfoot\b/, /\bsoap\b/, /\bbath\b/, /stretch mark/, /shampoo/, /conditioner/, /\bhair\b/, /keratin/, /\bscalp/, /massage/]],
  ["skincare",  [/serum/, /cleanser/, /face wash/, /\bface\b/, /moistur/, /\btoner\b/, /\bmask\b/, /\bspf\b/, /sun ?(care|screen|block)/, /essence/, /skin ?care/, /\bscrub\b/, /\beye (cream|serum|gel)/, /ampoule/, /exfoliat/, /\bcream\b/, /\bgel\b/, /\blotion\b/, /\boil\b/, /\bpeel\b/, /niacinamide|retinol|hyaluronic|vitamin ?c/]],
];
const CANONICAL = new Set(["skincare", "makeup", "fragrance", "body"]);

function canonicalCategory(hay) {
  for (const [key, pats] of CATEGORY_RULES) if (pats.some(re => re.test(hay))) return key;
  return "skincare"; // sensible default for a beauty store's ambiguous items
}

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const only = args.find(a => !a.startsWith("--"));
const limitArg = args.find(a => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 0;

const base = "FROM products p WHERE p.import_source IS NOT NULL" + (only ? " AND p.import_source LIKE @src" : "");
const srcParam = only ? { src: "%" + only.toLowerCase() + "%" } : {};

// Ensure the canonical categories exist in the categories table (idempotent).
const catSeed = db.prepare("INSERT OR IGNORE INTO categories (key,label,sort) VALUES (?,?,?)");
[["skincare", "Skincare", 0], ["makeup", "Makeup", 1], ["fragrance", "Fragrance", 2], ["body", "Body & Hair", 3]].forEach(([k, l, s]) => catSeed.run(k, l, s));

if (has("--remap")) {
  const rows = db.prepare(`SELECT p.id, p.name, p.category, p.import_handle ${base}`).all(srcParam);
  const upd = db.prepare("UPDATE products SET category=? WHERE id=?");
  let changed = 0;
  for (const r of rows) {
    if (CANONICAL.has(r.category)) continue; // already canonical
    const hay = [r.name, r.category, (r.import_handle || "").replace(/-/g, " ")].join(" ").toLowerCase();
    const cat = canonicalCategory(hay);
    if (cat !== r.category) { upd.run(cat, r.id); changed++; }
  }
  console.log(`Remapped ${changed} of ${rows.length} imported products to canonical categories.`);
  const dist = db.prepare(`SELECT p.category k, COUNT(*) n ${base} GROUP BY p.category ORDER BY n DESC`).all(srcParam);
  console.log("  now: " + dist.map(d => `${d.k}=${d.n}`).join(" · "));
}

if (has("--publish")) {
  const force = has("--force");
  const skincareOnly = has("--skincare");
  let sql = `SELECT p.id ${base} AND (p.is_active IS NULL OR p.is_active = 0)`;
  if (!force) sql += " AND p.meta_title IS NOT NULL AND p.meta_title <> ''"; // only rewritten drafts
  if (skincareOnly) sql += " AND EXISTS (SELECT 1 FROM product_skin_types s WHERE s.product_id = p.id)";
  sql += " ORDER BY p.import_source, p.id";
  let rows = db.prepare(sql).all(srcParam);
  if (limit) rows = rows.slice(0, limit);
  const pub = db.prepare("UPDATE products SET is_active=1 WHERE id=?");
  const tx = db.transaction((ids) => ids.forEach(id => pub.run(id)));
  tx(rows.map(r => r.id));
  console.log(`Published ${rows.length} drafts${force ? " (--force: copy not required)" : " (rewritten copy only)"}${skincareOnly ? ", skincare-tagged only" : ""}.`);
  if (!force && rows.length === 0) console.log("  Nothing published — run scripts/rewrite-copy.js first, or pass --force to publish as-is.");
}

if (!has("--remap") && !has("--publish")) {
  const n = (w) => db.prepare(`SELECT COUNT(*) c ${base} AND ${w}`).get(srcParam).c;
  const total = db.prepare(`SELECT COUNT(*) c ${base}`).get(srcParam).c;
  console.log("Imported catalogue readiness" + (only ? ` (${only})` : "") + ":");
  console.log("  total drafts        : " + total);
  console.log("  published (live)    : " + n("(p.is_active = 1)"));
  console.log("  copy rewritten      : " + n("(p.meta_title IS NOT NULL AND p.meta_title <> '')"));
  console.log("  skincare-tagged     : " + n("EXISTS (SELECT 1 FROM product_skin_types s WHERE s.product_id = p.id)"));
  const dist = db.prepare(`SELECT p.category k, COUNT(*) n ${base} GROUP BY p.category ORDER BY n DESC LIMIT 8`).all(srcParam);
  console.log("  top categories      : " + dist.map(d => `${d.k}=${d.n}`).join(" · "));
  console.log("\nNext: --remap to tidy categories, rewrite-copy.js for copy, then --publish.");
}
