/* Tidy the imported brand list: merge duplicate spellings, and bucket obvious
   non-brands (store names, raw ingredients, tools, "giftset") under a neutral
   "Other" brand so the brand nav/filter isn't full of junk. Idempotent.
     node scripts/clean-brands.js
   Products keep working (still browsable by category); only their brand label
   changes. The owner can re-attribute "Other" items by hand in the admin. */
const path = require("path");
const db = require(path.join(__dirname, "..", "server", "db"));

// Duplicate spellings → canonical key.
const MERGES = {
  "onelle-natural": "onelle",
  "onelle-naturals": "onelle",
  "mark-anthony": "marc-anthony",
};
// Not real brands → "Other".
const TO_OTHER = [
  "cosmeticslk", "essentialslk",           // store names
  "argan-oil", "ascorbic-acid", "oils-butter", "minoxidil", // ingredients
  "derma-roller", "gua-sha", "ice-roller", // tools
  "giftset",                                // generic
];

const has = (k) => !!db.prepare("SELECT 1 FROM brands WHERE key=?").get(k);
const reassign = (from, to) => db.prepare("UPDATE products SET brand_key=? WHERE brand_key=?").run(to, from).changes;

const run = db.transaction(() => {
  if (!has("other")) {
    const m = db.prepare("SELECT COALESCE(MAX(sort),0) m FROM brands").get().m;
    db.prepare("INSERT INTO brands (key,name,loc,sort) VALUES ('other','Other','',?)").run(m + 1);
  }
  let merged = 0, bucketed = 0, removed = 0;
  for (const [from, to] of Object.entries(MERGES)) {
    if (!has(from) || !has(to)) continue;
    merged += reassign(from, to);
    db.prepare("DELETE FROM brands WHERE key=?").run(from); removed++;
  }
  for (const from of TO_OTHER) {
    if (!has(from)) continue;
    bucketed += reassign(from, "other");
    db.prepare("DELETE FROM brands WHERE key=?").run(from); removed++;
  }
  return { merged, bucketed, brandsRemoved: removed };
});

console.log(run());
console.log("brands now:", db.prepare("SELECT COUNT(*) c FROM brands").get().c);
