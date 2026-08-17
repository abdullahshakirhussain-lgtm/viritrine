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

// ── File uploads ────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, "data", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(path.join(UPLOAD_DIR, "products"), { recursive: true });
fs.mkdirSync(path.join(UPLOAD_DIR, "brands"),   { recursive: true });

// Derive the file extension from the *validated* content-type, never the
// client-supplied filename (which can be spoofed, e.g. shell.php.jpg).
const MIME_EXT = {
  "image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg",
  "image/webp": ".webp", "image/avif": ".avif", "image/gif": ".gif",
};
const extFromMime = (m) => MIME_EXT[m] || ".bin";

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const sub = req.params.kind === "brands" ? "brands" : "products";
    cb(null, path.join(UPLOAD_DIR, sub));
  },
  filename: (_req, file, cb) => {
    cb(null, crypto.randomBytes(10).toString("hex") + extFromMime(file.mimetype));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 }, // 6 MB
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|avif|gif)$/.test(file.mimetype);
    cb(ok ? null : new Error("Only PNG / JPG / WEBP / AVIF / GIF allowed"), ok);
  },
});

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
    return db.prepare("SELECT id,email,first_name,last_name,phone,is_admin FROM users WHERE id=?").get(payload.uid) || null;
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
    stock: row.stock,
    image: row.image || null,
    concerns,
    notes,
  };
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
  const rows = db.prepare("SELECT * FROM brands ORDER BY sort").all();
  res.json(rows.map(r => ({
    key: r.key, name: r.name, font: r.font, case: r.case_, accent: r.accent,
    tagline: r.tagline, loc: r.loc, cat: r.cat, image: r.image || null,
  })));
});

app.get("/api/categories", (_req, res) => {
  res.json(db.prepare("SELECT * FROM categories ORDER BY sort").all());
});

