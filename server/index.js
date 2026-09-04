const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const { z } = require("zod");

try { require("dotenv").config(); } catch (_) {}

const db = require("./db");
const { sendSms, smsConfigured } = require("./sms");
const { describeProductFromImage, aiConfigured, AI_PROVIDER } = require("./ai");
const r2 = require("./r2");

const PORT = parseInt(process.env.PORT || "4000", 10);
const IS_PROD = process.env.NODE_ENV === "production";

// Auth secret — accept JWT_SECRET or AUTH_SECRET. In production we refuse to boot
// with a missing/short secret (a weak secret = forgeable sessions). Dev gets a
// clearly-labelled fallback so `npm start` works out of the box.
const rawSecret = process.env.JWT_SECRET || process.env.AUTH_SECRET;
const JWT_SECRET = rawSecret || "dev-only-secret-please-change-in-env";
if (IS_PROD && (!rawSecret || rawSecret.length < 16)) {
  throw new Error("Refusing to boot: set JWT_SECRET (or AUTH_SECRET) to a strong value (≥16 chars) in production.");
}

const app = express();

// Baseline security headers on every response.
app.use((_req, res, next) => {
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

// ── Rate limiters ────────────────────────────────────────
// Shared IPv4/IPv6-safe key so limiter.resetKey(key) matches the key used to count.
const ipKey = (req) => req.ip;
const makeLimiter = (windowMs, max, msg) =>
  rateLimit({ windowMs, max, keyGenerator: ipKey, message: { error: msg || "Too many requests — please slow down." } });

const tightLimit  = makeLimiter(15 * 60 * 1000, 30);
const loose       = makeLimiter(60 * 1000, 240);
const loginLimit  = makeLimiter(5 * 60 * 1000, 10, "Too many login attempts — try again in a few minutes.");
const otpLimit    = makeLimiter(10 * 60 * 1000, 10, "Too many code requests — try again later.");
const uploadLimit = makeLimiter(10 * 60 * 1000, 10, "Too many uploads — try again later.");
const trackLimit  = makeLimiter(60 * 1000, 20, "Too many tracking lookups — try again in a minute.");
app.use("/api", loose);

// ── Owned analytics (first-party, fire-and-forget) ───────
// Allowlisted event types — anything else is dropped.
const ANALYTICS_TYPES = new Set([
  "product_view", "search", "add_to_cart", "begin_checkout", "whatsapp_click", "purchase",
]);

// Persistent visitor id in a first-party cookie (sh_sid-equivalent). Server-
// managed + httpOnly; created on first request via the middleware below.
const sidOf = (req, res) => {
  let sid = req.cookies?.vt_sid;
  if (!sid) {
    sid = crypto.randomBytes(16).toString("hex");
    res.cookie("vt_sid", sid, {
      httpOnly: true, sameSite: "lax", secure: IS_PROD,
      maxAge: 365 * 24 * 3600 * 1000, path: "/",
    });
  }
  return sid;
};

// Record one event. NEVER throws — analytics must not break a user request.
const logEvent = (sid, type, { productId = null, value = null, meta = null } = {}) => {
  try {
    if (!sid || !ANALYTICS_TYPES.has(type)) return;
    db.prepare("INSERT OR IGNORE INTO analytics_sessions (id) VALUES (?)").run(sid);
    db.prepare("UPDATE analytics_sessions SET last_seen=strftime('%s','now') WHERE id=?").run(sid);
    db.prepare("INSERT INTO analytics_events (session_id,type,product_id,value,meta) VALUES (?,?,?,?,?)")
      .run(sid, type, productId, value, meta ? JSON.stringify(meta) : null);
  } catch (_) { /* swallow — fire-and-forget */ }
};

// Ensure every visitor carries a session cookie as early as possible.
app.use((req, res, next) => { sidOf(req, res); next(); });

// ── File uploads ────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, "data", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(path.join(UPLOAD_DIR, "products"), { recursive: true });
fs.mkdirSync(path.join(UPLOAD_DIR, "brands"),   { recursive: true });
fs.mkdirSync(path.join(UPLOAD_DIR, "hero"),     { recursive: true });

// Derive the file extension from the *validated* content-type, never the
// client-supplied filename (which can be spoofed, e.g. shell.php.jpg).
const MIME_EXT = {
  "image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg",
  "image/webp": ".webp", "image/avif": ".avif", "image/gif": ".gif",
  "video/mp4": ".mp4", "video/webm": ".webm",
};
const extFromMime = (m) => MIME_EXT[m] || ".bin";

// When R2 is configured, keep upload bytes in memory and push to the bucket;
// otherwise write to local disk (dev fallback). finalizeUpload() turns either
// into the stored URL (R2 public URL, or a /uploads/... path).
const memStorage = multer.memoryStorage();
const diskImage = multer.diskStorage({
  destination: (req, _file, cb) => cb(null, path.join(UPLOAD_DIR, req.params.kind === "brands" ? "brands" : "products")),
  filename: (_req, file, cb) => cb(null, crypto.randomBytes(10).toString("hex") + extFromMime(file.mimetype)),
});
const diskHero = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_DIR, "hero")),
  filename: (_req, file, cb) => cb(null, crypto.randomBytes(10).toString("hex") + extFromMime(file.mimetype)),
});

const upload = multer({
  storage: r2.r2Configured ? memStorage : diskImage,
  limits: { fileSize: 6 * 1024 * 1024 }, // 6 MB
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|avif|gif)$/.test(file.mimetype);
    cb(ok ? null : new Error("Only PNG / JPG / WEBP / AVIF / GIF allowed"), ok);
  },
});
const heroVideoUpload = multer({
  storage: r2.r2Configured ? memStorage : diskHero,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const ok = /^video\/(mp4|webm)$/.test(file.mimetype);
    cb(ok ? null : new Error("Only MP4 or WEBM video allowed"), ok);
  },
});
const heroPosterUpload = multer({
  storage: r2.r2Configured ? memStorage : diskHero,
  limits: { fileSize: 6 * 1024 * 1024 }, // 6 MB
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|avif)$/.test(file.mimetype);
    cb(ok ? null : new Error("Poster must be PNG / JPG / WEBP / AVIF"), ok);
  },
});

// A parsed multer file → stored URL. R2 (memory buffer) or disk (filename).
async function finalizeUpload(file, sub) {
  if (r2.r2Configured) {
    const key = `${sub}/${crypto.randomBytes(10).toString("hex")}${extFromMime(file.mimetype)}`;
    return r2.putObject(key, file.buffer, file.mimetype);
  }
  return `/uploads/${sub}/${file.filename}`;
}

// Remove a stored asset by its URL — from R2 if it's an R2 URL, else local disk.
async function removeStored(url) {
  if (!url) return;
  if (r2.keyFromUrl(url)) { await r2.deleteByUrl(url); return; }
  if (String(url).startsWith("/uploads/")) {
    const f = path.join(UPLOAD_DIR, url.replace(/^\/uploads\//, ""));
    try { fs.existsSync(f) && fs.unlinkSync(f); } catch {}
  }
}

app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "7d" }));

/* ── helpers ─────────────────────────────────────────── */
const signToken = (user) =>
  jwt.sign({ uid: user.id, email: user.email, admin: !!user.is_admin }, JWT_SECRET, { expiresIn: "30d" });

const setAuthCookie = (res, token) =>
  res.cookie("vt_auth", token, {
    httpOnly: true, sameSite: "lax", secure: IS_PROD, maxAge: 30 * 24 * 3600 * 1000, path: "/",
  });

const readUser = (req) => {
  const token = req.cookies?.vt_auth;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return db.prepare("SELECT id,email,first_name,last_name,phone,is_admin,tier FROM users WHERE id=?").get(payload.uid) || null;
  } catch { return null; }
};

const requireAuth = (req, res, next) => {
  const u = readUser(req);
  if (!u) return res.status(401).json({ error: "Unauthorized" });
  req.user = u; next();
};

const requireAdmin = (req, res, next) => {
  if (!req.user?.is_admin) return res.status(403).json({ error: "Forbidden" });
  next();
};

const cartTokenOf = (req, res) => {
  let t = req.cookies?.vt_cart;
  if (!t) {
    t = crypto.randomBytes(16).toString("hex");
    res.cookie("vt_cart", t, { httpOnly: true, sameSite: "lax", secure: IS_PROD, maxAge: 90 * 24 * 3600 * 1000, path: "/" });
  }
  return t;
};

const findOrCreateCart = (token, user_id) => {
  let cart = db.prepare("SELECT * FROM carts WHERE token=?").get(token);
  if (!cart) {
    const info = db.prepare("INSERT INTO carts (token, user_id) VALUES (?, ?)").run(token, user_id || null);
    cart = db.prepare("SELECT * FROM carts WHERE id=?").get(info.lastInsertRowid);
  } else if (user_id && !cart.user_id) {
    db.prepare("UPDATE carts SET user_id=? WHERE id=?").run(user_id, cart.id);
    cart.user_id = user_id;
  }
  return cart;
};

const productById = (id) => {
  const row = db.prepare("SELECT * FROM products WHERE id=?").get(id);
  if (!row) return null;
  return hydrateProduct(row);
};

const hydrateProduct = (row) => {
  const brand = db.prepare("SELECT * FROM brands WHERE key=?").get(row.brand_key);
  const concerns = db.prepare("SELECT concern FROM product_concerns WHERE product_id=?").all(row.id).map(r => r.concern);
  const skinTypes = db.prepare("SELECT skin_type FROM product_skin_types WHERE product_id=?").all(row.id).map(r => r.skin_type);
  const notes = db.prepare("SELECT note FROM product_notes WHERE product_id=? ORDER BY sort").all(row.id).map(r => r.note);
  return {
    id: row.id,
    brand: row.brand_key,
    brandName: brand?.name,
    brandLoc: brand?.loc,
    name: row.name,
    italic: row.italic,
    category: row.category,
    sub: row.sub,
    size: row.size,
    variant: row.variant,
    liquid: row.liquid,
    liquidTop: row.liquid_top,
    copy: row.copy,
    price: row.price,
    sale: row.sale_price || undefined,
    off:  row.off_pct    || undefined,
    isNew: !!row.is_new,
    isBestseller: !!row.is_bestseller,
    isActive: row.is_active == null ? true : !!row.is_active,
    editorPickSort: row.editor_pick_sort,
    editorTag: row.editor_tag,
    metaTitle: row.meta_title || null,
    metaDesc: row.meta_desc || null,
    stock: row.stock,
    image: row.image || null,
    membersOnly: !!row.members_only,
    earlyAccessUntil: row.early_access_until || null,
    concerns,
    skinTypes,
    notes,
  };
};

// ── The Key: product gating ────────────────────────────────
// A product is "reserved" for premium members when it's members-only, or still
// inside its early-access window. Premium members (and admins) see everything.
const nowSec = () => Math.floor(Date.now() / 1000);
const isReserved = (p) =>
  !!(p && (p.membersOnly || (p.earlyAccessUntil && nowSec() < p.earlyAccessUntil)));
const canSeeGated = (req) => {
  const u = readUser(req);
  return !!(u && (u.is_admin || u.tier === "premium"));
};
// Drop reserved products the requester isn't allowed to see. `key` lets callers
// filter arrays of raw slide/related rows that embed a hydrated product.
const filterVisible = (rows, req, pick) => {
  const privileged = canSeeGated(req);
  if (privileged) return rows;
  return rows.filter((r) => !isReserved(pick ? pick(r) : r));
};

const lineUnit = (p) => p.sale_price || p.price;

// Crypto-random order number. Math.random() is guessable — and since order
// tracking is reachable by number, guessable numbers leak order data. We use an
// unambiguous alphabet (no 0/O/1/I/L) and crypto.randomInt (unbiased), then retry
// on the (astronomically unlikely) UNIQUE collision.
const ORDER_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const orderCode = (len = 8) => {
  let out = "";
  for (let i = 0; i < len; i++) out += ORDER_ALPHABET[crypto.randomInt(ORDER_ALPHABET.length)];
  return out;
};
const makeOrderNumber = () => {
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  for (let i = 0; i < 5; i++) {
    const n = `VTR-${date}-${orderCode(8)}`;
    if (!db.prepare("SELECT 1 FROM orders WHERE number=?").get(n)) return n;
  }
  return `VTR-${date}-${orderCode(12)}`; // fallback with more entropy
};

// Settings helpers — read shipping rates (and other config) from the settings table.
const getSetting = (key, fallback) => {
  const row = db.prepare("SELECT value FROM settings WHERE key=?").get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
};
const getNumberSetting = (key, fallback) => {
  const v = getSetting(key, fallback);
  return typeof v === "number" ? v : Number(v) || fallback;
};

const computeShipping = (subtotal, delivery, payment) => {
  const FREE_OVER = getNumberSetting("shipping.free_over_lkr", 25000);
  const STD       = getNumberSetting("shipping.std_lkr", 850);
  const EXPRESS   = getNumberSetting("shipping.express_lkr", 1500);
  const COD_FEE   = getNumberSetting("shipping.cod_fee_lkr", 200);
  let s = delivery === "express" ? EXPRESS : (subtotal >= FREE_OVER ? 0 : STD);
  if (payment === "cod") s += COD_FEE;
  return s;
};

// ── Membership ("The Key") ───────────────────────────────
const membershipCfg = () => ({
  threshold:   getNumberSetting("membership.premium_threshold_lkr", 250000),
  discountPct: getNumberSetting("membership.premium_discount_pct", 10),
});
// Lifetime spend = sum of a customer's non-cancelled/refunded order totals.
const lifetimeSpend = (userId) => {
  if (!userId) return 0;
  return db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE user_id=? AND status NOT IN ('cancelled','refunded')").get(userId).s;
};

const cartPayload = (cart_id) => {
  const items = db.prepare(`
    SELECT ci.id as line_id, ci.qty, ci.size, p.*
    FROM cart_items ci JOIN products p ON p.id = ci.product_id
    WHERE ci.cart_id = ?
    ORDER BY ci.id
  `).all(cart_id);
  const out = items.map(r => {
    const prod = hydrateProduct(r);
    const unit = prod.sale ?? prod.price;
    return {
      lineId: r.line_id,
      qty: r.qty,
      size: r.size || prod.size,
      product: prod,
      unitPrice: unit,
      lineTotal: unit * r.qty,
    };
  });
  const subtotal = out.reduce((s, l) => s + l.lineTotal, 0);
  return { items: out, subtotal, count: out.reduce((s, l) => s + l.qty, 0) };
};

/* ── catalog ─────────────────────────────────────────── */
app.get("/api/brands", (_req, res) => {
  const rows = db.prepare(`
    SELECT b.*, (SELECT COUNT(*) FROM products p WHERE p.brand_key = b.key AND (p.is_active IS NULL OR p.is_active = 1)) AS count
    FROM brands b ORDER BY b.sort`).all();
  res.json(rows.map(r => ({
    key: r.key, name: r.name, font: r.font, case: r.case_, accent: r.accent,
    tagline: r.tagline, loc: r.loc, cat: r.cat, image: r.image || null, count: r.count || 0,
  })));
});

app.get("/api/categories", (_req, res) => {
  res.json(db.prepare("SELECT * FROM categories ORDER BY sort").all());
});

app.get("/api/concerns", (_req, res) => {
  res.json(db.prepare("SELECT * FROM concerns ORDER BY sort").all());
});
app.get("/api/skin-types", (_req, res) => {
  res.json(db.prepare("SELECT * FROM skin_types ORDER BY sort").all());
});

// Public settings — returns a flat key->value object of all settings.
app.get("/api/settings", (_req, res) => {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const out = {};
  for (const r of rows) {
    try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
  }
  res.json(out);
});

// Active announcements, in order.
app.get("/api/announcements", (_req, res) => {
  res.json(db.prepare("SELECT id, text FROM announcements WHERE active=1 ORDER BY sort, id").all());
});

