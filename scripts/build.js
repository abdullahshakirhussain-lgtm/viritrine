/* ============================================================================
   Precompile JSX → plain JS so the browser never loads @babel/standalone or
   compiles JSX at runtime (a big Core Web Vitals / LCP win, and better for SEO).

   Each .jsx under public/src (recursively) is transformed to a sibling .js using the
   CLASSIC React runtime (React.createElement / React.Fragment) so the compiled
   files keep using the global `window.React`/`window.ReactDOM` UMD builds and
   the cross-file `window.*` globals exactly as before — no bundling, no imports.

   The compiled .js are gitignored (built on deploy); the hand-written ES modules
   (bottle.js, motion.js) are NOT compiled and stay tracked.

   Run: node scripts/build.js   (also runs on `prestart`, so `npm start` is safe)
   ============================================================================ */
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const SRC = path.join(__dirname, "..", "public", "src");
// Hand-written modules that are already plain JS — never treat as build output.
const HAND_WRITTEN = new Set(["motion.js"]);

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && e.name.endsWith(".jsx")) out.push(p);
  }
  return out;
}

const files = walk(SRC);
let ok = 0;
for (const file of files) {
  const code = fs.readFileSync(file, "utf8");
  const res = esbuild.transformSync(code, {
    loader: "jsx",
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    target: "es2019",
    // Keep it readable-ish and small; no sourcemaps needed for these globals-style files.
  });
  const outFile = file.replace(/\.jsx$/, ".js");
  if (HAND_WRITTEN.has(path.basename(outFile))) continue; // safety: never overwrite a module
  fs.writeFileSync(outFile, res.code);
  ok++;
}
console.log(`build: compiled ${ok} JSX file(s) → .js`);