app.get("/api/concerns", (_req, res) => {
  res.json(db.prepare("SELECT * FROM concerns ORDER BY sort").all());
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
app.get("/api/hero-slides", (_req, res) => {
  const rows = db.prepare(`
    SELECT h.id, h.custom_tag, h.sort, p.*
    FROM hero_slides h JOIN products p ON p.id = h.product_id
    WHERE h.active = 1 AND (p.is_active IS NULL OR p.is_active = 1)
    ORDER BY h.sort, h.id
  `).all();
  res.json(rows.map(r => ({ ...hydrateProduct(r), customTag: r.custom_tag })));
});

// Editorial picks — for the homepage's "Shop the Shelf" rail.
// If no products are flagged editor's pick, fall back to the latest products so
// admin-added items show up immediately without needing the flag.
app.get("/api/editorial", (_req, res) => {
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
  res.json(rows.map(p => ({
    ...hydrateProduct(p),
    editorTag: p.editor_tag || (p.is_new ? "New" : p.is_bestseller ? "Bestseller" : "Pick"),
  })));
});

// Latest active products — for the homepage "New Arrivals" rail.
app.get("/api/products/new-arrivals", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "8", 10), 50);
  const rows = db.prepare(`
    SELECT * FROM products
    WHERE (is_active IS NULL OR is_active = 1)
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(limit);
  res.json(rows.map(hydrateProduct));
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
  const { category, brand, concern, sale, isNew, ceylon, sort, q, limit, offset } = req.query;
  let sql = "SELECT DISTINCT p.* FROM products p";
  const where = ["(p.is_active IS NULL OR p.is_active = 1)"]; const params = [];
  if (concern) {
    sql += " JOIN product_concerns pc ON pc.product_id = p.id";
    where.push("pc.concern = ?"); params.push(concern);
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
  res.json(rows.map(hydrateProduct));
});

app.get("/api/products/:id", (req, res) => {
  const p = productById(req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  const related = db.prepare(
    "SELECT * FROM products WHERE category=? AND id<>? ORDER BY is_bestseller DESC LIMIT 6"
  ).all(p.category, p.id).map(hydrateProduct);
  res.json({ product: p, related });
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
  res.json(rows.map(hydrateProduct));
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
  const user = db.prepare("SELECT id,email,first_name,last_name,phone,is_admin FROM users WHERE id=?").get(info.lastInsertRowid);
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

  const user = db.prepare("SELECT id,email,first_name,last_name,phone,is_admin FROM users WHERE id=?").get(info.lastInsertRowid);
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
  const safe = { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, phone: user.phone, is_admin: user.is_admin };
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
  const fresh = db.prepare("SELECT id,email,first_name,last_name,phone,is_admin FROM users WHERE id=?").get(u.id);
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
  const subtotal = lines.reduce((s, l) => s + lineUnit(l) * l.qty, 0);
  const shipping = computeShipping(subtotal, data.delivery, data.payment);
  const total = subtotal + shipping;
  const number = makeOrderNumber();

  const tx = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO orders
        (number,user_id,email,status,subtotal,shipping,total,delivery,payment,full_name,phone,line1,line2,city,postcode,country,note,samples,gift_wrap)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      number, u?.id || null, data.email.toLowerCase(),
      data.payment === "card" ? "awaiting_payment" : "pending",
      subtotal, shipping, total, data.delivery, data.payment,
      data.full_name, data.phone, data.line1, data.line2 || null, data.city,
      data.postcode || null, data.country || "LK", data.note || null,
      (data.samples && data.samples.length) ? JSON.stringify(data.samples) : null,
      data.gift_wrap ? 1 : 0,
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
  concerns:     z.array(z.string()).optional(),
  notes:        z.array(z.string()).optional(),
});

const writeConcernsNotes = (id, concerns = [], notes = []) => {
  db.prepare("DELETE FROM product_concerns WHERE product_id=?").run(id);
  const insC = db.prepare("INSERT INTO product_concerns (product_id,concern) VALUES (?,?)");
  concerns.forEach(c => insC.run(id, c));
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
        (id,brand_key,name,italic,category,sub,size,variant,liquid,liquid_top,copy,price,sale_price,off_pct,is_new,is_bestseller,is_active,stock,editor_pick_sort,editor_tag)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      d.id, d.brand_key, d.name, d.italic || null, d.category, d.sub || null, d.size || null,
      d.variant || null, d.liquid || null, d.liquid_top || null, d.copy || null,
      d.price, d.sale_price || null, d.off_pct || null,
      d.is_new ? 1 : 0, d.is_bestseller ? 1 : 0, d.is_active === false ? 0 : 1, d.stock || 0,
      d.editor_pick_sort ?? null, d.editor_tag || null,
    );
    writeConcernsNotes(d.id, d.concerns, d.notes);
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
    concerns:         req.body.concerns         ?? curConcerns,
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
        editor_pick_sort=?, editor_tag=?
      WHERE id=?
    `).run(
      d.brand_key, d.name, d.italic || null, d.category, d.sub || null, d.size || null,
      d.variant || null, d.liquid || null, d.liquid_top || null, d.copy || null,
      d.price, d.sale_price || null, d.off_pct || null,
      d.is_new ? 1 : 0, d.is_bestseller ? 1 : 0, d.is_active === false ? 0 : 1, d.stock || 0,
      d.editor_pick_sort ?? null, d.editor_tag || null,
      id,
    );
    writeConcernsNotes(id, d.concerns, d.notes);
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
    if (p.image) {
      const f = path.join(UPLOAD_DIR, p.image.replace(/^\/uploads\//, ""));
      try { fs.existsSync(f) && fs.unlinkSync(f); } catch {}
    }
    db.prepare("DELETE FROM products WHERE id=?").run(id);
  })();

  res.json({ ok: true });
});