// Hero slides — joins to products so the client gets everything in one shot.
app.get("/api/hero-slides", (req, res) => {
  // LEFT JOIN so editorial slides (no product) still appear. A slide shows when
  // it's editorial (product_id NULL) or its product exists and is active.
  const rows = db.prepare(`
    SELECT h.id AS slide_id, h.product_id,
           h.custom_tag, h.custom_title, h.custom_dek, h.custom_cta, h.custom_href,
           h.custom_video, h.custom_poster,
           h.sort, p.*
    FROM hero_slides h
    LEFT JOIN products p ON p.id = h.product_id
    WHERE h.active = 1
      AND (h.product_id IS NULL OR (p.id IS NOT NULL AND (p.is_active IS NULL OR p.is_active = 1)))
    ORDER BY h.sort, h.id
  `).all();
  const slides = rows.map(r => {
    const hasProduct = r.product_id != null && r.id != null;
    const base = hasProduct ? hydrateProduct(r) : {};
    return {
      ...base,
      slideId: r.slide_id,
      customTag: r.custom_tag,
      customTitle: r.custom_title,
      customDek: r.custom_dek,
      customCta: r.custom_cta,
      customHref: r.custom_href,
      customVideo: r.custom_video,
      customPoster: r.custom_poster,
    };
  });
  // Hide reserved product-slides from non-members; editorial slides always show.
  res.json(filterVisible(slides, req));
});

// Editorial picks — for the homepage's "Shop the Shelf" rail.
// If no products are flagged editor's pick, fall back to the latest products so
// admin-added items show up immediately without needing the flag.
app.get("/api/editorial", (req, res) => {
  let rows = db.prepare(`
    SELECT * FROM products
    WHERE editor_pick_sort IS NOT NULL
      AND (is_active IS NULL OR is_active = 1)
    ORDER BY editor_pick_sort, id
  `).all();
  if (rows.length === 0) {
    rows = db.prepare(`
      SELECT * FROM products
      WHERE (is_active IS NULL OR is_active = 1)
      ORDER BY is_bestseller DESC, is_new DESC, created_at DESC
      LIMIT 8
    `).all();
  }
  const picks = rows.map(p => ({
    ...hydrateProduct(p),
    editorTag: p.editor_tag || (p.is_new ? "New" : p.is_bestseller ? "Bestseller" : "Pick"),
  }));
  res.json(filterVisible(picks, req));
});

// Latest active products — for the homepage "New Arrivals" rail.
app.get("/api/products/new-arrivals", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "8", 10), 50);
  // Over-fetch a little so gating doesn't shrink the row below `limit`.
  const rows = db.prepare(`
    SELECT * FROM products
    WHERE (is_active IS NULL OR is_active = 1)
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(limit * 2);
  res.json(filterVisible(rows.map(hydrateProduct), req).slice(0, limit));
});

// Journal — published posts, latest first by published_at.
app.get("/api/journal", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
  const rows = db.prepare(`
    SELECT id, slug, title, italic, excerpt, cover_image, tag, glyph, sort, published_at
    FROM journal_posts
    WHERE published_at IS NOT NULL
    ORDER BY sort, published_at DESC
    LIMIT ?
  `).all(limit);
  res.json(rows);
});

// Single post by slug.
app.get("/api/journal/:slug", (req, res) => {
  const post = db.prepare("SELECT * FROM journal_posts WHERE slug=?").get(req.params.slug);
  if (!post || !post.published_at) return res.status(404).json({ error: "Not found" });
  // Related posts (others, excluding self)
  const related = db.prepare(`
    SELECT slug, title, italic, excerpt, cover_image, tag, glyph
    FROM journal_posts
    WHERE published_at IS NOT NULL AND slug <> ?
    ORDER BY published_at DESC LIMIT 3
  `).all(req.params.slug);
  res.json({ post, related });
});

// Public FAQs.
app.get("/api/faqs", (_req, res) => {
  res.json(db.prepare("SELECT id, question, answer FROM faqs WHERE active=1 ORDER BY sort, id").all());
});

// Public shop locations.
app.get("/api/locations", (_req, res) => {
  res.json(db.prepare("SELECT id, name, address, hours, phone FROM shop_locations WHERE active=1 ORDER BY sort, id").all());
});

app.get("/api/products", (req, res) => {
  const { category, brand, concern, skin, sale, isNew, ceylon, sort, q, limit, offset } = req.query;
  let sql = "SELECT DISTINCT p.* FROM products p";
  const where = ["(p.is_active IS NULL OR p.is_active = 1)"]; const params = [];
  if (concern) {
    sql += " JOIN product_concerns pc ON pc.product_id = p.id";
    where.push("pc.concern = ?"); params.push(concern);
  }
  if (skin) {
    sql += " JOIN product_skin_types ps ON ps.product_id = p.id";
    where.push("ps.skin_type = ?"); params.push(skin);
  }
  if (ceylon === "1") sql += " JOIN brands b ON b.key = p.brand_key";
  if (category)         { where.push("p.category = ?");      params.push(category); }
  if (brand)            { where.push("p.brand_key = ?");     params.push(brand); }
  if (sale === "1")     { where.push("p.sale_price IS NOT NULL"); }
  if (isNew === "1")    { where.push("p.is_new = 1"); }
  if (ceylon === "1")   { where.push("b.loc IN ('Colombo','Galle')"); }
  if (q) {
    where.push("(p.name LIKE ? OR p.italic LIKE ? OR p.copy LIKE ? OR p.brand_key LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (where.length) sql += " WHERE " + where.join(" AND ");

  switch (sort) {
    case "new":          sql += " ORDER BY p.is_new DESC, p.created_at DESC"; break;
    case "price-asc":    sql += " ORDER BY COALESCE(p.sale_price,p.price) ASC"; break;
    case "price-desc":   sql += " ORDER BY COALESCE(p.sale_price,p.price) DESC"; break;
    case "bestselling":  sql += " ORDER BY p.is_bestseller DESC, p.created_at DESC"; break;
    case "off-desc":     sql += " ORDER BY COALESCE(p.off_pct,0) DESC"; break;
    default:             sql += " ORDER BY p.is_bestseller DESC, p.is_new DESC, p.created_at DESC";
  }
  const lim = Math.min(parseInt(limit || "200", 10), 500);
  const off = Math.max(parseInt(offset || "0", 10), 0);
  sql += " LIMIT ? OFFSET ?"; params.push(lim, off);

  const rows = db.prepare(sql).all(...params);
  res.json(filterVisible(rows.map(hydrateProduct), req));
});

app.get("/api/products/:id", (req, res) => {
  const p = productById(req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  // Reserved products: non-members get a "locked" response so the PDP can show
  // the members-only state (and a link to The Key) instead of the piece itself.
  if (isReserved(p) && !canSeeGated(req)) {
    return res.status(403).json({ error: "Members only", locked: true, reason: p.membersOnly ? "members_only" : "early_access", earlyAccessUntil: p.earlyAccessUntil || null, brandName: p.brandName });
  }
  logEvent(sidOf(req, res), "product_view", { productId: p.id }); // fire-and-forget
  const related = db.prepare(
    "SELECT * FROM products WHERE category=? AND id<>? ORDER BY is_bestseller DESC LIMIT 6"
  ).all(p.category, p.id).map(hydrateProduct);
  res.json({ product: p, related: filterVisible(related, req) });
});

app.get("/api/search", (req, res) => {
  const q = (req.query.q || "").toString().trim();
  if (!q) return res.json([]);
  const like = `%${q}%`;
  const rows = db.prepare(`
    SELECT * FROM products
    WHERE name LIKE ? OR italic LIKE ? OR brand_key LIKE ? OR copy LIKE ?
    LIMIT 8
  `).all(like, like, like, like);
  // Log only meaningful queries (2+ chars) to keep type-ahead noise down.
  if (q.length >= 2) logEvent(sidOf(req, res), "search", { meta: { q, results: rows.length } });
  res.json(filterVisible(rows.map(hydrateProduct), req));
});

/* ── auth ────────────────────────────────────────────── */
const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(200),
  first_name: z.string().min(1).max(80).optional(),
  last_name:  z.string().max(80).optional(),
  phone:      z.string().max(40).optional(),
});
app.post("/api/auth/signup", tightLimit, (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  const { email, password, first_name, last_name, phone } = parsed.data;
  const lower = email.toLowerCase();
  const exists = db.prepare("SELECT id FROM users WHERE email=?").get(lower);
  if (exists) return res.status(409).json({ error: "Email already registered" });
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    "INSERT INTO users (email,password_hash,first_name,last_name,phone) VALUES (?,?,?,?,?)"
  ).run(lower, hash, first_name || null, last_name || null, phone || null);
  const user = db.prepare("SELECT id,email,first_name,last_name,phone,is_admin,tier FROM users WHERE id=?").get(info.lastInsertRowid);
  setAuthCookie(res, signToken(user));
  // Merge anonymous cart into this user
  const ct = req.cookies?.vt_cart;
  if (ct) findOrCreateCart(ct, user.id);
  res.json({ user });
});

/* ── phone-OTP sign-up ───────────────────────────────── */
// Normalize a Sri Lankan mobile number to 94XXXXXXXXX (94 + 9 digits).
//   0771234567  → 94771234567
//   +94 77 123 4567 → 94771234567
//   771234567   → 94771234567
// Returns null if it isn't a plausible LK mobile number.
const normalizePhoneLK = (raw) => {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "94" + d.slice(1);
  else if (d.length === 9) d = "94" + d;      // bare 7XXXXXXXX
  return /^94\d{9}$/.test(d) ? d : null;
};

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const gen6 = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

const OTP_TTL_SEC     = 10 * 60;   // code valid for 10 minutes
const OTP_RESEND_SEC  = 60;        // min gap between sends to one phone
const OTP_MAX_ATTEMPTS = 5;        // wrong guesses before lockout
const OTP_VERIFY_WINDOW_SEC = 15 * 60; // after verify, time allowed to finish signup

// Step 1 — request a code for a phone number.
app.post("/api/auth/otp/request", otpLimit, async (req, res) => {
  const phone = normalizePhoneLK(req.body?.phone);
  if (!phone) return res.status(400).json({ error: "Enter a valid Sri Lankan mobile number" });
  if (db.prepare("SELECT id FROM users WHERE phone=?").get(phone))
    return res.status(409).json({ error: "That number already has an account — please sign in." });

  const now = Math.floor(Date.now() / 1000);
  const existing = db.prepare("SELECT last_sent_at FROM otp_codes WHERE phone=?").get(phone);
  if (existing && now - existing.last_sent_at < OTP_RESEND_SEC) {
    const wait = OTP_RESEND_SEC - (now - existing.last_sent_at);
    return res.status(429).json({ error: `Please wait ${wait}s before requesting another code.` });
  }

  const code = gen6();
  // Upsert a single row per phone; issuing a new code resets attempts + verified.
  db.prepare(`
    INSERT INTO otp_codes (phone, code_hash, expires_at, attempts, last_sent_at, verified_at, created_at)
    VALUES (?, ?, ?, 0, ?, NULL, ?)
    ON CONFLICT(phone) DO UPDATE SET
      code_hash=excluded.code_hash, expires_at=excluded.expires_at,
      attempts=0, last_sent_at=excluded.last_sent_at, verified_at=NULL
  `).run(phone, sha256(code), now + OTP_TTL_SEC, now, now);

  try {
    await sendSms(phone, `Your VITRINE verification code is ${code}. It expires in 10 minutes.`);
  } catch (e) {
    // On send failure, drop the unused code so the user can cleanly retry.
    db.prepare("DELETE FROM otp_codes WHERE phone=?").run(phone);
    return res.status(502).json({ error: "Couldn't send the code — please try again." });
  }

  // In dev (no SMS provider configured) surface the code so the flow is testable.
  const payload = { ok: true, expiresInSec: OTP_TTL_SEC };
  if (!IS_PROD && !smsConfigured) payload.devCode = code;
  res.json(payload);
});

// Step 2 — verify the code. Marks the phone verified for a short window.
app.post("/api/auth/otp/verify", otpLimit, (req, res) => {
  const phone = normalizePhoneLK(req.body?.phone);
  const code  = String(req.body?.code || "").trim();
  if (!phone || !/^\d{6}$/.test(code)) return res.status(400).json({ error: "Enter the 6-digit code" });

  const row = db.prepare("SELECT * FROM otp_codes WHERE phone=?").get(phone);
  const now = Math.floor(Date.now() / 1000);
  if (!row) return res.status(400).json({ error: "Request a code first." });
  if (now > row.expires_at) {
    db.prepare("DELETE FROM otp_codes WHERE phone=?").run(phone);
    return res.status(400).json({ error: "Code expired — request a new one." });
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS)
    return res.status(429).json({ error: "Too many attempts — request a new code." });

  if (sha256(code) !== row.code_hash) {
    const attempts = row.attempts + 1;
    db.prepare("UPDATE otp_codes SET attempts=? WHERE phone=?").run(attempts, phone);
    const left = OTP_MAX_ATTEMPTS - attempts;
    return res.status(400).json({ error: left > 0 ? `Wrong code — ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many attempts — request a new code." });
  }

  db.prepare("UPDATE otp_codes SET verified_at=? WHERE phone=?").run(now, phone);
  res.json({ verified: true, phone });
});

// Step 3 — finish sign-up (name + password) for a verified phone.
const otpCompleteSchema = z.object({
  phone:      z.string().min(1),
  password:   z.string().min(6).max(200),
  first_name: z.string().min(1).max(80),
  last_name:  z.string().max(80).optional(),
  email:      z.string().email().optional(),
});
app.post("/api/auth/otp/complete", tightLimit, (req, res) => {
  const parsed = otpCompleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  const phone = normalizePhoneLK(parsed.data.phone);
  if (!phone) return res.status(400).json({ error: "Invalid phone number" });

  const row = db.prepare("SELECT * FROM otp_codes WHERE phone=?").get(phone);
  const now = Math.floor(Date.now() / 1000);
  if (!row || !row.verified_at || now - row.verified_at > OTP_VERIFY_WINDOW_SEC)
    return res.status(400).json({ error: "Please verify your phone number again." });
  if (db.prepare("SELECT id FROM users WHERE phone=?").get(phone))
    return res.status(409).json({ error: "That number already has an account." });

  const { first_name, last_name, password } = parsed.data;
  const email = parsed.data.email ? parsed.data.email.toLowerCase() : null;
  if (email && db.prepare("SELECT id FROM users WHERE email=?").get(email))
    return res.status(409).json({ error: "That email is already registered." });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    "INSERT INTO users (email,password_hash,first_name,last_name,phone) VALUES (?,?,?,?,?)"
  ).run(email, hash, first_name, last_name || null, phone);
  db.prepare("DELETE FROM otp_codes WHERE phone=?").run(phone); // consume the OTP

  const user = db.prepare("SELECT id,email,first_name,last_name,phone,is_admin,tier FROM users WHERE id=?").get(info.lastInsertRowid);
  setAuthCookie(res, signToken(user));
  const ct = req.cookies?.vt_cart;
  if (ct) findOrCreateCart(ct, user.id); // merge anonymous cart into the new user
  res.json({ user });
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
app.post("/api/auth/login", loginLimit, (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const { email, password } = parsed.data;
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Wrong email or password" });
  }
  loginLimit.resetKey(req.ip); // successful login clears the failed-attempt counter for this IP
  const safe = { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, phone: user.phone, is_admin: user.is_admin, tier: user.tier };
  setAuthCookie(res, signToken(safe));
  const ct = req.cookies?.vt_cart;
  if (ct) findOrCreateCart(ct, user.id);
  res.json({ user: safe });
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("vt_auth", { path: "/" });
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const u = readUser(req);
  res.json({ user: u });
});

app.patch("/api/auth/me", (req, res) => {
  const u = readUser(req);
  if (!u) return res.status(401).json({ error: "Unauthorized" });
  const { first_name, last_name, phone } = req.body || {};
  db.prepare("UPDATE users SET first_name=?, last_name=?, phone=? WHERE id=?")
    .run(first_name || null, last_name || null, phone || null, u.id);
  const fresh = db.prepare("SELECT id,email,first_name,last_name,phone,is_admin,tier FROM users WHERE id=?").get(u.id);
  res.json({ user: fresh });
});

/* ── cart ────────────────────────────────────────────── */
app.get("/api/cart", (req, res) => {
  const token = cartTokenOf(req, res);
  const u = readUser(req);
  const cart = findOrCreateCart(token, u?.id);
  res.json(cartPayload(cart.id));
});

