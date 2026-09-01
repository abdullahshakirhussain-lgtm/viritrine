/* ============================================================================
   One-time competitor import → VITRINE drafts.
   All three targets are Shopify, so this reads each store's public
   /products.json (paginated) and maps it into the products table as UNPUBLISHED
   drafts (is_active=0, import_source set). Images are downloaded to our own
   /uploads/products. De-dupes on (import_source, import_handle) so re-runs are
   safe. Review + publish/replace in the admin "Imports" page.

   Usage (from the repo root):
     node scripts/import.js                 # all sites, full catalogue
     node scripts/import.js essentials      # only the site whose source matches
     node scripts/import.js essentials --limit=8   # dry pass: first 8 products
   ============================================================================ */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const db = require(path.join(__dirname, "..", "server", "db"));

const UPLOAD_DIR = path.join(__dirname, "..", "server", "data", "uploads", "products");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const SITES = [
  { source: "essentials.lk", base: "https://www.essentials.lk" },
  { source: "orionxoxo.lk",  base: "https://orionxoxo.lk" },
  { source: "cosmetics.lk",  base: "https://cosmetics.lk" },
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const slug = (s) => (s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 56) || "x";
const stripHtml = (h) => (h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&").replace(/&#?[a-z0-9]+;/gi, " ").replace(/\s+/g, " ").trim().slice(0, 1800);
const parseSize = (t) => { const m = (t || "").match(/(\d+(?:\.\d+)?)\s?(ml|g|kg|l|oz|pcs|pieces|pack|tablets|caps|capsules|sheets)\b/i); return m ? m[0].replace(/\s+/g, "") : null; };

async function fetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

function ensureBrand(vendor) {
  const name = (vendor || "").trim() || "Unbranded";
  const key = slug(name);
  if (!db.prepare("SELECT key FROM brands WHERE key=?").get(key)) {
    const m = db.prepare("SELECT COALESCE(MAX(sort),0) m FROM brands").get().m;
    db.prepare("INSERT INTO brands (key,name,loc,sort) VALUES (?,?,?,?)").run(key, name, "", m + 1);
  }
  return key;
}

async function downloadImage(src, id) {
  if (!src) return null;
  try {
    const r = await fetch(src, { headers: { "User-Agent": UA } });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    let ext = ".jpg";
    if (ct.includes("png") || /\.png(\?|$)/i.test(src)) ext = ".png";
    else if (ct.includes("webp") || /\.webp(\?|$)/i.test(src)) ext = ".webp";
    else if (ct.includes("gif") || /\.gif(\?|$)/i.test(src)) ext = ".gif";
    const fname = id + "-" + crypto.randomBytes(4).toString("hex") + ext;
    fs.writeFileSync(path.join(UPLOAD_DIR, fname), buf);
    return "/uploads/products/" + fname;
  } catch { return null; }
}

function priceMap(v) {
  // Shopify products.json prices are decimal strings in the store currency (LKR).
  const price = Math.round(parseFloat(v.price || "0")) || 0;
  const cmp = v.compare_at_price ? Math.round(parseFloat(v.compare_at_price)) : 0;
  if (cmp && cmp > price) return { price: cmp, sale: price, off: Math.round((1 - price / cmp) * 100) };
  return { price, sale: null, off: null };
}

const insert = db.prepare(`INSERT INTO products
  (id,brand_key,name,category,sub,size,variant,copy,price,sale_price,off_pct,is_new,is_bestseller,is_active,stock,image,import_source,import_handle)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

async function importSite(site, opts) {
  console.log("\n== " + site.source + " ==");
  let page = 1, total = 0, imported = 0, skipped = 0, imgs = 0;
  while (true) {
    let data;
    try { data = await fetchJson(site.base + "/products.json?limit=250&page=" + page); }
    catch (e) { console.log("  page " + page + " failed (" + e.message + ")" + (page === 1 ? " — this store may block products.json; skipping" : "")); break; }
    const prods = data.products || [];
    if (!prods.length) break;
    for (const p of prods) {
      total++;
      if (opts.limit && imported >= opts.limit) { console.log("\n  (dry limit reached)"); return { total, imported, skipped, imgs }; }
      if (db.prepare("SELECT id FROM products WHERE import_source=? AND import_handle=?").get(site.source, p.handle)) { skipped++; continue; }
      const v = (p.variants && p.variants[0]) || {};
      const pm = priceMap(v);
      const brandKey = ensureBrand(p.vendor);
      const id = "imp-" + slug(site.source).slice(0, 4) + "-" + slug(p.handle).slice(0, 40) + "-" + crypto.randomBytes(2).toString("hex");
      const image = (p.images && p.images[0]) ? await downloadImage(p.images[0].src, id) : null;
      if (image) imgs++;
      insert.run(
        id, brandKey, p.title,
        ((p.product_type || "").trim().toLowerCase() || "uncategorized"),
        (p.product_type || null), parseSize(v.title) || parseSize(p.title), "jar",
        stripHtml(p.body_html), pm.price, pm.sale, pm.off, 0, 0, 0 /* draft */,
        (v.available ? 25 : 0), image, site.source, p.handle,
      );
      imported++;
      process.stdout.write(imported % 10 === 0 ? "" + imported : ".");
      await sleep(120); // be a polite guest
    }
    if (prods.length < 250) break;
    page++;
  }
  console.log("\n  fetched " + total + " · imported " + imported + " · skipped(dupe) " + skipped + " · images " + imgs);
  return { total, imported, skipped, imgs };
}

(async () => {
  const args = process.argv.slice(2);
  const only = args.find(a => !a.startsWith("--"));
  const limitArg = args.find(a => a.startsWith("--limit="));
  const opts = { limit: limitArg ? parseInt(limitArg.split("=")[1], 10) : 0 };
  const sites = only ? SITES.filter(s => s.source.includes(only.toLowerCase())) : SITES;
  if (!sites.length) { console.log("No site matches '" + only + "'. Options: " + SITES.map(s => s.source).join(", ")); process.exit(1); }
  const totals = { imported: 0, skipped: 0, imgs: 0 };
  for (const s of sites) { const r = await importSite(s, opts); totals.imported += r.imported; totals.skipped += r.skipped; totals.imgs += r.imgs; }
  console.log("\n──\nDone. Imported " + totals.imported + " drafts (" + totals.imgs + " images), skipped " + totals.skipped + " dupes.");
  console.log("Review + publish at /admin-imports.html\n");
  process.exit(0);
})();
