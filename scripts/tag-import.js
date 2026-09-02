/* ============================================================================
   Bulk-tag imported products with skin types + concerns.

   For each imported draft (import_source set) it builds a keyword "haystack"
   from the product's Shopify tags (re-fetched per handle), plus the locally
   stored name / copy / handle, and maps it to:
     • skin_types    (oily, dry, combination, normal, sensitive)
     • concerns      (existing catalogue: brightening, anti-aging, hydration,
                      sensitive, oily, dry)
   Additive + idempotent (INSERT OR IGNORE) so re-runs and manual edits are safe.

   Usage (from repo root):
     node scripts/tag-import.js                # all drafts, re-pull tags
     node scripts/tag-import.js --no-fetch     # instant: local name/copy/handle only
     node scripts/tag-import.js --limit=20     # dry pass over the first 20
     node scripts/tag-import.js cosmetics      # only one source
   ============================================================================ */
const path = require("path");
const db = require(path.join(__dirname, "..", "server", "db"));

const BASE = {
  "essentials.lk": "https://www.essentials.lk",
  "orionxoxo.lk":  "https://orionxoxo.lk",
  "cosmetics.lk":  "https://cosmetics.lk",
};
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// key → case-insensitive patterns. Kept specific: the competitors' marketing copy
// is saturated with soft words ("gentle", "glow", "moisturising"), so we lean on
// explicit skin/concern signals and cap how many tags a product can earn.
const SKIN_RULES = {
  oily:        [/oily/, /oil[-\s]?free/, /oil[-\s]?control/, /mattif/, /\bacne/, /blemish/, /\bsebum/, /breakout/, /anti[-\s]?acne/, /\bpimple/, /salicylic/, /\bbha\b/],
  dry:         [/\bdry skin/, /very dry/, /extra dry/, /dehydrat/, /for dry/, /dryness/],
  combination: [/combination/, /combo skin/, /normal to (oily|dry)/],
  normal:      [/normal skin/, /all skin types/, /every skin type/],
  sensitive:   [/sensitive/, /redness/, /fragrance[-\s]?free/, /hypoallergenic/, /eczema/, /rosacea/, /\bcica\b/, /centella/, /for sensitive/, /calming/, /soothing/],
};
const CONCERN_RULES = {
  brightening:  [/bright/, /whiten/, /\bglow/, /radian/, /vitamin\s?c\b/, /\bvit\s?c\b/, /dark spot/, /spot correct/, /pigment/, /even (tone|skin)/, /niacinamide/, /glutathione/, /kojic/, /arbutin/, /\bdull/],
  "anti-aging": [/anti[-\s]?aging/, /anti[-\s]?age/, /wrinkle/, /fine line/, /\bfirm/, /retinol/, /retinal/, /bakuchiol/, /collagen/, /peptide/, /\blifting/, /mature skin/],
  hydration:    [/hydrat/, /hyaluronic/, /\bdewy/, /\bplump/, /moisture[-\s]?boost/, /deeply moistur/, /intense moistur/],
  sensitive:    [/sensitive/, /redness/, /\bcica\b/, /centella/, /fragrance[-\s]?free/, /soothing/, /calming/, /barrier repair/],
  oily:         [/oily/, /oil[-\s]?free/, /oil[-\s]?control/, /\bacne/, /\bsebum/, /blemish/, /mattif/, /salicylic/, /\bbha\b/, /breakout/, /clogged pore/],
  dry:          [/\bdry skin/, /dehydrat/, /very dry/, /flaky/, /for dry/],
};
const MAX_SKIN = 2, MAX_CONCERN = 3;

// Skin type / concern only make sense for FACIAL skincare. The imported catalogue
// is full of hair, body, oral, fragrance, makeup and supplements — skip those so
// they don't pollute the skin/concern buckets. Denylist over name+category+handle.
const NON_FACIAL = [
  /shampoo/, /conditioner/, /\bhair\b/, /hair (oil|colou?r|mask|serum|care|spray|cream)/, /keratin/, /\bcurl/, /leave[-\s]?in/, /\bscalp/,
  /body (lotion|wash|cream|butter|care|mist|scrub|oil|spray|soap)/, /shower (gel|cream)/, /hand (wash|cream|soap|lotion)/, /\bfoot\b/, /stretch mark/, /\bmassage\b/,
  /\btablets?\b/, /\bcapsules?\b/, /supplement/, /\bgumm/, /mouthwash/, /toothpaste/, /\bsachet/, /collagen (tablet|builder|powder|drink|beauty)/,
  /perfume/, /cologne/, /body mist/, /\bedt\b/, /\bedp\b/, /eau de/, /deodorant/, /roll[-\s]?on/, /antiperspirant/, /\bfragrance\b(?![-\s]?free)/,
  /mascara/, /lipstick/, /lip (balm|gloss|tint|liner)/, /foundation/, /concealer/, /eyeliner/, /eyeshadow/, /\bblush\b/, /\bnail/, /kajal/, /cushion/, /\bcompact\b/,
  /gift set/, /mosquito/, /insect/, /sanitiz/, /\bsoap bar\b/, /\bwipes?\b/,
];
const isFacialSkincare = (hay) => !NON_FACIAL.some(re => re.test(hay));