const addSchema = z.object({
  product_id: z.string().min(1),
  qty: z.number().int().min(1).max(99).default(1),
  size: z.string().max(40).optional(),
});
app.post("/api/cart/items", (req, res) => {
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const product = productById(parsed.data.product_id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  const token = cartTokenOf(req, res);
  const u = readUser(req);
  // The Key: a non-member can't add a reserved (members-only / early-access) piece.
  if (isReserved(product) && !(u && (u.is_admin || u.tier === "premium"))) {
    return res.status(403).json({ error: "This piece is reserved for The Key members.", locked: true });
  }
  const cart = findOrCreateCart(token, u?.id);
  const size = parsed.data.size || product.size;
  const existing = db.prepare("SELECT * FROM cart_items WHERE cart_id=? AND product_id=? AND size IS ?").get(cart.id, product.id, size);
  if (existing) {
    db.prepare("UPDATE cart_items SET qty = qty + ? WHERE id=?").run(parsed.data.qty, existing.id);
  } else {
    db.prepare("INSERT INTO cart_items (cart_id, product_id, qty, size) VALUES (?,?,?,?)")
      .run(cart.id, product.id, parsed.data.qty, size);
  }
  db.prepare("UPDATE carts SET updated_at = strftime('%s','now') WHERE id=?").run(cart.id);
  logEvent(sidOf(req, res), "add_to_cart", {
    productId: product.id, value: (product.sale ?? product.price), meta: { qty: parsed.data.qty },
  });
  res.json(cartPayload(cart.id));
});

app.patch("/api/cart/items/:lineId", (req, res) => {
  const qty = parseInt(req.body?.qty, 10);
  if (!Number.isInteger(qty) || qty < 0 || qty > 99) return res.status(400).json({ error: "Invalid qty" });
  const token = cartTokenOf(req, res);
  const cart = findOrCreateCart(token, readUser(req)?.id);
  const line = db.prepare("SELECT * FROM cart_items WHERE id=? AND cart_id=?").get(req.params.lineId, cart.id);
  if (!line) return res.status(404).json({ error: "Line not found" });
  if (qty === 0) db.prepare("DELETE FROM cart_items WHERE id=?").run(line.id);
  else           db.prepare("UPDATE cart_items SET qty=? WHERE id=?").run(qty, line.id);
  res.json(cartPayload(cart.id));
});

app.delete("/api/cart/items/:lineId", (req, res) => {
  const token = cartTokenOf(req, res);
  const cart = findOrCreateCart(token, readUser(req)?.id);
  db.prepare("DELETE FROM cart_items WHERE id=? AND cart_id=?").run(req.params.lineId, cart.id);
  res.json(cartPayload(cart.id));
});

app.delete("/api/cart", (req, res) => {
  const token = cartTokenOf(req, res);
  const cart = findOrCreateCart(token, readUser(req)?.id);
  db.prepare("DELETE FROM cart_items WHERE cart_id=?").run(cart.id);
  res.json(cartPayload(cart.id));
});

/* ── wishlist ────────────────────────────────────────── */
app.get("/api/wishlist", requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT p.* FROM wishlists w JOIN products p ON p.id = w.product_id
    WHERE w.user_id = ? ORDER BY w.created_at DESC
  `).all(req.user.id);
  res.json(rows.map(hydrateProduct));
});

app.post("/api/wishlist/:productId", requireAuth, (req, res) => {
  const p = productById(req.params.productId);
  if (!p) return res.status(404).json({ error: "Product not found" });
  db.prepare("INSERT OR IGNORE INTO wishlists (user_id, product_id) VALUES (?,?)").run(req.user.id, p.id);
  res.json({ ok: true });
});

app.delete("/api/wishlist/:productId", requireAuth, (req, res) => {
  db.prepare("DELETE FROM wishlists WHERE user_id=? AND product_id=?").run(req.user.id, req.params.productId);
  res.json({ ok: true });
});

/* ── membership ("The Key") ──────────────────────────── */
// Current customer's membership status — powers the account + Key pages.
app.get("/api/membership", requireAuth, (req, res) => {
  const row = db.prepare("SELECT tier, tier_since FROM users WHERE id=?").get(req.user.id) || {};
  const cfg = membershipCfg();
  const spend = lifetimeSpend(req.user.id);
  res.json({
    tier: row.tier || "standard",
    tier_since: row.tier_since || null,
    lifetime_spend: spend,
    threshold: cfg.threshold,
    eligible: spend >= cfg.threshold,
    discount_pct: cfg.discountPct,
    free_shipping: (row.tier === "premium"),
  });
});

// Redeem an owner-issued invitation code → become premium.
app.post("/api/membership/redeem", tightLimit, requireAuth, (req, res) => {
  const code = String(req.body?.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ error: "Enter your invitation code." });
  const inv = db.prepare("SELECT * FROM membership_invites WHERE code=?").get(code);
  const now = Math.floor(Date.now() / 1000);
  if (!inv) return res.status(404).json({ error: "That invitation code isn't valid." });
  if (inv.redeemed_at) return res.status(409).json({ error: "That invitation has already been used." });
  if (inv.expires_at && now > inv.expires_at) return res.status(410).json({ error: "That invitation has expired." });
  if (inv.email && inv.email.toLowerCase() !== (req.user.email || "").toLowerCase())
    return res.status(403).json({ error: "This invitation is for a different account." });
  db.transaction(() => {
    db.prepare("UPDATE users SET tier='premium', tier_since=? WHERE id=?").run(now, req.user.id);
    db.prepare("UPDATE membership_invites SET redeemed_by=?, redeemed_at=? WHERE code=?").run(req.user.id, now, code);
  })();
  res.json({ ok: true, tier: "premium" });
});

/* ── The Back Room — premium members-only appointments ─── */
// Access is gated to premium (The Key) members; non-members get 403 {locked} so
// the client can show the members-only state, exactly like reserved products.
const requirePremium = (req, res) => {
  const u = req.user;
  if (u && (u.is_admin || u.tier === "premium")) return true;
  res.status(403).json({ error: "The Back Room is for The Key members.", locked: true });
  return false;
};
const appointmentSchema = z.object({
  slot:         z.string().max(120).optional(),
  topic:        z.string().max(600).optional(),
  contact_pref: z.enum(["whatsapp", "phone", "email"]).optional(),
  contact:      z.string().max(120).optional(),
  member_note:  z.string().max(600).optional(),
});

// Member: request an appointment.
app.post("/api/appointments", tightLimit, requireAuth, (req, res) => {
  if (!requirePremium(req, res)) return;
  const parsed = appointmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const d = parsed.data;
  // Guard against pile-ups: at most a few open requests per member.
  const open = db.prepare("SELECT COUNT(*) c FROM appointments WHERE user_id=? AND status IN ('requested','confirmed')").get(req.user.id).c;
  if (open >= 3) return res.status(409).json({ error: "You already have appointments pending. We'll be in touch shortly." });
  const info = db.prepare(`INSERT INTO appointments (user_id, slot, topic, contact_pref, contact, member_note)
    VALUES (?,?,?,?,?,?)`).run(
    req.user.id, d.slot || null, d.topic || null, d.contact_pref || null, d.contact || null, d.member_note || null,
  );
  res.json({ ok: true, id: info.lastInsertRowid });
});

// Member: their own appointments.
app.get("/api/appointments", requireAuth, (req, res) => {
  if (!requirePremium(req, res)) return;
  res.json(db.prepare("SELECT id, status, slot, topic, contact_pref, contact, member_note, admin_note, scheduled_at, created_at FROM appointments WHERE user_id=? ORDER BY created_at DESC").all(req.user.id));
});

// Member: cancel their own pending appointment.
app.patch("/api/appointments/:id", requireAuth, (req, res) => {
  const appt = db.prepare("SELECT * FROM appointments WHERE id=?").get(req.params.id);
  if (!appt || appt.user_id !== req.user.id) return res.status(404).json({ error: "Not found" });
  if (String(req.body?.status) !== "cancelled") return res.status(400).json({ error: "You can only cancel." });
  db.prepare("UPDATE appointments SET status='cancelled' WHERE id=?").run(appt.id);
  res.json({ ok: true });
});

// Admin: all appointments with member context.
app.get("/api/admin/appointments", requireAuth, requireAdmin, (_req, res) => {
  const rows = db.prepare(`
    SELECT a.*, u.first_name, u.last_name, u.email, u.phone, u.tier
    FROM appointments a LEFT JOIN users u ON u.id = a.user_id
    ORDER BY CASE a.status WHEN 'requested' THEN 0 WHEN 'confirmed' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END, a.created_at DESC
  `).all();
  res.json(rows.map(r => ({ ...r, lifetime_spend: lifetimeSpend(r.user_id) })));
});

// Admin: update status / schedule / note.
app.patch("/api/admin/appointments/:id", requireAuth, requireAdmin, (req, res) => {
  const cur = db.prepare("SELECT * FROM appointments WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "Not found" });
  const b = req.body || {};
  const status = ["requested", "confirmed", "completed", "cancelled"].includes(b.status) ? b.status : cur.status;
  db.prepare("UPDATE appointments SET status=?, admin_note=?, scheduled_at=? WHERE id=?").run(
    status,
    b.admin_note !== undefined ? (b.admin_note || null) : cur.admin_note,
    b.scheduled_at !== undefined ? (b.scheduled_at || null) : cur.scheduled_at,
    cur.id,
  );
  res.json({ ok: true });
});

app.delete("/api/admin/appointments/:id", requireAuth, requireAdmin, (req, res) => {
  db.prepare("DELETE FROM appointments WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

/* ── checkout / orders ───────────────────────────────── */
const orderSchema = z.object({
  email:    z.string().email(),
  full_name: z.string().min(1).max(120),
  phone:     z.string().min(5).max(40),
  line1:     z.string().min(1).max(200),
  line2:     z.string().max(200).optional(),
  city:      z.string().min(1).max(80),
  postcode:  z.string().max(30).optional(),
  country:   z.string().max(2).default("LK"),
  delivery:  z.enum(["std", "express"]),
  payment:   z.enum(["card", "cod", "koko"]),
  note:      z.string().max(800).optional(),
  gift_wrap: z.boolean().optional(),
  is_gift:          z.boolean().optional(),
  gift_recipient:   z.string().max(120).optional(),
  gift_message:     z.string().max(600).optional(),
  gift_hide_prices: z.boolean().optional(),
  samples:   z.array(z.string()).max(3).optional(),
});

app.post("/api/orders", (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  const data = parsed.data;
  const token = cartTokenOf(req, res);
  const u = readUser(req);
  const cart = findOrCreateCart(token, u?.id);
  const lines = db.prepare(`
    SELECT ci.qty, ci.size, p.* FROM cart_items ci JOIN products p ON p.id = ci.product_id
    WHERE ci.cart_id=?
  `).all(cart.id);
  if (lines.length === 0) return res.status(400).json({ error: "Cart is empty" });
  // "The Key" premium perks: free delivery + standing discount (server-authoritative).
  const isPremium = !!(u && u.tier === "premium");
  // Gate: a non-member can't check out a reserved (members-only / early-access) piece.
  if (!(isPremium || (u && u.is_admin))) {
    const reservedLine = lines.find(l => l.members_only || (l.early_access_until && Math.floor(Date.now() / 1000) < l.early_access_until));
    if (reservedLine) return res.status(403).json({ error: `"${reservedLine.name}" is reserved for The Key members. Remove it to continue.`, locked: true, productId: reservedLine.id });
  }
  const subtotal = lines.reduce((s, l) => s + lineUnit(l) * l.qty, 0);
  const cfg = membershipCfg();
  const discount = isPremium ? Math.round(subtotal * (cfg.discountPct || 0) / 100) : 0;
  const shipping = isPremium ? 0 : computeShipping(subtotal, data.delivery, data.payment);
  const total = subtotal - discount + shipping;
  const number = makeOrderNumber();

  const tx = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO orders
        (number,user_id,email,status,subtotal,shipping,discount,total,delivery,payment,full_name,phone,line1,line2,city,postcode,country,note,samples,gift_wrap,is_gift,gift_recipient,gift_message,gift_hide_prices)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      number, u?.id || null, data.email.toLowerCase(),
      data.payment === "card" ? "awaiting_payment" : "pending",
      subtotal, shipping, discount, total, data.delivery, data.payment,
      data.full_name, data.phone, data.line1, data.line2 || null, data.city,
      data.postcode || null, data.country || "LK", data.note || null,
      (data.samples && data.samples.length) ? JSON.stringify(data.samples) : null,
      data.gift_wrap ? 1 : 0,
      data.is_gift ? 1 : 0, data.is_gift ? (data.gift_recipient || null) : null,
      data.is_gift ? (data.gift_message || null) : null, data.is_gift && data.gift_hide_prices ? 1 : 0,
    );
    const orderId = info.lastInsertRowid;
    const itemStmt = db.prepare(`
      INSERT INTO order_items (order_id,product_id,brand_key,name,italic,size,qty,unit_price,line_total)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);
    lines.forEach(l => {
      const unit = lineUnit(l);
      itemStmt.run(orderId, l.id, l.brand_key, l.name, l.italic, l.size || l.size, l.qty, unit, unit * l.qty);
    });
    db.prepare("DELETE FROM cart_items WHERE cart_id=?").run(cart.id);
    return orderId;
  });
  const orderId = tx();

  // ── Analytics: attach phone (hash + last4 only) to the session and log the
  // purchase. The full number lives in orders only — never in the analytics table.
  const sid = sidOf(req, res);
  try {
    const phoneNorm = normalizePhoneLK(data.phone) || String(data.phone || "").replace(/\D/g, "");
    if (phoneNorm) {
      db.prepare("INSERT OR IGNORE INTO analytics_sessions (id) VALUES (?)").run(sid);
      db.prepare("UPDATE analytics_sessions SET phone_hash=?, phone_last4=? WHERE id=?")
        .run(sha256(phoneNorm), phoneNorm.slice(-4), sid);
    }
  } catch (_) { /* never block the order */ }
  logEvent(sid, "purchase", { value: total, meta: { number, items: lines.length } });

  const order = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
  const items = db.prepare("SELECT * FROM order_items WHERE order_id=?").all(orderId);
  res.json({ order, items });
});

app.get("/api/orders/me", requireAuth, (req, res) => {
  const orders = db.prepare("SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC").all(req.user.id);
  res.json(orders);
});

app.get("/api/orders/by-number/:number", (req, res) => {
  const email = (req.query.email || "").toString().toLowerCase();
  const order = db.prepare("SELECT * FROM orders WHERE number=?").get(req.params.number);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const u = readUser(req);
  const ok = (u && (u.is_admin || u.id === order.user_id)) || (email && email === order.email);
  if (!ok) return res.status(403).json({ error: "Email required to view this order" });
  const items = db.prepare("SELECT * FROM order_items WHERE order_id=?").all(order.id);
  res.json({ order, items });
});

// Public order tracking — rate-limited, and returns ONLY minimal, masked data.
// Gated by number + matching email (or an authenticated owner/admin). Never
// returns the delivery address, email, or full phone — just first name + a
// masked phone, status, and a line-item summary.
const maskPhone = (p) => {
  const d = String(p || "").replace(/\D/g, "");
  if (d.length < 2) return "";
  return "•".repeat(Math.max(2, d.length - 2)) + d.slice(-2);
};
app.get("/api/track", trackLimit, (req, res) => {
  const number = (req.query.number || "").toString().trim();
  const email  = (req.query.email  || "").toString().toLowerCase().trim();
  if (!number) return res.status(400).json({ error: "Order number required" });

  const order = db.prepare("SELECT * FROM orders WHERE number=?").get(number);
  const u = readUser(req);
  const owner = u && (u.is_admin || u.id === order?.user_id);
  // Require proof of ownership: either signed-in owner/admin, or the matching email.
  if (!order || (!owner && !(email && email === order.email))) {
    // Same response whether the order is missing or the email is wrong — no enumeration.
    return res.status(404).json({ error: "No order found for those details." });
  }
  const items = db.prepare("SELECT id, name, italic, qty, line_total FROM order_items WHERE order_id=?").all(order.id);
  res.json({
    order: {
      number: order.number,
      status: order.status,
      created_at: order.created_at,
      delivery: order.delivery,
      payment: order.payment,
      total: order.total,
      first_name: (order.full_name || "").trim().split(/\s+/)[0] || "",
      phone_masked: maskPhone(order.phone),
    },
    items,
  });
});