// Image upload for products + brands. URL param :kind = 'products' | 'brands'
app.post("/api/admin/upload/:kind/:id", uploadLimit, requireAuth, requireAdmin, (req, res, next) => {
  if (!["products", "brands"].includes(req.params.kind)) return res.status(400).json({ error: "Invalid kind" });
  upload.single("image")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No file" });
    const url = `/uploads/${req.params.kind}/${req.file.filename}`;
    if (req.params.kind === "products") {
      const prod = db.prepare("SELECT image FROM products WHERE id=?").get(req.params.id);
      if (!prod) { try { fs.unlinkSync(req.file.path); } catch {} return res.status(404).json({ error: "Product not found" }); }
      if (prod.image) {
        const old = path.join(UPLOAD_DIR, prod.image.replace(/^\/uploads\//, ""));
        try { fs.existsSync(old) && fs.unlinkSync(old); } catch {}
      }
      db.prepare("UPDATE products SET image=? WHERE id=?").run(url, req.params.id);
    } else {
      const b = db.prepare("SELECT image FROM brands WHERE key=?").get(req.params.id);
      if (!b) { try { fs.unlinkSync(req.file.path); } catch {} return res.status(404).json({ error: "Brand not found" }); }
      if (b.image) {
        const old = path.join(UPLOAD_DIR, b.image.replace(/^\/uploads\//, ""));
        try { fs.existsSync(old) && fs.unlinkSync(old); } catch {}
      }
      db.prepare("UPDATE brands SET image=? WHERE key=?").run(url, req.params.id);
    }
    res.json({ ok: true, url });
  });
});

app.delete("/api/admin/upload/:kind/:id", requireAuth, requireAdmin, (req, res) => {
  if (!["products", "brands"].includes(req.params.kind)) return res.status(400).json({ error: "Invalid kind" });
  const table = req.params.kind === "products" ? "products" : "brands";
  const idCol = table === "brands" ? "key" : "id";
  const row = db.prepare(`SELECT image FROM ${table} WHERE ${idCol}=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  if (row.image) {
    const f = path.join(UPLOAD_DIR, row.image.replace(/^\/uploads\//, ""));
    try { fs.existsSync(f) && fs.unlinkSync(f); } catch {}
  }
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
  if (!pid) return res.status(400).json({ error: "product_id required" });
  if (!db.prepare("SELECT id FROM products WHERE id=?").get(pid)) return res.status(404).json({ error: "Product not found" });
  const m = db.prepare("SELECT COALESCE(MAX(sort),-1) m FROM hero_slides").get().m;
  const info = db.prepare("INSERT INTO hero_slides (product_id, custom_tag, sort) VALUES (?, ?, ?)").run(
    pid, req.body.custom_tag || null, m + 1,
  );
  res.json({ ok: true, id: info.lastInsertRowid });
});
app.patch("/api/admin/hero-slides/:id", requireAuth, requireAdmin, (req, res) => {
  const cur = db.prepare("SELECT * FROM hero_slides WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE hero_slides SET product_id=?, custom_tag=?, sort=?, active=? WHERE id=?").run(
    req.body.product_id ?? cur.product_id,
    req.body.custom_tag !== undefined ? req.body.custom_tag : cur.custom_tag,
    req.body.sort ?? cur.sort,
    req.body.active != null ? (req.body.active ? 1 : 0) : cur.active,
    req.params.id,
  );
  res.json({ ok: true });
});
app.delete("/api/admin/hero-slides/:id", requireAuth, requireAdmin, (req, res) => {
  db.prepare("DELETE FROM hero_slides WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

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

app.delete("/api/admin/journal/:id", requireAuth, requireAdmin, (req, res) => {
  const p = db.prepare("SELECT cover_image FROM journal_posts WHERE id=?").get(req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  if (p.cover_image) {
    const f = path.join(UPLOAD_DIR, p.cover_image.replace(/^\/uploads\//, ""));
    try { fs.existsSync(f) && fs.unlinkSync(f); } catch {}
  }
  db.prepare("DELETE FROM journal_posts WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// Default Open Graph image upload (single global image).
fs.mkdirSync(path.join(UPLOAD_DIR, "seo"), { recursive: true });
const seoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_DIR, "seo")),
    filename:    (_req, file, cb) => cb(null, "og" + extFromMime(file.mimetype)),
  }),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp)$/.test(file.mimetype);
    cb(ok ? null : new Error("PNG / JPG / WEBP only"), ok);
  },
});
app.post("/api/admin/upload/seo", uploadLimit, requireAuth, requireAdmin, (req, res) => {
  seoUpload.single("image")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No file" });
    const url = "/uploads/seo/" + req.file.filename;
    db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('seo.og_image', ?, strftime('%s','now'))
                ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`).run(JSON.stringify(url));
    res.json({ ok: true, url });
  });
});

