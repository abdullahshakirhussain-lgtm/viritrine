/* ============================================================================
   Rewrite imported drafts' borrowed copy into ORIGINAL boutique copy + SEO
   title/description, so nothing ships as the competitors' verbatim (duplicate)
   text. Uses the configured AI provider (openai | anthropic | deepseek) via
   server/ai.js — DeepSeek is the cheap default for this text task.

   Resumable: only touches drafts whose meta_title is still NULL (i.e. not yet
   rewritten), so you can stop/restart freely.

   Setup (.env): AI_PROVIDER=deepseek and DEEPSEEK_API_KEY=sk-...
   Usage (repo root):
     node scripts/rewrite-copy.js --limit=5     # small test first
     node scripts/rewrite-copy.js               # all un-rewritten imported drafts
     node scripts/rewrite-copy.js cosmetics     # one source only
   ============================================================================ */
const path = require("path");
const db = require(path.join(__dirname, "..", "server", "db"));
const { rewriteProductCopy, aiConfigured, AI_PROVIDER } = require(path.join(__dirname, "..", "server", "ai"));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  if (!aiConfigured) {
    console.error("AI is not configured. Set AI_PROVIDER=deepseek and DEEPSEEK_API_KEY in .env (or an OpenAI/Anthropic key).");
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const only = args.find(a => !a.startsWith("--"));
  const limitArg = args.find(a => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 0;

  let sql = `SELECT p.id, p.name, p.italic, p.category, p.size, p.copy AS source, b.name AS brand
             FROM products p LEFT JOIN brands b ON b.key = p.brand_key
             WHERE p.import_source IS NOT NULL AND (p.meta_title IS NULL OR p.meta_title = '')`;
  const params = [];
  if (only) { sql += " AND p.import_source LIKE ?"; params.push("%" + only.toLowerCase() + "%"); }
  sql += " ORDER BY p.import_source, p.id";
  let rows = db.prepare(sql).all(...params);
  if (limit) rows = rows.slice(0, limit);

  console.log(`Rewriting ${rows.length} drafts with ${AI_PROVIDER}…`);
  const upd = db.prepare("UPDATE products SET copy=?, meta_title=?, meta_desc=? WHERE id=?");
  let ok = 0, fail = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const d = await rewriteProductCopy({ name: r.name, italic: r.italic, brand: r.brand, category: r.category, size: r.size, source: r.source });
      if (!d || !d.copy) throw new Error("empty response");
      upd.run(String(d.copy).trim(), String(d.meta_title || "").trim().slice(0, 200), String(d.meta_desc || "").trim().slice(0, 400), r.id);
      ok++;
      if (ok % 10 === 0 || i === rows.length - 1) process.stdout.write(`\r  ${ok} done · ${fail} failed · ${i + 1}/${rows.length}`);
    } catch (e) {
      fail++;
      if (fail <= 5) console.log(`\n  ! ${r.id}: ${e.message}`);
    }
    await sleep(200); // gentle pacing / rate-limit friendly
  }
  console.log(`\nDone. Rewrote ${ok} drafts, ${fail} failed. Re-run to retry failures (already-done rows are skipped).`);
  process.exit(0);
})();