// Client-fired analytics events (things with no natural server call). Restricted
// to a client-safe subset so it can't be used to forge the server-logged events.
// Always 204, fire-and-forget — must never affect the user flow.
const CLIENT_EVENT_TYPES = new Set(["begin_checkout", "whatsapp_click"]);
app.post("/api/analytics/event", (req, res) => {
  const sid = sidOf(req, res);
  const type = String(req.body?.type || "");
  if (CLIENT_EVENT_TYPES.has(type)) {
    logEvent(sid, type, {
      productId: req.body?.productId ? String(req.body.productId).slice(0, 40) : null,
      value: Number.isFinite(req.body?.value) ? Math.trunc(req.body.value) : null,
      meta: (req.body?.meta && typeof req.body.meta === "object") ? req.body.meta : null,
    });
  }
  res.status(204).end();
});

/* ── newsletter + contact ────────────────────────────── */
app.post("/api/newsletter", (req, res) => {
  const email = (req.body?.email || "").toString().trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!ok) return res.status(400).json({ error: "Enter a valid email" });
  db.prepare("INSERT OR IGNORE INTO newsletter (email) VALUES (?)").run(email);
  res.json({ ok: true });
});

const contactSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  subject: z.string().max(160).optional(),
  message: z.string().min(2).max(4000),
});
app.post("/api/contact", tightLimit, (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  const u = readUser(req);
  db.prepare("INSERT INTO contact_messages (name,email,subject,message,user_id) VALUES (?,?,?,?,?)")
    .run(parsed.data.name, parsed.data.email.toLowerCase(), parsed.data.subject || null, parsed.data.message, u?.id || null);
  res.json({ ok: true });
});

/* ── admin (protected) ───────────────────────────────── */

// Stats for dashboard
app.get("/api/admin/stats", requireAuth, requireAdmin, (_req, res) => {
  res.json({
    products:  db.prepare("SELECT COUNT(*) c FROM products").get().c,
    brands:    db.prepare("SELECT COUNT(*) c FROM brands").get().c,
    orders:    db.prepare("SELECT COUNT(*) c FROM orders").get().c,
    pending:   db.prepare("SELECT COUNT(*) c FROM orders WHERE status IN ('pending','awaiting_payment','paid')").get().c,
    users:     db.prepare("SELECT COUNT(*) c FROM users").get().c,
    newsletter:db.prepare("SELECT COUNT(*) c FROM newsletter").get().c,
    messages:  db.prepare("SELECT COUNT(*) c FROM contact_messages").get().c,
    revenue:   db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE status NOT IN ('cancelled','refunded')").get().s,
    recentOrders: db.prepare("SELECT id,number,email,status,total,created_at FROM orders ORDER BY created_at DESC LIMIT 5").all(),
  });
});

// ── admin: owned analytics dashboard data ───────────────────────────────────
app.get("/api/admin/analytics", requireAuth, requireAdmin, (req, res) => {
  const days = [7, 30, 90].includes(parseInt(req.query.range, 10)) ? parseInt(req.query.range, 10) : 30;
  const since = Math.floor(Date.now() / 1000) - days * 86400;

  // Funnel — distinct sessions reaching each stage, with drop-off vs the previous.
  const stageRows = db.prepare(`
    SELECT type, COUNT(DISTINCT session_id) c
    FROM analytics_events
    WHERE created_at >= ? AND type IN ('product_view','add_to_cart','begin_checkout','purchase')
    GROUP BY type
  `).all(since);
  const stageCount = Object.fromEntries(stageRows.map(r => [r.type, r.c]));
  const order = [
    ["product_view", "Viewed a product"],
    ["add_to_cart", "Added to cart"],
    ["begin_checkout", "Began checkout"],
    ["purchase", "Purchased"],
  ];
  let prev = null;
  const funnel = order.map(([type, label]) => {
    const count = stageCount[type] || 0;
    const dropoff = prev != null && prev > 0 ? Math.round((1 - count / prev) * 100) : null;
    prev = count;
    return { type, label, count, dropoff };
  });

  // Top products — views, cart-adds, and view→cart conversion %.
  const top = db.prepare(`
    SELECT product_id,
           SUM(CASE WHEN type='product_view' THEN 1 ELSE 0 END) views,
           SUM(CASE WHEN type='add_to_cart'  THEN 1 ELSE 0 END) carts
    FROM analytics_events
    WHERE created_at >= ? AND product_id IS NOT NULL AND type IN ('product_view','add_to_cart')
    GROUP BY product_id
    HAVING views > 0
    ORDER BY views DESC
    LIMIT 12
  `).all(since).map(r => {
    const p = db.prepare("SELECT name, italic, brand_key FROM products WHERE id=?").get(r.product_id);
    return {
      productId: r.product_id,
      name: p ? `${p.name}${p.italic ? " " + p.italic : ""}` : r.product_id,
      brand: p?.brand_key || "",
      views: r.views, carts: r.carts,
      conversion: r.views ? Math.round((r.carts / r.views) * 100) : 0,
    };
  });

  // Frequently viewed together — distinct-session co-occurrence of product views.
  const pairs = db.prepare(`
    SELECT a.product_id p1, b.product_id p2, COUNT(DISTINCT a.session_id) c
    FROM analytics_events a
    JOIN analytics_events b
      ON a.session_id = b.session_id AND a.product_id < b.product_id
    WHERE a.type='product_view' AND b.type='product_view'
      AND a.created_at >= ? AND b.created_at >= ?
    GROUP BY p1, p2
    ORDER BY c DESC
    LIMIT 10
  `).all(since, since).map(r => {
    const n = (id) => { const p = db.prepare("SELECT name FROM products WHERE id=?").get(id); return p?.name || id; };
    return { a: n(r.p1), b: n(r.p2), count: r.c };
  });

  // Known-customer KPIs — sessions we can tie to a phone (hash), and repeat phones.
  const knownCustomers = db.prepare("SELECT COUNT(*) c FROM analytics_sessions WHERE phone_hash IS NOT NULL").get().c;
  const repeatCustomers = db.prepare(`
    SELECT COUNT(*) c FROM (
      SELECT phone_hash FROM analytics_sessions WHERE phone_hash IS NOT NULL
      GROUP BY phone_hash HAVING COUNT(*) > 1
    )
  `).get().c;

  const totals = {
    sessions: db.prepare("SELECT COUNT(DISTINCT session_id) c FROM analytics_events WHERE created_at >= ?").get(since).c,
    events:   db.prepare("SELECT COUNT(*) c FROM analytics_events WHERE created_at >= ?").get(since).c,
    whatsapp: db.prepare("SELECT COUNT(*) c FROM analytics_events WHERE created_at >= ? AND type='whatsapp_click'").get(since).c,
  };

  res.json({ range: days, funnel, top, pairs, knownCustomers, repeatCustomers, totals });
});

// ── admin: sales analytics ──────────────────────────────────
// Money view of the business (the /analytics endpoint above is behavioural):
// revenue over time, best sellers by actual sales, and how much of it comes from
// The Key members. Excludes cancelled/refunded orders throughout.
app.get("/api/admin/sales", requireAuth, requireAdmin, (req, res) => {
  const days = [7, 30, 90].includes(parseInt(req.query.range, 10)) ? parseInt(req.query.range, 10) : 30;
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const OK = "status NOT IN ('cancelled','refunded')";

  // Revenue + order count per local day, zero-filled so the chart has no gaps.
  const rawSeries = db.prepare(`
    SELECT date(created_at,'unixepoch','localtime') d,
           COALESCE(SUM(total),0) revenue, COUNT(*) orders
    FROM orders WHERE created_at >= ? AND ${OK}
    GROUP BY d
  `).all(since);
  const byDay = Object.fromEntries(rawSeries.map(r => [r.d, r]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(Date.now() - i * 86400000).toLocaleDateString("en-CA"); // YYYY-MM-DD, local
    const row = byDay[key];
    series.push({ date: key, revenue: row ? row.revenue : 0, orders: row ? row.orders : 0 });
  }

  // Best sellers by actual sales (units + revenue) within the range.
  const topProducts = db.prepare(`
    SELECT oi.product_id, oi.name, oi.italic, oi.brand_key,
           SUM(oi.qty) units, SUM(oi.line_total) revenue
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at >= ? AND o.${OK}
    GROUP BY oi.product_id
    ORDER BY revenue DESC
    LIMIT 12
  `).all(since).map(r => ({
    productId: r.product_id,
    name: `${r.name}${r.italic ? " " + r.italic : ""}`,
    brand: r.brand_key || "",
    units: r.units, revenue: r.revenue,
  }));

  // Range totals.
  const t = db.prepare(`SELECT COALESCE(SUM(total),0) revenue, COUNT(*) orders,
                               COALESCE(SUM(discount),0) discount
                        FROM orders WHERE created_at >= ? AND ${OK}`).get(since);
  const totals = {
    revenue: t.revenue, orders: t.orders, discount: t.discount,
    aov: t.orders ? Math.round(t.revenue / t.orders) : 0,
  };

  // Revenue split by who bought: premium member / standard account / guest.
  const tierRows = db.prepare(`
    SELECT CASE WHEN o.user_id IS NULL THEN 'guest'
                WHEN u.tier='premium' THEN 'premium' ELSE 'standard' END bucket,
           COALESCE(SUM(o.total),0) revenue, COUNT(*) orders
    FROM orders o LEFT JOIN users u ON u.id = o.user_id
    WHERE o.created_at >= ? AND o.${OK}
    GROUP BY bucket
  `).all(since);
  const bucket = Object.fromEntries(tierRows.map(r => [r.bucket, r]));
  const seg = (k) => ({ revenue: bucket[k]?.revenue || 0, orders: bucket[k]?.orders || 0 });

  // Membership standing (not range-bound): premium count + how many standard
  // customers have crossed the spend threshold and are eligible for an invite.
  const cfg = membershipCfg();
  const premiumCount = db.prepare("SELECT COUNT(*) c FROM users WHERE tier='premium'").get().c;
  const eligibleCount = db.prepare(`
    SELECT COUNT(*) c FROM (
      SELECT u.id, COALESCE(SUM(o.total),0) spend
      FROM users u LEFT JOIN orders o ON o.user_id = u.id AND o.${OK}
      WHERE (u.tier IS NULL OR u.tier <> 'premium')
      GROUP BY u.id HAVING spend >= ?
    )
  `).get(cfg.threshold).c;

  res.json({
    range: days, series, topProducts, totals,
    members: {
      premiumCount, eligibleCount,
      threshold: cfg.threshold, discountPct: cfg.discountPct,
      premium: seg("premium"), standard: seg("standard"), guest: seg("guest"),
    },
  });
});

// ── admin: AI product authoring (photo → draft fields) ──────────────────────
// In-memory uploader (we never persist the analyzed file here — the admin uploads
// the real product image through the normal flow after reviewing the draft).
const aiImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|avif|gif)$/.test(file.mimetype);
    cb(ok ? null : new Error("Only PNG / JPG / WEBP / AVIF / GIF allowed"), ok);
  },
}).single("image");

// Read an image the admin already uploaded to OUR storage (anti-phishing: only
// /uploads/* paths under UPLOAD_DIR are allowed — never an arbitrary URL).
function readOwnUpload(rel) {
  if (typeof rel !== "string" || !rel.startsWith("/uploads/")) return null;
  const abs = path.normalize(path.join(UPLOAD_DIR, rel.replace(/^\/uploads\//, "")));
  if (!abs.startsWith(UPLOAD_DIR)) return null; // path traversal guard
  if (!fs.existsSync(abs)) return null;
  const ext = path.extname(abs).toLowerCase();
  const mime = MIME_EXT_REVERSE[ext];
  if (!mime) return null;
  return { base64: fs.readFileSync(abs).toString("base64"), mimeType: mime };
}
const MIME_EXT_REVERSE = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif",
};

// Clamp the model's category/concerns to the shop's real taxonomy so a stray
// value never lands in the form.
function clampToTaxonomy(draft, taxonomy) {
  const catKeys = new Set((taxonomy.categories || []).map(c => c.key));
  const conKeys = new Set((taxonomy.concerns || []).map(c => c.key));
  const brandKeys = new Set((taxonomy.brands || []).map(b => b.key));
  return {
    name: String(draft.name || "").slice(0, 120),
    italic: String(draft.italic || "").slice(0, 120),
    size: String(draft.size || "").slice(0, 40),
    sub: String(draft.sub || "").slice(0, 60),
    category: catKeys.has(draft.category) ? draft.category : "",
    concerns: Array.isArray(draft.concerns) ? draft.concerns.filter(c => conKeys.has(c)) : [],
    copy: String(draft.copy || "").slice(0, 2000),
    notes: Array.isArray(draft.notes) ? draft.notes.map(n => String(n).slice(0, 80)).slice(0, 12) : [],
    meta_title: String(draft.meta_title || "").slice(0, 200),
    meta_desc: String(draft.meta_desc || "").slice(0, 400),
    brand_guess: brandKeys.has(draft.brand_guess) ? draft.brand_guess : "",
  };
}

app.post("/api/admin/ai/describe-product", uploadLimit, requireAuth, requireAdmin, (req, res) => {
  if (!aiConfigured) {
    return res.status(503).json({ error: "AI is not configured — set the provider API key in .env." });
  }
  aiImageUpload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    let image = null;
    if (req.file) {
      image = { base64: req.file.buffer.toString("base64"), mimeType: req.file.mimetype };
    } else if (req.body && req.body.imageUrl) {
      image = readOwnUpload(req.body.imageUrl);
      if (!image) return res.status(400).json({ error: "imageUrl must point to an existing /uploads image." });
    } else {
      return res.status(400).json({ error: "Provide an image file or an imageUrl." });
    }

    const taxonomy = {
      categories: db.prepare("SELECT key, label FROM categories ORDER BY sort").all(),
      concerns:   db.prepare("SELECT key, label FROM concerns ORDER BY sort").all(),
      brands:     db.prepare("SELECT key, name FROM brands ORDER BY sort").all(),
    };

    try {
      const draft = await describeProductFromImage({ ...image, taxonomy });
      res.json({ provider: AI_PROVIDER, draft: clampToTaxonomy(draft, taxonomy) });
    } catch (e) {
      console.error("AI describe failed:", e?.message || e);
      res.status(502).json({ error: "Couldn't analyze the photo — please try again." });
    }
  });
});

// Products: list (admin sees inactive too)
app.get("/api/admin/products", requireAuth, requireAdmin, (_req, res) => {
  const rows = db.prepare("SELECT * FROM products ORDER BY created_at DESC").all();
  res.json(rows.map(hydrateProduct));
});

const productSchema = z.object({
  id:           z.string().min(1).max(40).regex(/^[a-z0-9-_]+$/i, "Use letters, numbers, - or _"),
  brand_key:    z.string().min(1),
  name:         z.string().min(1).max(120),
  italic:       z.string().max(120).optional().nullable(),
  category:     z.string().min(1),
  sub:          z.string().max(60).optional().nullable(),
  size:         z.string().max(40).optional().nullable(),
  variant:      z.string().max(40).optional().nullable(),
  liquid:       z.string().max(20).optional().nullable(),
  liquid_top:   z.string().max(20).optional().nullable(),
  copy:         z.string().max(2000).optional().nullable(),
  price:        z.number().int().min(0),
  sale_price:   z.number().int().min(0).optional().nullable(),
  off_pct:      z.number().int().min(0).max(100).optional().nullable(),
  is_new:       z.boolean().optional(),
  is_bestseller:z.boolean().optional(),
  is_active:    z.boolean().optional(),
  stock:        z.number().int().min(0).default(0),
  editor_pick_sort: z.number().int().nullable().optional(),
  editor_tag:       z.string().max(40).nullable().optional(),
  meta_title:   z.string().max(200).nullable().optional(),
  meta_desc:    z.string().max(400).nullable().optional(),
  members_only:       z.boolean().optional(),
  early_access_until: z.number().int().nullable().optional(),
  concerns:     z.array(z.string()).optional(),
  skin_types:   z.array(z.string()).optional(),
  notes:        z.array(z.string()).optional(),
});

const writeConcernsNotes = (id, concerns = [], notes = [], skinTypes = []) => {
  db.prepare("DELETE FROM product_concerns WHERE product_id=?").run(id);
  const insC = db.prepare("INSERT INTO product_concerns (product_id,concern) VALUES (?,?)");
  concerns.forEach(c => insC.run(id, c));
  db.prepare("DELETE FROM product_skin_types WHERE product_id=?").run(id);
  const insS = db.prepare("INSERT OR IGNORE INTO product_skin_types (product_id,skin_type) VALUES (?,?)");
  skinTypes.forEach(s => insS.run(id, s));
  db.prepare("DELETE FROM product_notes WHERE product_id=?").run(id);
  const insN = db.prepare("INSERT INTO product_notes (product_id,note,sort) VALUES (?,?,?)");
  notes.forEach((n, i) => insN.run(id, n, i));
};