// Journal cover image upload — re-uses multer with a 'journal' subfolder.
fs.mkdirSync(path.join(UPLOAD_DIR, "journal"), { recursive: true });
const journalUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_DIR, "journal")),
    filename:    (_req, file, cb) => cb(null, crypto.randomBytes(10).toString("hex") + extFromMime(file.mimetype)),
  }),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|avif|gif)$/.test(file.mimetype);
    cb(ok ? null : new Error("Only PNG / JPG / WEBP / AVIF / GIF allowed"), ok);
  },
});
app.post("/api/admin/upload/journal/:id", uploadLimit, requireAuth, requireAdmin, (req, res, next) => {
  journalUpload.single("image")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No file" });
    const post = db.prepare("SELECT cover_image FROM journal_posts WHERE id=?").get(req.params.id);
    if (!post) { try { fs.unlinkSync(req.file.path); } catch {} return res.status(404).json({ error: "Post not found" }); }
    if (post.cover_image) {
      const old = path.join(UPLOAD_DIR, post.cover_image.replace(/^\/uploads\//, ""));
      try { fs.existsSync(old) && fs.unlinkSync(old); } catch {}
    }
    const url = `/uploads/journal/${req.file.filename}`;
    db.prepare("UPDATE journal_posts SET cover_image=? WHERE id=?").run(url, req.params.id);
    res.json({ ok: true, url });
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
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    "name": siteName,
    "url": absoluteUrl(req, "/"),
    "description": s["seo.description"] || "",
    "image": ogImg ? absoluteUrl(req, ogImg) : undefined,
    "telephone": phone || undefined,
    "email": email || undefined,
    "address": (addr1 || addr2) ? {
      "@type": "PostalAddress",
      "streetAddress": addr1,
      "addressLocality": addr2,
      "addressCountry": "LK",
    } : undefined,
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
    return renderHtml(req, res, "product.html", { title: "Product not found — VITRINE", description: "" });
  }
  const s = settingsAll();
  const siteName = s["site.name"] || "VITRINE";
  const brand = db.prepare("SELECT * FROM brands WHERE key=?").get(p.brand);
  const brandName = brand?.name || p.brandName || "";
  const price = p.sale || p.price;
  const img = p.image ? absoluteUrl(req, p.image) : (s["seo.og_image"] ? absoluteUrl(req, s["seo.og_image"]) : undefined);
  const title = `${p.name}${p.italic ? " " + p.italic : ""} — ${brandName} — ${siteName}`;
  const desc  = stripHtml(p.copy) || `${p.name} ${p.italic || ""} from ${brandName} at ${siteName}.`;
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
  const url = (loc, lastmod, priority) => urls.push({ loc: absoluteUrl(req, loc), lastmod: lastmod || now, priority });
  url("/", now, "1.0");
  url("/Shop.html", now, "0.9");
  url("/journal", now, "0.7");
  url("/contact.html", now, "0.5");

  const products = db.prepare("SELECT id, created_at FROM products WHERE (is_active IS NULL OR is_active = 1)").all();
  for (const p of products) url("/product/" + p.id, new Date((p.created_at || Date.now()/1000) * 1000).toISOString().slice(0,10), "0.8");
  const brands = db.prepare("SELECT key FROM brands").all();
  for (const b of brands) url("/brand/" + b.key, now, "0.7");
  const cats = db.prepare("SELECT key FROM categories").all();
  for (const c of cats) url("/category/" + c.key, now, "0.7");
  const posts = db.prepare("SELECT slug, published_at FROM journal_posts WHERE published_at IS NOT NULL").all();
  for (const p of posts) url("/journal/" + p.slug, new Date(p.published_at * 1000).toISOString().slice(0,10), "0.6");

  const body = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls.map(u => `  <url>\n    <loc>${escapeHtml(u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <priority>${u.priority}</priority>\n  </url>`),
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

app.use(express.static(PUBLIC_DIR, { extensions: ["html"], index: false }));

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
  next();
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

app.listen(PORT, () => {
  console.log(`VITRINE running → http://localhost:${PORT}`);
});