// Return the best keys for a haystack: patterns matched per key, ranked, capped.
const scoreKeys = (rules, hay, cap) =>
  Object.keys(rules)
    .map(k => [k, rules[k].reduce((n, re) => n + (re.test(hay) ? 1 : 0), 0)])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, cap)
    .map(([k]) => k);

async function fetchTags(source, handle) {
  const base = BASE[source]; if (!base) return "";
  try {
    const r = await fetch(`${base}/products/${handle}.json`, { headers: { "User-Agent": UA, "Accept": "application/json" } });
    if (!r.ok) return "";
    const p = (await r.json()).product || {};
    return Array.isArray(p.tags) ? p.tags.join(" ") : String(p.tags || "");
  } catch { return ""; }
}

const insSkin    = db.prepare("INSERT OR IGNORE INTO product_skin_types (product_id, skin_type) VALUES (?, ?)");
const insConcern = db.prepare("INSERT OR IGNORE INTO product_concerns (product_id, concern) VALUES (?, ?)");

(async () => {
  const args = process.argv.slice(2);
  const noFetch = args.includes("--no-fetch");
  const reset = args.includes("--reset");
  const only = args.find(a => !a.startsWith("--"));
  const limitArg = args.find(a => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 0;

  let sql = "SELECT id, name, category, copy, import_handle, import_source FROM products WHERE import_source IS NOT NULL";
  const params = [];
  if (only) { sql += " AND import_source LIKE ?"; params.push("%" + only.toLowerCase() + "%"); }
  sql += " ORDER BY import_source, id";
  let rows = db.prepare(sql).all(...params);
  if (limit) rows = rows.slice(0, limit);

  if (reset) {
    const ids = rows.map(r => r.id);
    const chunk = 500;
    for (let k = 0; k < ids.length; k += chunk) {
      const part = ids.slice(k, k + chunk); const qs = part.map(() => "?").join(",");
      db.prepare(`DELETE FROM product_skin_types WHERE product_id IN (${qs})`).run(...part);
      db.prepare(`DELETE FROM product_concerns   WHERE product_id IN (${qs})`).run(...part);
    }
    console.log(`Reset tags on ${ids.length} imported products.`);
  }

  console.log(`Tagging ${rows.length} products${noFetch ? " (local fields only)" : " (re-pulling Shopify tags)"}…`);
  let skinN = 0, concernN = 0, i = 0, skipped = 0;
  for (const r of rows) {
    const gateHay = [r.name, r.category, (r.import_handle || "").replace(/-/g, " ")].join(" ").toLowerCase();
    if (!isFacialSkincare(gateHay)) { skipped++; if (++i % 50 === 0) process.stdout.write(`\r  ${i}/${rows.length}`); continue; }
    const tags = noFetch ? "" : await fetchTags(r.import_source, r.import_handle);
    // Skin type: explicit signals only (tags/name/handle) — copy is too noisy.
    const skinHay    = [tags, r.name, (r.import_handle || "").replace(/-/g, " ")].join(" ").toLowerCase();
    const concernHay = [tags, r.name, r.copy, (r.import_handle || "").replace(/-/g, " ")].join(" ").toLowerCase();
    const skins    = scoreKeys(SKIN_RULES, skinHay, MAX_SKIN);
    const concerns = scoreKeys(CONCERN_RULES, concernHay, MAX_CONCERN);
    for (const s of skins)    { insSkin.run(r.id, s);    skinN++; }
    for (const c of concerns) { insConcern.run(r.id, c); concernN++; }
    if (++i % 50 === 0) process.stdout.write(`\r  ${i}/${rows.length}`);
    if (!noFetch) await sleep(90); // be a polite guest
  }
  console.log(`\nDone. ${i} products · ${skipped} non-facial skipped · ${skinN} skin-type tags · ${concernN} concern tags added (idempotent).`);
  // Coverage snapshot
  for (const t of [["skin_types", "product_skin_types", "skin_type"], ["concerns", "product_concerns", "concern"]]) {
    const rows2 = db.prepare(`SELECT ${t[2]} k, COUNT(*) n FROM ${t[1]} GROUP BY ${t[2]} ORDER BY n DESC`).all();
    console.log(`  ${t[0]}: ` + rows2.map(x => `${x.k}=${x.n}`).join(" · "));
  }
  process.exit(0);
})();