app.post("/api/admin/products", requireAuth, requireAdmin, (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  const d = parsed.data;
  if (db.prepare("SELECT id FROM products WHERE id=?").get(d.id)) return res.status(409).json({ error: "ID already exists" });
  db.transaction(() => {
    db.prepare(`
      INSERT INTO products
        (id,brand_key,name,italic,category,sub,size,variant,liquid,liquid_top,copy,price,sale_price,off_pct,is_new,is_bestseller,is_active,stock,editor_pick_sort,editor_tag,meta_title,meta_desc,members_only,early_access_until)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      d.id, d.brand_key, d.name, d.italic || null, d.category, d.sub || null, d.size || null,
      d.variant || null, d.liquid || null, d.liquid_top || null, d.copy || null,
      d.price, d.sale_price || null, d.off_pct || null,
      d.is_new ? 1 : 0, d.is_bestseller ? 1 : 0, d.is_active === false ? 0 : 1, d.stock || 0,
      d.editor_pick_sort ?? null, d.editor_tag || null, d.meta_title || null, d.meta_desc || null,
      d.members_only ? 1 : 0, d.early_access_until ?? null,
    );
    writeConcernsNotes(d.id, d.concerns, d.notes, d.skin_types);
  })();
  res.json({ ok: true, product: productById(d.id) });
});

app.patch("/api/admin/products/:id", requireAuth, requireAdmin, (req, res) => {
  const id = req.params.id;
  const existing = db.prepare("SELECT id FROM products WHERE id=?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  // Allow partial updates — start from current row then merge.
  const cur = db.prepare("SELECT * FROM products WHERE id=?").get(id);
  const curConcerns = db.prepare("SELECT concern FROM product_concerns WHERE product_id=?").all(id).map(r => r.concern);
  const curSkin     = db.prepare("SELECT skin_type FROM product_skin_types WHERE product_id=?").all(id).map(r => r.skin_type);
  const curNotes    = db.prepare("SELECT note FROM product_notes WHERE product_id=? ORDER BY sort").all(id).map(r => r.note);
  const merged = {
    id, // unchanged
    brand_key:        req.body.brand_key        ?? cur.brand_key,
    name:             req.body.name             ?? cur.name,
    italic:           req.body.italic           ?? cur.italic,
    category:         req.body.category         ?? cur.category,
    sub:              req.body.sub              ?? cur.sub,
    size:             req.body.size             ?? cur.size,
    variant:          req.body.variant          ?? cur.variant,
    liquid:           req.body.liquid           ?? cur.liquid,
    liquid_top:       req.body.liquid_top       ?? cur.liquid_top,
    copy:             req.body.copy             ?? cur.copy,
    price:            req.body.price            ?? cur.price,
    sale_price:       req.body.sale_price       !== undefined ? req.body.sale_price       : cur.sale_price,
    off_pct:          req.body.off_pct          !== undefined ? req.body.off_pct          : cur.off_pct,
    is_new:           req.body.is_new           ?? !!cur.is_new,
    is_bestseller:    req.body.is_bestseller    ?? !!cur.is_bestseller,
    is_active:        req.body.is_active        ?? (cur.is_active == null ? true : !!cur.is_active),
    stock:            req.body.stock            ?? cur.stock ?? 0,
    editor_pick_sort: req.body.editor_pick_sort !== undefined ? req.body.editor_pick_sort : cur.editor_pick_sort,
    editor_tag:       req.body.editor_tag       !== undefined ? req.body.editor_tag       : cur.editor_tag,
    meta_title:       req.body.meta_title       !== undefined ? req.body.meta_title       : cur.meta_title,
    meta_desc:        req.body.meta_desc        !== undefined ? req.body.meta_desc        : cur.meta_desc,
    members_only:       req.body.members_only       ?? !!cur.members_only,
    early_access_until: req.body.early_access_until !== undefined ? req.body.early_access_until : cur.early_access_until,
    concerns:         req.body.concerns         ?? curConcerns,
    skin_types:       req.body.skin_types       ?? curSkin,
    notes:            req.body.notes            ?? curNotes,
  };
  const parsed = productSchema.safeParse(merged);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  const d = parsed.data;
  db.transaction(() => {
    db.prepare(`
      UPDATE products SET
        brand_key=?, name=?, italic=?, category=?, sub=?, size=?, variant=?,
        liquid=?, liquid_top=?, copy=?, price=?, sale_price=?, off_pct=?,
        is_new=?, is_bestseller=?, is_active=?, stock=?,
        editor_pick_sort=?, editor_tag=?, meta_title=?, meta_desc=?,
        members_only=?, early_access_until=?
      WHERE id=?
    `).run(
      d.brand_key, d.name, d.italic || null, d.category, d.sub || null, d.size || null,
      d.variant || null, d.liquid || null, d.liquid_top || null, d.copy || null,
      d.price, d.sale_price || null, d.off_pct || null,
      d.is_new ? 1 : 0, d.is_bestseller ? 1 : 0, d.is_active === false ? 0 : 1, d.stock || 0,
      d.editor_pick_sort ?? null, d.editor_tag || null, d.meta_title || null, d.meta_desc || null,
      d.members_only ? 1 : 0, d.early_access_until ?? null,
      id,
    );
    writeConcernsNotes(id, d.concerns, d.notes, d.skin_types);
  })();
  res.json({ ok: true, product: productById(id) });
});

app.delete("/api/admin/products/:id", requireAuth, requireAdmin, (req, res) => {
  const id = req.params.id;
  const p = db.prepare("SELECT image FROM products WHERE id=?").get(id);
  if (!p) return res.status(404).json({ error: "Not found" });

  // If this product appears in any order, hard-deleting it would break order history.
  // Refuse with a clear message — admin can use the "Hide" toggle (is_active=0) instead.
  const orderCount = db.prepare("SELECT COUNT(*) c FROM order_items WHERE product_id=?").get(id).c;
  if (orderCount > 0) {
    return res.status(409).json({
      error: `This product appears in ${orderCount} order${orderCount === 1 ? "" : "s"} — hide it instead so order history stays intact.`,
      canHide: true,
    });
  }

  // Cart items + wishlist + hero slides cascade or can be cleared safely.
  db.transaction(() => {
    db.prepare("DELETE FROM cart_items WHERE product_id=?").run(id);
    // wishlists & hero_slides already have ON DELETE CASCADE
    db.prepare("DELETE FROM products WHERE id=?").run(id);
  })();
  removeStored(p.image).catch(() => {}); // clean the image (R2/disk) after the tx

  res.json({ ok: true });
});

// ── Competitor import review (drafts from scripts/import.js) ────────────────
app.get("/api/admin/imports", requireAuth, requireAdmin, (_req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.name, p.brand_key, b.name AS brand_name, p.category, p.size,
           p.price, p.sale_price, p.off_pct, p.stock, p.image, p.copy,
           p.is_active, p.import_source, p.import_handle, p.created_at
    FROM products p LEFT JOIN brands b ON b.key = p.brand_key
    WHERE p.import_source IS NOT NULL
    ORDER BY p.is_active ASC, p.import_source, p.created_at DESC
  `).all();
  const bySource = {};
  rows.forEach(r => { (bySource[r.import_source] ||= { source: r.import_source, drafts: 0, published: 0, items: [] });
    bySource[r.import_source].items.push(r);
    if (r.is_active) bySource[r.import_source].published++; else bySource[r.import_source].drafts++; });
  res.json({ sources: Object.values(bySource), total: rows.length });
});

// Bulk publish (set is_active=1) imported drafts.
app.post("/api/admin/imports/publish", requireAuth, requireAdmin, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const stmt = db.prepare("UPDATE products SET is_active=1 WHERE id=? AND import_source IS NOT NULL");
  let n = 0; db.transaction(() => ids.forEach(id => { n += stmt.run(id).changes; }))();
  res.json({ ok: true, published: n });
});

// Bulk delete imported products (removes their downloaded images too).
app.post("/api/admin/imports/delete", requireAuth, requireAdmin, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const toRemove = [];
  db.transaction(() => ids.forEach(id => {
    const p = db.prepare("SELECT image FROM products WHERE id=? AND import_source IS NOT NULL").get(id);
    if (!p) return;
    if (db.prepare("SELECT 1 FROM order_items WHERE product_id=?").get(id)) return; // keep ordered items
    db.prepare("DELETE FROM cart_items WHERE product_id=?").run(id);
    if (p.image) toRemove.push(p.image);
    db.prepare("DELETE FROM products WHERE id=?").run(id);
  }))();
  Promise.all(toRemove.map(u => removeStored(u).catch(() => {}))); // clean images after the tx
  res.json({ ok: true });
});

// Image upload for products + brands. URL param :kind = 'products' | 'brands'
app.post("/api/admin/upload/:kind/:id", uploadLimit, requireAuth, requireAdmin, (req, res, next) => {
  if (!["products", "brands"].includes(req.params.kind)) return res.status(400).json({ error: "Invalid kind" });
  upload.single("image")(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No file" });
    try {
      if (req.params.kind === "products") {
        const prod = db.prepare("SELECT image FROM products WHERE id=?").get(req.params.id);
        if (!prod) return res.status(404).json({ error: "Product not found" });
        const url = await finalizeUpload(req.file, "products");
        await removeStored(prod.image);
        db.prepare("UPDATE products SET image=? WHERE id=?").run(url, req.params.id);
        return res.json({ ok: true, url });
      }
      const b = db.prepare("SELECT image FROM brands WHERE key=?").get(req.params.id);
      if (!b) return res.status(404).json({ error: "Brand not found" });
      const url = await finalizeUpload(req.file, "brands");
      await removeStored(b.image);
      db.prepare("UPDATE brands SET image=? WHERE key=?").run(url, req.params.id);
      res.json({ ok: true, url });
    } catch (e) {
      console.error("upload failed:", e?.message || e);
      res.status(502).json({ error: "Upload failed" });
    }
  });
});

app.delete("/api/admin/upload/:kind/:id", requireAuth, requireAdmin, async (req, res) => {
  if (!["products", "brands"].includes(req.params.kind)) return res.status(400).json({ error: "Invalid kind" });
  const table = req.params.kind === "products" ? "products" : "brands";
  const idCol = table === "brands" ? "key" : "id";
  const row = db.prepare(`SELECT image FROM ${table} WHERE ${idCol}=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  await removeStored(row.image);
  db.prepare(`UPDATE ${table} SET image=NULL WHERE ${idCol}=?`).run(req.params.id);
  res.json({ ok: true });
});

// Brands CRUD
const brandSchema = z.object({
  key:     z.string().min(1).max(40).regex(/^[a-z0-9-_]+$/, "lowercase letters, numbers, - or _"),
  name:    z.string().min(1).max(120),
  font:    z.string().max(120).optional().nullable(),
  case_:   z.string().max(20).optional().nullable(),
  accent:  z.string().max(20).optional().nullable(),
  tagline: z.string().max(120).optional().nullable(),
  loc:     z.string().max(80).optional().nullable(),
  cat:     z.string().max(120).optional().nullable(),
  sort:    z.number().int().optional(),
});

app.get("/api/admin/brands", requireAuth, requireAdmin, (_req, res) => {
  res.json(db.prepare("SELECT * FROM brands ORDER BY sort").all());
});

app.post("/api/admin/brands", requireAuth, requireAdmin, (req, res) => {
  const parsed = brandSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  if (db.prepare("SELECT key FROM brands WHERE key=?").get(parsed.data.key)) return res.status(409).json({ error: "Brand key exists" });
  const d = parsed.data;
  const maxSort = db.prepare("SELECT COALESCE(MAX(sort),-1) m FROM brands").get().m;
  db.prepare(`INSERT INTO brands (key,name,font,case_,accent,tagline,loc,cat,sort)
              VALUES (?,?,?,?,?,?,?,?,?)`).run(
    d.key, d.name, d.font || null, d.case_ || null, d.accent || null,
    d.tagline || null, d.loc || null, d.cat || null, d.sort ?? (maxSort + 1),
  );
  res.json({ ok: true });
});

app.patch("/api/admin/brands/:key", requireAuth, requireAdmin, (req, res) => {
  const cur = db.prepare("SELECT * FROM brands WHERE key=?").get(req.params.key);
  if (!cur) return res.status(404).json({ error: "Not found" });
  const merged = {
    key:     req.params.key,
    name:    req.body.name    ?? cur.name,
    font:    req.body.font    ?? cur.font,
    case_:   req.body.case_   ?? cur.case_,
    accent:  req.body.accent  ?? cur.accent,
    tagline: req.body.tagline ?? cur.tagline,
    loc:     req.body.loc     ?? cur.loc,
    cat:     req.body.cat     ?? cur.cat,
    sort:    req.body.sort    ?? cur.sort,
  };
  const parsed = brandSchema.safeParse(merged);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  const d = parsed.data;
  db.prepare(`UPDATE brands SET name=?, font=?, case_=?, accent=?, tagline=?, loc=?, cat=?, sort=? WHERE key=?`).run(
    d.name, d.font || null, d.case_ || null, d.accent || null,
    d.tagline || null, d.loc || null, d.cat || null, d.sort ?? 0, req.params.key,
  );
  res.json({ ok: true });
});

app.delete("/api/admin/brands/:key", requireAuth, requireAdmin, (req, res) => {
  const inUse = db.prepare("SELECT COUNT(*) c FROM products WHERE brand_key=?").get(req.params.key).c;
  if (inUse > 0) return res.status(409).json({ error: `Brand has ${inUse} product(s) — reassign or delete those first.` });
  db.prepare("DELETE FROM brands WHERE key=?").run(req.params.key);
  res.json({ ok: true });
});

// Categories CRUD
const categorySchema = z.object({
  key:    z.string().min(1).max(40).regex(/^[a-z0-9-_]+$/, "lowercase, numbers, - or _"),
  label:  z.string().min(1).max(80),
  italic: z.string().max(80).optional().nullable(),
  sort:   z.number().int().optional(),
});
app.get("/api/admin/categories", requireAuth, requireAdmin, (_req, res) => {
  res.json(db.prepare("SELECT * FROM categories ORDER BY sort").all());
});
app.post("/api/admin/categories", requireAuth, requireAdmin, (req, res) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  if (db.prepare("SELECT key FROM categories WHERE key=?").get(parsed.data.key)) return res.status(409).json({ error: "Category key exists" });
  const d = parsed.data;
  const m = db.prepare("SELECT COALESCE(MAX(sort),-1) m FROM categories").get().m;
  db.prepare("INSERT INTO categories (key,label,italic,sort) VALUES (?,?,?,?)").run(d.key, d.label, d.italic || null, d.sort ?? (m + 1));
  res.json({ ok: true });
});
app.patch("/api/admin/categories/:key", requireAuth, requireAdmin, (req, res) => {
  const cur = db.prepare("SELECT * FROM categories WHERE key=?").get(req.params.key);
  if (!cur) return res.status(404).json({ error: "Not found" });
  const m = { key: req.params.key, label: req.body.label ?? cur.label, italic: req.body.italic ?? cur.italic, sort: req.body.sort ?? cur.sort };
  const p = categorySchema.safeParse(m);
  if (!p.success) return res.status(400).json({ error: "Invalid input" });
  db.prepare("UPDATE categories SET label=?, italic=?, sort=? WHERE key=?").run(p.data.label, p.data.italic || null, p.data.sort ?? 0, req.params.key);
  res.json({ ok: true });
});
app.delete("/api/admin/categories/:key", requireAuth, requireAdmin, (req, res) => {
  const inUse = db.prepare("SELECT COUNT(*) c FROM products WHERE category=?").get(req.params.key).c;
  if (inUse > 0) return res.status(409).json({ error: `Category has ${inUse} product(s) — reassign first.` });
  db.prepare("DELETE FROM categories WHERE key=?").run(req.params.key);
  res.json({ ok: true });
});

// Concerns CRUD
const concernSchema = z.object({
  key:   z.string().min(1).max(40).regex(/^[a-z0-9-_]+$/, "lowercase, numbers, - or _"),
  label: z.string().min(1).max(80),
  sort:  z.number().int().optional(),
});
app.get("/api/admin/concerns", requireAuth, requireAdmin, (_req, res) => {
  res.json(db.prepare("SELECT * FROM concerns ORDER BY sort").all());
});
app.post("/api/admin/concerns", requireAuth, requireAdmin, (req, res) => {
  const p = concernSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid input" });
  if (db.prepare("SELECT key FROM concerns WHERE key=?").get(p.data.key)) return res.status(409).json({ error: "Concern exists" });
  const m = db.prepare("SELECT COALESCE(MAX(sort),-1) m FROM concerns").get().m;
  db.prepare("INSERT INTO concerns (key,label,sort) VALUES (?,?,?)").run(p.data.key, p.data.label, p.data.sort ?? (m + 1));
  res.json({ ok: true });
});
app.delete("/api/admin/concerns/:key", requireAuth, requireAdmin, (req, res) => {
  db.prepare("DELETE FROM product_concerns WHERE concern=?").run(req.params.key);
  db.prepare("DELETE FROM concerns WHERE key=?").run(req.params.key);
  res.json({ ok: true });
});

// Skin types — same shape as concerns (see concernSchema).
app.get("/api/admin/skin-types", requireAuth, requireAdmin, (_req, res) => {
  res.json(db.prepare("SELECT * FROM skin_types ORDER BY sort").all());
});
app.post("/api/admin/skin-types", requireAuth, requireAdmin, (req, res) => {
  const p = concernSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid input" });
  if (db.prepare("SELECT key FROM skin_types WHERE key=?").get(p.data.key)) return res.status(409).json({ error: "Skin type exists" });
  const m = db.prepare("SELECT COALESCE(MAX(sort),-1) m FROM skin_types").get().m;
  db.prepare("INSERT INTO skin_types (key,label,sort) VALUES (?,?,?)").run(p.data.key, p.data.label, p.data.sort ?? (m + 1));
  res.json({ ok: true });
});
app.delete("/api/admin/skin-types/:key", requireAuth, requireAdmin, (req, res) => {
  db.prepare("DELETE FROM product_skin_types WHERE skin_type=?").run(req.params.key);
  db.prepare("DELETE FROM skin_types WHERE key=?").run(req.params.key);
  res.json({ ok: true });
});

// Orders + admin lists
app.get("/api/admin/orders", requireAuth, requireAdmin, (_req, res) => {
  res.json(db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 200").all());
});
app.get("/api/admin/orders/:id", requireAuth, requireAdmin, (req, res) => {
  const o = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!o) return res.status(404).json({ error: "Not found" });
  const items = db.prepare("SELECT * FROM order_items WHERE order_id=?").all(o.id);
  res.json({ order: o, items });
});
app.patch("/api/admin/orders/:id", requireAuth, requireAdmin, (req, res) => {
  const status = (req.body?.status || "").toString();
  if (!["pending","awaiting_payment","paid","shipped","delivered","cancelled","refunded"].includes(status))
    return res.status(400).json({ error: "Invalid status" });
  db.prepare("UPDATE orders SET status=? WHERE id=?").run(status, req.params.id);
  res.json({ ok: true });
});
app.delete("/api/admin/orders/:id", requireAuth, requireAdmin, (req, res) => {
  const o = db.prepare("SELECT id FROM orders WHERE id=?").get(req.params.id);
  if (!o) return res.status(404).json({ error: "Not found" });
  // order_items has FK with cascade-on-delete via the schema (let SQLite handle it).
  db.transaction(() => {
    db.prepare("DELETE FROM order_items WHERE order_id=?").run(o.id);
    db.prepare("DELETE FROM orders WHERE id=?").run(o.id);
  })();
  res.json({ ok: true });
});
app.get("/api/admin/contact", requireAuth, requireAdmin, (_req, res) => {
  res.json(db.prepare("SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 200").all());
});
app.delete("/api/admin/contact/:id", requireAuth, requireAdmin, (req, res) => {
  db.prepare("DELETE FROM contact_messages WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});
app.get("/api/admin/newsletter", requireAuth, requireAdmin, (_req, res) => {
  res.json(db.prepare("SELECT email, created_at FROM newsletter ORDER BY created_at DESC").all());
});
app.delete("/api/admin/newsletter/:email", requireAuth, requireAdmin, (req, res) => {
  db.prepare("DELETE FROM newsletter WHERE email=?").run(req.params.email);
  res.json({ ok: true });
});

// ── admin: membership ("The Key") ───────────────────────────
app.get("/api/admin/members", requireAuth, requireAdmin, (_req, res) => {
  const cfg = membershipCfg();
  const rows = db.prepare(`
    SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.tier, u.tier_since, u.created_at,
      (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.user_id=u.id AND o.status NOT IN ('cancelled','refunded')) AS lifetime_spend,
      (SELECT COUNT(*)               FROM orders o WHERE o.user_id=u.id AND o.status NOT IN ('cancelled','refunded')) AS order_count
    FROM users u WHERE u.is_admin=0
    ORDER BY lifetime_spend DESC, u.created_at DESC
  `).all();
  res.json(rows.map(r => ({ ...r, eligible: r.lifetime_spend >= cfg.threshold, threshold: cfg.threshold })));
});

// Generate an invitation code bound to a customer's email.
app.post("/api/admin/members/:id/invite", requireAuth, requireAdmin, (req, res) => {
  const u = db.prepare("SELECT id, email FROM users WHERE id=?").get(req.params.id);
  if (!u) return res.status(404).json({ error: "Customer not found" });
  const code = "KEY-" + orderCode(8);
  const days = Number(req.body?.expires_days);
  const expires = days > 0 ? Math.floor(Date.now() / 1000) + days * 86400 : null;
  db.prepare("INSERT INTO membership_invites (code,email,note,created_by,expires_at) VALUES (?,?,?,?,?)")
    .run(code, u.email || null, req.body?.note || null, req.user.id, expires);
  res.json({ ok: true, code, email: u.email });
});

// Directly grant/revoke premium.
app.post("/api/admin/members/:id/tier", requireAuth, requireAdmin, (req, res) => {
  const tier = String(req.body?.tier || "");
  if (!["standard", "premium"].includes(tier)) return res.status(400).json({ error: "Invalid tier" });
  if (!db.prepare("SELECT id FROM users WHERE id=?").get(req.params.id)) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE users SET tier=?, tier_since=? WHERE id=?")
    .run(tier, tier === "premium" ? Math.floor(Date.now() / 1000) : null, req.params.id);
  res.json({ ok: true });
});

app.get("/api/admin/membership/invites", requireAuth, requireAdmin, (_req, res) => {
  res.json(db.prepare("SELECT * FROM membership_invites ORDER BY created_at DESC LIMIT 200").all());
});
app.delete("/api/admin/membership/invites/:code", requireAuth, requireAdmin, (req, res) => {
  db.prepare("DELETE FROM membership_invites WHERE code=? AND redeemed_at IS NULL").run(req.params.code);
  res.json({ ok: true });
});

// ── admin: settings ─────────────────────────────────────────
app.get("/api/admin/settings", requireAuth, requireAdmin, (_req, res) => {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const out = {};
  for (const r of rows) { try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; } }
  res.json(out);
});
app.patch("/api/admin/settings", requireAuth, requireAdmin, (req, res) => {
  const body = req.body || {};
  const stmt = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%s','now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
  `);
  db.transaction(() => {
    for (const [k, v] of Object.entries(body)) stmt.run(k, JSON.stringify(v));
  })();
  res.json({ ok: true });
});

// ── admin: announcements ────────────────────────────────────
app.get("/api/admin/announcements", requireAuth, requireAdmin, (_req, res) => {
  res.json(db.prepare("SELECT * FROM announcements ORDER BY sort, id").all());
});
app.post("/api/admin/announcements", requireAuth, requireAdmin, (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "Text required" });
  const m = db.prepare("SELECT COALESCE(MAX(sort), -1) m FROM announcements").get().m;
  const info = db.prepare("INSERT INTO announcements (text, sort) VALUES (?, ?)").run(text, m + 1);
  res.json({ ok: true, id: info.lastInsertRowid });
});
app.patch("/api/admin/announcements/:id", requireAuth, requireAdmin, (req, res) => {
  const cur = db.prepare("SELECT * FROM announcements WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE announcements SET text=?, sort=?, active=? WHERE id=?").run(
    req.body.text ?? cur.text,
    req.body.sort ?? cur.sort,
    req.body.active != null ? (req.body.active ? 1 : 0) : cur.active,
    req.params.id,
  );
  res.json({ ok: true });
});
app.delete("/api/admin/announcements/:id", requireAuth, requireAdmin, (req, res) => {
  db.prepare("DELETE FROM announcements WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── admin: hero slides ──────────────────────────────────────
app.get("/api/admin/hero-slides", requireAuth, requireAdmin, (_req, res) => {
  res.json(db.prepare("SELECT * FROM hero_slides ORDER BY sort, id").all());
});
app.post("/api/admin/hero-slides", requireAuth, requireAdmin, (req, res) => {
  const pid = String(req.body?.product_id || "").trim();
  const title = String(req.body?.custom_title || "").trim();
  // A slide is valid if it names a product OR is an editorial slide with a headline.
  if (!pid && !title) return res.status(400).json({ error: "Pick a product or write a headline" });
  if (pid && !db.prepare("SELECT id FROM products WHERE id=?").get(pid)) return res.status(404).json({ error: "Product not found" });
  const m = db.prepare("SELECT COALESCE(MAX(sort),-1) m FROM hero_slides").get().m;
  const info = db.prepare(`INSERT INTO hero_slides
    (product_id, custom_tag, custom_title, custom_dek, custom_cta, custom_href, custom_video, custom_poster, sort)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    pid || null, req.body.custom_tag || null, title || null,
    req.body.custom_dek || null, req.body.custom_cta || null, req.body.custom_href || null,
    req.body.custom_video || null, req.body.custom_poster || null, m + 1,
  );
  res.json({ ok: true, id: info.lastInsertRowid });
});
app.patch("/api/admin/hero-slides/:id", requireAuth, requireAdmin, (req, res) => {
  const cur = db.prepare("SELECT * FROM hero_slides WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "Not found" });
  const b = req.body || {};
  const pick = (k) => (b[k] !== undefined ? (b[k] === "" ? null : b[k]) : cur[k]);
  db.prepare(`UPDATE hero_slides SET
      product_id=?, custom_tag=?, custom_title=?, custom_dek=?, custom_cta=?, custom_href=?, custom_video=?, custom_poster=?, sort=?, active=?
      WHERE id=?`).run(
    b.product_id !== undefined ? (b.product_id || null) : cur.product_id,
    pick("custom_tag"), pick("custom_title"), pick("custom_dek"), pick("custom_cta"), pick("custom_href"),
    pick("custom_video"), pick("custom_poster"),
    b.sort ?? cur.sort,
    b.active != null ? (b.active ? 1 : 0) : cur.active,
    req.params.id,
  );
  res.json({ ok: true });
});
app.delete("/api/admin/hero-slides/:id", requireAuth, requireAdmin, async (req, res) => {
  // Clean up any uploaded clip/poster we own (R2 or disk); leave external URLs alone.
  const cur = db.prepare("SELECT custom_video, custom_poster FROM hero_slides WHERE id=?").get(req.params.id);
  if (cur) for (const rel of [cur.custom_video, cur.custom_poster]) await removeStored(rel);
  db.prepare("DELETE FROM hero_slides WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// Attach / replace / clear a hero slide's clip or poster. Field name matches the
// media kind ("video" | "poster"); stored on R2 (or /uploads/hero on disk).
function heroMediaRoutes(kind, column, mw) {
  app.post(`/api/admin/hero-slides/:id/${kind}`, uploadLimit, requireAuth, requireAdmin, (req, res) => {
    const slide = db.prepare("SELECT * FROM hero_slides WHERE id=?").get(req.params.id);
    if (!slide) return res.status(404).json({ error: "Slide not found" });
    mw.single(kind)(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: "No file" });
      try {
        const url = await finalizeUpload(req.file, "hero");
        await removeStored(slide[column]); // drop the previous upload if replacing
        db.prepare(`UPDATE hero_slides SET ${column}=? WHERE id=?`).run(url, req.params.id);
        res.json({ ok: true, url });
      } catch (e) {
        console.error("hero upload failed:", e?.message || e);
        res.status(502).json({ error: "Upload failed" });
      }
    });
  });
  app.delete(`/api/admin/hero-slides/:id/${kind}`, requireAuth, requireAdmin, async (req, res) => {
    const slide = db.prepare("SELECT * FROM hero_slides WHERE id=?").get(req.params.id);
    if (!slide) return res.status(404).json({ error: "Slide not found" });
    await removeStored(slide[column]);
    db.prepare(`UPDATE hero_slides SET ${column}=NULL WHERE id=?`).run(req.params.id);
    res.json({ ok: true });
  });
}
heroMediaRoutes("video",  "custom_video",  heroVideoUpload);
heroMediaRoutes("poster", "custom_poster", heroPosterUpload);

// ── admin: journal ──────────────────────────────────────────
app.get("/api/admin/journal", requireAuth, requireAdmin, (_req, res) => {
  res.json(db.prepare("SELECT * FROM journal_posts ORDER BY sort, COALESCE(published_at, created_at) DESC").all());
});
app.get("/api/admin/journal/:id", requireAuth, requireAdmin, (req, res) => {
  const p = db.prepare("SELECT * FROM journal_posts WHERE id=?").get(req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p);
});

const journalSchema = z.object({
  slug:        z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, "lowercase letters, numbers and hyphens"),
  title:       z.string().min(1).max(200),
  italic:      z.string().max(120).optional().nullable(),
  excerpt:     z.string().max(400).optional().nullable(),
  body:        z.string().max(50000).optional().nullable(),
  tag:         z.string().max(60).optional().nullable(),
  meta_title:  z.string().max(200).optional().nullable(),
  meta_desc:   z.string().max(400).optional().nullable(),
  glyph:       z.string().max(4).optional().nullable(),
  sort:        z.number().int().optional(),
  published:   z.boolean().optional(),
});

app.post("/api/admin/journal", requireAuth, requireAdmin, (req, res) => {
  const parsed = journalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  if (db.prepare("SELECT id FROM journal_posts WHERE slug=?").get(parsed.data.slug))
    return res.status(409).json({ error: "Slug already exists" });
  const d = parsed.data;
  const publishedAt = d.published ? Math.floor(Date.now() / 1000) : null;
  const info = db.prepare(`
    INSERT INTO journal_posts (slug,title,italic,excerpt,body,tag,meta_title,meta_desc,glyph,sort,published_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    d.slug, d.title, d.italic || null, d.excerpt || null, d.body || null,
    d.tag || null, d.meta_title || null, d.meta_desc || null, d.glyph || null,
    d.sort ?? 0, publishedAt,
  );
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.patch("/api/admin/journal/:id", requireAuth, requireAdmin, (req, res) => {
  const cur = db.prepare("SELECT * FROM journal_posts WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "Not found" });
  // Track publish toggle
  let publishedAt = cur.published_at;
  if (req.body.published === true && !publishedAt) publishedAt = Math.floor(Date.now() / 1000);
  if (req.body.published === false) publishedAt = null;

  const merged = {
    slug:       req.body.slug       ?? cur.slug,
    title:      req.body.title      ?? cur.title,
    italic:     req.body.italic     !== undefined ? req.body.italic     : cur.italic,
    excerpt:    req.body.excerpt    !== undefined ? req.body.excerpt    : cur.excerpt,
    body:       req.body.body       !== undefined ? req.body.body       : cur.body,
    tag:        req.body.tag        !== undefined ? req.body.tag        : cur.tag,
    meta_title: req.body.meta_title !== undefined ? req.body.meta_title : cur.meta_title,
    meta_desc:  req.body.meta_desc  !== undefined ? req.body.meta_desc  : cur.meta_desc,
    glyph:      req.body.glyph      !== undefined ? req.body.glyph      : cur.glyph,
    sort:       req.body.sort       ?? cur.sort,
    published:  publishedAt != null,
  };
  const parsed = journalSchema.safeParse(merged);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  const d = parsed.data;
  db.prepare(`
    UPDATE journal_posts SET
      slug=?, title=?, italic=?, excerpt=?, body=?, tag=?, meta_title=?, meta_desc=?, glyph=?, sort=?, published_at=?
    WHERE id=?
  `).run(d.slug, d.title, d.italic||null, d.excerpt||null, d.body||null, d.tag||null,
         d.meta_title||null, d.meta_desc||null, d.glyph||null, d.sort||0, publishedAt, req.params.id);
  res.json({ ok: true });
});

app.delete("/api/admin/journal/:id", requireAuth, requireAdmin, async (req, res) => {
  const p = db.prepare("SELECT cover_image FROM journal_posts WHERE id=?").get(req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  await removeStored(p.cover_image);
  db.prepare("DELETE FROM journal_posts WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// Default Open Graph image upload (single global image).
fs.mkdirSync(path.join(UPLOAD_DIR, "seo"), { recursive: true });
const seoDisk = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_DIR, "seo")),
  filename:    (_req, file, cb) => cb(null, "og" + extFromMime(file.mimetype)),
});
const seoUpload = multer({
  storage: r2.r2Configured ? memStorage : seoDisk,
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp)$/.test(file.mimetype);
    cb(ok ? null : new Error("PNG / JPG / WEBP only"), ok);
  },
});
app.post("/api/admin/upload/seo", uploadLimit, requireAuth, requireAdmin, (req, res) => {
  seoUpload.single("image")(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No file" });
    try {
      const prev = JSON.parse(db.prepare("SELECT value FROM settings WHERE key='seo.og_image'").get()?.value || "null");
      const url = await finalizeUpload(req.file, "seo");
      await removeStored(prev);
      db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('seo.og_image', ?, strftime('%s','now'))
                  ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`).run(JSON.stringify(url));
      res.json({ ok: true, url });
    } catch (e) { console.error("seo upload failed:", e?.message || e); res.status(502).json({ error: "Upload failed" }); }
  });
});

// Journal cover image upload — re-uses multer with a 'journal' subfolder.
fs.mkdirSync(path.join(UPLOAD_DIR, "journal"), { recursive: true });
const journalDisk = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_DIR, "journal")),
  filename:    (_req, file, cb) => cb(null, crypto.randomBytes(10).toString("hex") + extFromMime(file.mimetype)),
});
const journalUpload = multer({
  storage: r2.r2Configured ? memStorage : journalDisk,
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|avif|gif)$/.test(file.mimetype);
    cb(ok ? null : new Error("Only PNG / JPG / WEBP / AVIF / GIF allowed"), ok);
  },
});
app.post("/api/admin/upload/journal/:id", uploadLimit, requireAuth, requireAdmin, (req, res, next) => {
  journalUpload.single("image")(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No file" });
    const post = db.prepare("SELECT cover_image FROM journal_posts WHERE id=?").get(req.params.id);
    if (!post) return res.status(404).json({ error: "Post not found" });
    try {
      const url = await finalizeUpload(req.file, "journal");
      await removeStored(post.cover_image);
      db.prepare("UPDATE journal_posts SET cover_image=? WHERE id=?").run(url, req.params.id);
      res.json({ ok: true, url });
    } catch (e) { console.error("journal upload failed:", e?.message || e); res.status(502).json({ error: "Upload failed" }); }
  });
});
app.delete("/api/admin/upload/journal/:id", requireAuth, requireAdmin, (req, res) => {
  const post = db.prepare("SELECT cover_image FROM journal_posts WHERE id=?").get(req.params.id);
  if (!post) return res.status(404).json({ error: "Not found" });
  if (post.cover_image) {
    const f = path.join(UPLOAD_DIR, post.cover_image.replace(/^\/uploads\//, ""));
    try { fs.existsSync(f) && fs.unlinkSync(f); } catch {}
  }
  db.prepare("UPDATE journal_posts SET cover_image=NULL WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── admin: faqs ─────────────────────────────────────────────
app.get("/api/admin/faqs", requireAuth, requireAdmin, (_req, res) => {
  res.json(db.prepare("SELECT * FROM faqs ORDER BY sort, id").all());
});
app.post("/api/admin/faqs", requireAuth, requireAdmin, (req, res) => {
  const q = String(req.body?.question || "").trim();
  const a = String(req.body?.answer || "").trim();
  if (!q || !a) return res.status(400).json({ error: "Question and answer required" });
  const m = db.prepare("SELECT COALESCE(MAX(sort),-1) m FROM faqs").get().m;
  const info = db.prepare("INSERT INTO faqs (question, answer, sort) VALUES (?, ?, ?)").run(q, a, m + 1);
  res.json({ ok: true, id: info.lastInsertRowid });
});
app.patch("/api/admin/faqs/:id", requireAuth, requireAdmin, (req, res) => {
  const cur = db.prepare("SELECT * FROM faqs WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE faqs SET question=?, answer=?, sort=?, active=? WHERE id=?").run(
    req.body.question ?? cur.question, req.body.answer ?? cur.answer,
    req.body.sort ?? cur.sort,
    req.body.active != null ? (req.body.active ? 1 : 0) : cur.active,
    req.params.id,
  );
  res.json({ ok: true });
});
app.delete("/api/admin/faqs/:id", requireAuth, requireAdmin, (req, res) => {
  db.prepare("DELETE FROM faqs WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── admin: locations ────────────────────────────────────────
app.get("/api/admin/locations", requireAuth, requireAdmin, (_req, res) => {
  res.json(db.prepare("SELECT * FROM shop_locations ORDER BY sort, id").all());
});
app.post("/api/admin/locations", requireAuth, requireAdmin, (req, res) => {
  const { name, address, hours, phone } = req.body || {};
  if (!name) return res.status(400).json({ error: "Name required" });
  const m = db.prepare("SELECT COALESCE(MAX(sort),-1) m FROM shop_locations").get().m;
  const info = db.prepare("INSERT INTO shop_locations (name,address,hours,phone,sort) VALUES (?,?,?,?,?)").run(
    name, address || null, hours || null, phone || null, m + 1,
  );
  res.json({ ok: true, id: info.lastInsertRowid });
});
app.patch("/api/admin/locations/:id", requireAuth, requireAdmin, (req, res) => {
  const cur = db.prepare("SELECT * FROM shop_locations WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE shop_locations SET name=?, address=?, hours=?, phone=?, sort=?, active=? WHERE id=?").run(
    req.body.name ?? cur.name, req.body.address ?? cur.address,
    req.body.hours ?? cur.hours, req.body.phone ?? cur.phone,
    req.body.sort ?? cur.sort,
    req.body.active != null ? (req.body.active ? 1 : 0) : cur.active,
    req.params.id,
  );
  res.json({ ok: true });
});
app.delete("/api/admin/locations/:id", requireAuth, requireAdmin, (req, res) => {
  db.prepare("DELETE FROM shop_locations WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

/* ── static frontend + SEO ───────────────────────────── */
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const settingsAll = () => {
  const rows = db.prepare("SELECT key,value FROM settings").all();
  const out = {};
  for (const r of rows) { try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; } }
  return out;
};

const escapeHtml = (s) => String(s || "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const escapeAttr = escapeHtml;
const stripHtml  = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const truncate   = (s, n) => { s = String(s || ""); return s.length <= n ? s : s.slice(0, n - 1).trim() + "…"; };
const absoluteUrl = (req, rel) => `${req.protocol}://${req.get("host")}${rel.startsWith("/") ? rel : "/" + rel}`;

// Builds the <head> SEO block to inject in place of <!--VT-SEO--> in HTML templates.
function buildSeoHead(req, opts = {}) {
  const s = opts.settingsCache || settingsAll();
  const siteName    = s["site.name"]        || "VITRINE";
  const siteTagline = s["site.tagline"]     || "Beauty, Hand-Picked";
  const desc        = opts.description      || s["seo.description"] || "";
  const ogImageRel  = opts.image            || s["seo.og_image"]    || "";
  const ogImage     = ogImageRel ? (ogImageRel.startsWith("http") ? ogImageRel : absoluteUrl(req, ogImageRel)) : "";
  const twitter     = (s["seo.twitter"]     || "").replace(/^@/, "");
  const allowIndex  = s["seo.allow_indexing"] !== false;
  const canonical   = opts.canonical || absoluteUrl(req, req.originalUrl.split("?")[0].split("#")[0]);
  const title       = opts.title || `${siteName} — ${siteTagline}`;
  const ogType      = opts.ogType || "website";

  const lines = [];
  lines.push(`<title>${escapeHtml(title)}</title>`);
  if (desc)        lines.push(`<meta name="description" content="${escapeAttr(truncate(desc, 200))}" />`);
  lines.push(`<meta name="robots" content="${allowIndex ? "index, follow" : "noindex, nofollow"}" />`);
  lines.push(`<link rel="canonical" href="${escapeAttr(canonical)}" />`);
  // Favicon + manifest + theme colour (injected once per response)
  lines.push(`<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`);
  lines.push(`<link rel="apple-touch-icon" href="/favicon.svg" />`);
  lines.push(`<link rel="manifest" href="/manifest.json" />`);
  lines.push(`<meta name="theme-color" content="#5A1430" />`);
  // Open Graph
  lines.push(`<meta property="og:site_name" content="${escapeAttr(siteName)}" />`);
  lines.push(`<meta property="og:type" content="${escapeAttr(ogType)}" />`);
  lines.push(`<meta property="og:title" content="${escapeAttr(title)}" />`);
  if (desc)    lines.push(`<meta property="og:description" content="${escapeAttr(truncate(desc, 200))}" />`);
  lines.push(`<meta property="og:url" content="${escapeAttr(canonical)}" />`);
  if (ogImage) {
    lines.push(`<meta property="og:image" content="${escapeAttr(ogImage)}" />`);
    lines.push(`<meta property="og:image:width" content="1200" />`);
    lines.push(`<meta property="og:image:height" content="630" />`);
  }
  // Twitter
  lines.push(`<meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}" />`);
  if (twitter) lines.push(`<meta name="twitter:site" content="@${escapeAttr(twitter)}" />`);
  lines.push(`<meta name="twitter:title" content="${escapeAttr(title)}" />`);
  if (desc)    lines.push(`<meta name="twitter:description" content="${escapeAttr(truncate(desc, 200))}" />`);
  if (ogImage) lines.push(`<meta name="twitter:image" content="${escapeAttr(ogImage)}" />`);
  // JSON-LD blocks
  if (Array.isArray(opts.ldJson)) {
    for (const obj of opts.ldJson) {
      // Keep stringified JSON-LD safe inside a <script> tag.
      const json = JSON.stringify(obj).replace(/</g, "\\u003c");
      lines.push(`<script type="application/ld+json">${json}</script>`);
    }
  }
  return lines.join("\n");
}

// Read an HTML template once, cache; replace <!--VT-SEO--> with computed head block.
const htmlCache = new Map();
function renderHtml(req, res, fileName, opts) {
  let tmpl = htmlCache.get(fileName);
  if (!tmpl) {
    try { tmpl = fs.readFileSync(path.join(PUBLIC_DIR, fileName), "utf8"); htmlCache.set(fileName, tmpl); }
    catch (e) { return res.status(404).send("Not found"); }
  }
  const head = buildSeoHead(req, opts);
  let out;
  if (tmpl.includes("<!--VT-SEO-->")) {
    out = tmpl.replace("<!--VT-SEO-->", head);
  } else {
    // Strip the template's static <title> and <meta name="description"> so the
    // injected ones don't get duplicated/overridden by the static fallback.
    out = tmpl
      .replace(/<title>[\s\S]*?<\/title>/i, "")
      .replace(/<meta\s+name=["']description["'][^>]*>/gi, "")
      .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, "")
      .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, "")
      .replace("</head>", head + "\n</head>");
  }
  res.set("Content-Type", "text/html; charset=utf-8").send(out);
}

const orgJsonLd = (req) => {
  const s = settingsAll();
  const siteName = s["site.name"]    || "VITRINE";
  const phone    = s["site.phone"]   || "";
  const email    = s["site.email"]   || "";
  const addr1    = s["site.address_line1"] || "";
  const addr2    = s["site.address_line2"] || "";
  const ig       = s["site.instagram"];  const pi = s["site.pinterest"];
  const sameAs   = [ig, pi].filter(Boolean);
  const ogImg    = s["seo.og_image"] || "";
  // Optional local-SEO fields — populated only when the owner sets them in
  // settings (site.geo_lat/geo_lng, site.hours "Mo-Su 09:00-18:00", site.price_range).
  const lat = s["site.geo_lat"], lng = s["site.geo_lng"];
  const hours = s["site.hours"];
  return {
    "@context": "https://schema.org",
    "@type": "HealthAndBeautyBusiness",
    "@id": absoluteUrl(req, "/") + "#store",
    "name": siteName,
    "url": absoluteUrl(req, "/"),
    "description": s["seo.description"] || "",
    "image": ogImg ? absoluteUrl(req, ogImg) : undefined,
    "telephone": phone || undefined,
    "email": email || undefined,
    "priceRange": s["site.price_range"] || "$$",
    "areaServed": { "@type": "Country", "name": "Sri Lanka" },
    "currenciesAccepted": "LKR",
    "address": (addr1 || addr2) ? {
      "@type": "PostalAddress",
      "streetAddress": addr1,
      "addressLocality": addr2,
      "addressCountry": "LK",
    } : undefined,
    "geo": (lat && lng) ? { "@type": "GeoCoordinates", "latitude": lat, "longitude": lng } : undefined,
    "openingHours": hours || undefined,
    "sameAs": sameAs.length ? sameAs : undefined,
  };
};

// Homepage
app.get("/", (req, res) => {
  const s = settingsAll();
  renderHtml(req, res, "VITRINE - Beauty, Curated.html", {
    settingsCache: s,
    title: `${s["site.name"] || "VITRINE"} — ${s["site.tagline"] || "Beauty, Hand-Picked"}`,
    description: s["seo.description"],
    ogType: "website",
    ldJson: [orgJsonLd(req)],
  });
});

// Shop, optionally filtered
function shopMeta(req, opts) {
  const s = settingsAll();
  const siteName = s["site.name"] || "VITRINE";
  return renderHtml(req, res => res, "Shop.html", { ...opts, settingsCache: s, ogType: "website" });
}

app.get(["/Shop.html", "/shop"], (req, res) => {
  const s = settingsAll();
  const siteName = s["site.name"] || "VITRINE";
  renderHtml(req, res, "Shop.html", {
    settingsCache: s,
    title: `Shop — ${siteName}`,
    description: `Every piece in store at ${siteName}. ` + (s["seo.description"] || ""),
    ldJson: [orgJsonLd(req)],
  });
});

// Pretty URL: /product/:id
app.get("/product/:id", (req, res) => {
  const p = productById(req.params.id);
  if (!p || !p.isActive) {
    // Still serve the page (it will show its own 404 state) but with sensible meta.
    res.status(404);
    return renderHtml(req, res, "product.html", { title: "Product not found — VITRINE", description: "" });
  }
  const s = settingsAll();
  const siteName = s["site.name"] || "VITRINE";
  const brand = db.prepare("SELECT * FROM brands WHERE key=?").get(p.brand);
  const brandName = brand?.name || p.brandName || "";
  const price = p.sale || p.price;
  const img = p.image ? absoluteUrl(req, p.image) : (s["seo.og_image"] ? absoluteUrl(req, s["seo.og_image"]) : undefined);
  // Prefer admin/AI-authored SEO fields when present, else fall back to generated ones.
  const title = p.metaTitle || `${p.name}${p.italic ? " " + p.italic : ""} — ${brandName} — ${siteName}`;
  const desc  = p.metaDesc || stripHtml(p.copy) || `${p.name} ${p.italic || ""} from ${brandName} at ${siteName}.`;
  const product = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": `${p.name} ${p.italic || ""}`.trim(),
    "description": desc,
    "image": img ? [img] : undefined,
    "sku": p.id.toUpperCase(),
    "brand": brandName ? { "@type": "Brand", "name": brandName } : undefined,
    "category": p.category,
    "offers": {
      "@type": "Offer",
      "url": absoluteUrl(req, "/product/" + p.id),
      "priceCurrency": "LKR",
      "price": String(price),
      "availability": (p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"),
      "itemCondition": "https://schema.org/NewCondition",
    },
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", position: 1, name: "Home",    item: absoluteUrl(req, "/") },
      { "@type": "ListItem", position: 2, name: "Shop",    item: absoluteUrl(req, "/Shop.html") },
      { "@type": "ListItem", position: 3, name: p.category, item: absoluteUrl(req, "/category/" + p.category) },
      { "@type": "ListItem", position: 4, name: `${p.name} ${p.italic || ""}`.trim() },
    ],
  };
  renderHtml(req, res, "product.html", {
    settingsCache: s,
    title, description: desc, image: img && img.replace(absoluteUrl(req, "/"), "/"),
    ogType: "product",
    ldJson: [product, breadcrumb],
  });
});

// Pretty URL: /brand/:key
app.get("/brand/:key", (req, res) => {
  const b = db.prepare("SELECT * FROM brands WHERE key=?").get(req.params.key);
  const s = settingsAll();
  const siteName = s["site.name"] || "VITRINE";
  if (!b) {
    res.status(404);
    return renderHtml(req, res, "Shop.html", { settingsCache: s, title: `Brand not found — ${siteName}` });
  }
  const productCount = db.prepare("SELECT COUNT(*) c FROM products WHERE brand_key=? AND (is_active IS NULL OR is_active=1)").get(b.key).c;
  const title = `${b.name}${b.loc ? " — " + b.loc : ""} — ${siteName}`;
  const desc  = `${b.name}${b.tagline ? ", " + b.tagline.toLowerCase() : ""}. ${productCount} piece${productCount === 1 ? "" : "s"} in store at ${siteName}.`;
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", position: 1, name: "Home",   item: absoluteUrl(req, "/") },
      { "@type": "ListItem", position: 2, name: "Brands", item: absoluteUrl(req, "/#brands") },
      { "@type": "ListItem", position: 3, name: b.name },
    ],
  };
  renderHtml(req, res, "Shop.html", {
    settingsCache: s, title, description: desc, image: b.image,
    ldJson: [breadcrumb],
  });
});

// Pretty URL: /category/:key
app.get("/category/:key", (req, res) => {
  const c = db.prepare("SELECT * FROM categories WHERE key=?").get(req.params.key);
  const s = settingsAll();
  const siteName = s["site.name"] || "VITRINE";
  if (!c) {
    res.status(404);
    return renderHtml(req, res, "Shop.html", { settingsCache: s, title: `Category not found — ${siteName}` });
  }
  const n = db.prepare("SELECT COUNT(*) c FROM products WHERE category=? AND (is_active IS NULL OR is_active=1)").get(c.key).c;
  const title = `${c.label}${c.italic ? " " + c.italic : ""} — ${siteName}`;
  const desc  = `${c.label} at ${siteName} — ${n} piece${n === 1 ? "" : "s"} across our carried brands.`;
  renderHtml(req, res, "Shop.html", {
    settingsCache: s, title, description: desc,
    ldJson: [{
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl(req, "/") },
        { "@type": "ListItem", position: 2, name: "Shop", item: absoluteUrl(req, "/Shop.html") },
        { "@type": "ListItem", position: 3, name: c.label },
      ],
    }],
  });
});

// Shared renderer for a taxonomy landing page (/skin/:key, /concern/:key). These
// are high-intent SEO surfaces: crawlable meta + BreadcrumbList + an ItemList of
// the matching products. `joinTable`/`col` name the product↔taxonomy join.
function taxonomyLanding(req, res, { row, kind, label, joinTable, col, browseName, browseHref }) {
  const s = settingsAll();
  const siteName = s["site.name"] || "VITRINE";
  if (!row) return renderHtml(req, res, "Shop.html", { settingsCache: s, title: `Not found — ${siteName}` });
  const items = db.prepare(
    `SELECT p.id, p.name, p.italic FROM products p
       JOIN ${joinTable} j ON j.product_id = p.id
      WHERE j.${col} = ? AND (p.is_active IS NULL OR p.is_active = 1)
      ORDER BY p.is_bestseller DESC, p.created_at DESC LIMIT 40`
  ).all(row.key);
  const n = items.length;
  const title = `${label} — ${siteName}`;
  const desc  = `Shop ${label.toLowerCase()} at ${siteName} — ${n} piece${n === 1 ? "" : "s"} hand-picked across our carried brands, delivered across Sri Lanka.`;
  const itemList = {
    "@context": "https://schema.org", "@type": "ItemList", "name": label,
    "itemListElement": items.map((p, i) => ({
      "@type": "ListItem", position: i + 1,
      url: absoluteUrl(req, "/product/" + p.id),
      name: `${p.name} ${p.italic || ""}`.trim(),
    })),
  };
  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl(req, "/") },
      { "@type": "ListItem", position: 2, name: browseName, item: absoluteUrl(req, browseHref) },
      { "@type": "ListItem", position: 3, name: label },
    ],
  };
  renderHtml(req, res, "Shop.html", { settingsCache: s, title, description: desc, ldJson: [itemList, breadcrumb] });
}

// Pretty URL: /skin/:key  (Shop by skin type)
app.get("/skin/:key", (req, res) => {
  const row = db.prepare("SELECT * FROM skin_types WHERE key=?").get(req.params.key);
  if (!row) res.status(404);
  taxonomyLanding(req, res, {
    row, kind: "skin", label: row ? `${row.label} skin` : "",
    joinTable: "product_skin_types", col: "skin_type",
    browseName: "Shop", browseHref: "/Shop.html",
  });
});

// Pretty URL: /concern/:key  (Shop by concern)
app.get("/concern/:key", (req, res) => {
  const row = db.prepare("SELECT * FROM concerns WHERE key=?").get(req.params.key);
  if (!row) res.status(404);
  taxonomyLanding(req, res, {
    row, kind: "concern", label: row ? row.label : "",
    joinTable: "product_concerns", col: "concern",
    browseName: "Shop", browseHref: "/Shop.html",
  });
});

// Pretty URL: /brands (A–Z brand index)
app.get("/brands", (req, res) => {
  const s = settingsAll();
  const siteName = s["site.name"] || "VITRINE";
  const brands = db.prepare(`
    SELECT b.key, b.name FROM brands b
    WHERE EXISTS (SELECT 1 FROM products p WHERE p.brand_key = b.key AND (p.is_active IS NULL OR p.is_active = 1))
    ORDER BY b.name COLLATE NOCASE`).all();
  const itemList = {
    "@context": "https://schema.org", "@type": "ItemList",
    name: `Brands at ${siteName}`, numberOfItems: brands.length,
    itemListElement: brands.map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b.name, url: absoluteUrl(req, "/brand/" + b.key) })),
  };
  renderHtml(req, res, "brands.html", {
    settingsCache: s,
    title: `All brands — ${siteName}`,
    description: `Every brand at ${siteName} — authentic skincare, K-beauty and makeup, delivered across Sri Lanka.`,
    ldJson: [itemList, orgJsonLd(req)],
  });
});

// Pretty URL: /journal and /journal/:slug
app.get("/journal", (req, res) => {
  const s = settingsAll();
  const siteName = s["site.name"] || "VITRINE";
  renderHtml(req, res, "journal.html", {
    settingsCache: s,
    title: `Stories — ${siteName}`,
    description: `Field notes, brand stories, and ingredient deep-dives from ${siteName}.`,
    ldJson: [orgJsonLd(req)],
  });
});
app.get("/journal/:slug", (req, res) => {
  const post = db.prepare("SELECT * FROM journal_posts WHERE slug=? AND published_at IS NOT NULL").get(req.params.slug);
  if (!post) return renderHtml(req, res, "journal-post.html", { title: "Story not found — VITRINE" });
  const s = settingsAll();
  const siteName = s["site.name"] || "VITRINE";
  const title = post.meta_title || `${post.title}${post.italic ? " " + post.italic : ""} — ${siteName}`;
  const desc  = post.meta_desc  || post.excerpt || "";
  const img   = post.cover_image ? absoluteUrl(req, post.cover_image) : undefined;
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": `${post.title} ${post.italic || ""}`.trim(),
    "description": desc,
    "image": img ? [img] : undefined,
    "datePublished": new Date((post.published_at || post.created_at) * 1000).toISOString(),
    "publisher": { "@type": "Organization", "name": siteName },
  };
  renderHtml(req, res, "journal-post.html", {
    settingsCache: s, title, description: desc, image: post.cover_image, ogType: "article",
    ldJson: [article],
  });
});

// Inject site-wide meta on the rest of the simple public pages.
const simplePageMeta = {
  "contact.html":     { titleSuffix: "Contact & Help",     desc: "Visit, call, or message the shop." },
  "cart.html":        { titleSuffix: "Your Bag",           desc: "Review your bag before checkout.", noindex: true },
  "checkout.html":    { titleSuffix: "Checkout",           desc: "Place your order — Sri Lanka delivery.", noindex: true },
  "login.html":       { titleSuffix: "Sign In",            desc: "Sign in to your account.", noindex: true },
  "signup.html":      { titleSuffix: "Create Account",     desc: "Create a customer account.", noindex: true },
  "account.html":     { titleSuffix: "Your Account",       desc: "Manage your orders and details.", noindex: true },
  "wishlist.html":    { titleSuffix: "Wishlist",           desc: "Pieces you've saved for later.", noindex: true },
  "track.html":       { titleSuffix: "Track Order",        desc: "Check the status of your order." },
  "order-confirmation.html": { titleSuffix: "Order Confirmed", desc: "Thank you — your order has been received.", noindex: true },
};

// Catch every simple page request before express.static serves the raw file.
app.get(/^\/(contact|cart|checkout|login|signup|account|wishlist|track|order-confirmation)\.html$/i, (req, res, next) => {
  const file = req.path.slice(1);
  const meta = simplePageMeta[file.toLowerCase()];
  if (!meta) return next();
  const s = settingsAll();
  const siteName = s["site.name"] || "VITRINE";
  renderHtml(req, res, file, {
    settingsCache: s,
    title: `${meta.titleSuffix} — ${siteName}`,
    description: meta.desc,
    ldJson: [orgJsonLd(req)],
    // For private pages override the site-wide indexable flag with noindex.
    ...(meta.noindex ? {} : {}),
  });
});

// robots.txt — driven by seo.allow_indexing setting
app.get("/robots.txt", (req, res) => {
  const s = settingsAll();
  const allow = s["seo.allow_indexing"] !== false;
  const lines = [];
  lines.push(`User-agent: *`);
  if (allow) {
    lines.push(`Allow: /`);
    lines.push(`Disallow: /admin`);
    lines.push(`Disallow: /admin-`);
    lines.push(`Disallow: /api/`);
    lines.push(`Disallow: /cart.html`);
    lines.push(`Disallow: /checkout.html`);
    lines.push(`Disallow: /account.html`);
    lines.push(`Disallow: /login.html`);
    lines.push(`Disallow: /signup.html`);
    lines.push(`Disallow: /wishlist.html`);
    lines.push(`Disallow: /order-confirmation.html`);
    lines.push(``);
    lines.push(`Sitemap: ${absoluteUrl(req, "/sitemap.xml")}`);
  } else {
    lines.push(`Disallow: /`);
  }
  res.set("Content-Type", "text/plain; charset=utf-8").send(lines.join("\n"));
});

// sitemap.xml — auto-generated from products, brands, categories, journal posts
app.get("/sitemap.xml", (req, res) => {
  const s = settingsAll();
  if (s["seo.allow_indexing"] === false) {
    return res.set("Content-Type", "application/xml; charset=utf-8")
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`);
  }
  const now = new Date().toISOString().slice(0, 10);
  const urls = [];
  const url = (loc, lastmod, priority, image) => urls.push({ loc: absoluteUrl(req, loc), lastmod: lastmod || now, priority, image });
  url("/", now, "1.0");
  url("/Shop.html", now, "0.9");
  url("/brands", now, "0.7");
  url("/journal", now, "0.7");
  url("/contact.html", now, "0.5");

  const products = db.prepare("SELECT id, image, created_at FROM products WHERE (is_active IS NULL OR is_active = 1)").all();
  for (const p of products) url("/product/" + p.id, new Date((p.created_at || Date.now()/1000) * 1000).toISOString().slice(0,10), "0.8", p.image ? absoluteUrl(req, p.image) : null);
  const brands = db.prepare("SELECT key FROM brands").all();
  for (const b of brands) url("/brand/" + b.key, now, "0.7");
  const cats = db.prepare("SELECT key FROM categories").all();
  for (const c of cats) url("/category/" + c.key, now, "0.7");
  const skins = db.prepare("SELECT key FROM skin_types").all();
  for (const sk of skins) url("/skin/" + sk.key, now, "0.7");
  const concerns = db.prepare("SELECT key FROM concerns").all();
  for (const cn of concerns) url("/concern/" + cn.key, now, "0.7");
  const posts = db.prepare("SELECT slug, published_at FROM journal_posts WHERE published_at IS NOT NULL").all();
  for (const p of posts) url("/journal/" + p.slug, new Date(p.published_at * 1000).toISOString().slice(0,10), "0.6");

  const body = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`,
    ...urls.map(u => `  <url>\n    <loc>${escapeHtml(u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <priority>${u.priority}</priority>${u.image ? `\n    <image:image>\n      <image:loc>${escapeHtml(u.image)}</image:loc>\n    </image:image>` : ""}\n  </url>`),
    `</urlset>`,
  ].join("\n");
  res.set("Content-Type", "application/xml; charset=utf-8").send(body);
});

// Invalidate the HTML cache when admin saves settings (so SEO meta updates take effect)
app.use("/api/admin/settings", (req, _res, next) => { if (req.method === "PATCH") htmlCache.clear(); next(); });

// HTML responses that didn't go through one of our SEO routes still get favicons
// + manifest links injected so admin pages and other simple .html files look right.
app.use((req, res, next) => {
  if (!req.path.endsWith(".html")) return next();
  const file = path.join(PUBLIC_DIR, decodeURIComponent(req.path.replace(/^\//, "")));
  if (!fs.existsSync(file)) return next();
  let html;
  try { html = fs.readFileSync(file, "utf8"); } catch { return next(); }
  if (!/rel=["']icon["']/.test(html)) {
    const inject = `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />\n<link rel="apple-touch-icon" href="/favicon.svg" />\n<link rel="manifest" href="/manifest.json" />\n<meta name="theme-color" content="#5A1430" />`;
    html = html.replace("</head>", inject + "\n</head>");
  }
  res.set("Content-Type", "text/html; charset=utf-8").send(html);
});

app.use(express.static(PUBLIC_DIR, {
  extensions: ["html"], index: false,
  // Serve .jsx / .mjs with a real JS content-type so strict-MIME browsers execute
  // classic scripts (e.g. src/api.jsx). Babel-standalone fetches text/babel scripts
  // via XHR regardless, so this doesn't affect them.
  setHeaders: (res, p) => {
    if (p.endsWith(".jsx") || p.endsWith(".mjs")) {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    }
  },
}));

// Admin: pull the latest DB snapshot from R2 and restart to apply it (used after
// scripts/db-push.js to push local bulk edits live without a redeploy or race).
app.post("/api/admin/db/reload", requireAuth, requireAdmin, async (req, res) => {
  try {
    const n = await require("./dbbackup").stageReloadFromR2();
    res.json({ ok: true, products: n, restarting: true });
    console.log(`db: staged R2 reload (${n} products) — restarting to apply`);
    setTimeout(() => process.exit(0), 600); // let the response flush; Railway restarts us
  } catch (e) {
    res.status(502).json({ error: e?.message || "Reload failed" });
  }
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
  next();
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

// First-boot seed: if the products table is empty (a fresh/ephemeral DB — e.g. a
// Railway container with no persistent volume), load the demo catalogue so the
// site is never blank. Skipped the moment any product exists, so it never
// clobbers a populated/persisted DB. seed.js is idempotent (upserts).
try {
  const productCount = db.prepare("SELECT COUNT(*) c FROM products").get().c;
  if (productCount === 0) {
    console.log("No products found — seeding the demo catalogue…");
    require("./seed");
  }
} catch (e) {
  console.error("Auto-seed check failed:", e?.message || e);
}

app.listen(PORT, () => {
  console.log(`VITRINE running → http://localhost:${PORT}`);
  // Periodic + on-shutdown DB snapshots to the private R2 bucket (no-op unless
  // R2_DB_BUCKET is set). Restore-on-boot lives in server/boot.js.
  try { require("./dbbackup").startBackups(); } catch (e) { console.error("db backup init failed:", e?.message || e); }
});
