const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const raw = new DatabaseSync(path.join(DATA_DIR, "vitrine.db"));
raw.exec("PRAGMA journal_mode = WAL");
raw.exec("PRAGMA foreign_keys = ON");

// Tiny better-sqlite3-compatible adapter so the rest of the code reads naturally:
//   db.prepare(sql).run(arg1, arg2, ...)  – positional
//   db.prepare(sql).run({ a: 1, b: 2 })   – named (@a, @b, :a, $a all work)
//   .all() / .get() likewise
//   db.transaction(fn) returns a function that runs fn inside BEGIN/COMMIT
const db = {
  exec(sql) { raw.exec(sql); },
  prepare(sql) {
    const stmt = raw.prepare(sql);
    const expand = (args) => {
      if (args.length === 1 && args[0] && typeof args[0] === "object" && !Array.isArray(args[0])) {
        // Translate undefined → null so node:sqlite doesn't throw on optional fields.
        const obj = {};
        for (const [k, v] of Object.entries(args[0])) obj[k] = v === undefined ? null : v;
        return [obj];
      }
      return args.map(a => a === undefined ? null : a);
    };
    return {
      run: (...args)  => stmt.run(...expand(args)),
      get: (...args)  => stmt.get(...expand(args)),
      all: (...args)  => stmt.all(...expand(args)),
    };
  },
  transaction(fn) {
    return (...args) => {
      raw.exec("BEGIN");
      try {
        const out = fn(...args);
        raw.exec("COMMIT");
        return out;
      } catch (e) {
        try { raw.exec("ROLLBACK"); } catch (_) {}
        throw e;
      }
    };
  },
  _raw: raw,
};

db.exec(`
CREATE TABLE IF NOT EXISTS brands (
  key      TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  font     TEXT,
  case_    TEXT,
  accent   TEXT,
  tagline  TEXT,
  loc      TEXT,
  cat      TEXT,
  image    TEXT,
  sort     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
  key      TEXT PRIMARY KEY,
  label    TEXT NOT NULL,
  italic   TEXT,
  sort     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS concerns (
  key      TEXT PRIMARY KEY,
  label    TEXT NOT NULL,
  sort     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id            TEXT PRIMARY KEY,
  brand_key     TEXT NOT NULL REFERENCES brands(key),
  name          TEXT NOT NULL,
  italic        TEXT,
  category      TEXT NOT NULL,
  sub           TEXT,
  size          TEXT,
  variant       TEXT,
  liquid        TEXT,
  liquid_top    TEXT,
  copy          TEXT,
  price         INTEGER NOT NULL,
  sale_price    INTEGER,
  off_pct       INTEGER,
  is_new        INTEGER DEFAULT 0,
  is_bestseller INTEGER DEFAULT 0,
  is_active     INTEGER DEFAULT 1,
  stock         INTEGER DEFAULT 25,
  image         TEXT,
  created_at    INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS product_concerns (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  concern    TEXT NOT NULL,
  PRIMARY KEY (product_id, concern)
);

CREATE TABLE IF NOT EXISTS product_notes (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  note       TEXT NOT NULL,
  sort       INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name    TEXT,
  last_name     TEXT,
  phone         TEXT,
  is_admin      INTEGER DEFAULT 0,
  created_at    INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS addresses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label      TEXT,
  full_name  TEXT,
  line1      TEXT,
  line2      TEXT,
  city       TEXT,
  postcode   TEXT,
  country    TEXT DEFAULT 'LK',
  phone      TEXT,
  is_default INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS carts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token      TEXT UNIQUE NOT NULL,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS cart_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  cart_id    INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id TEXT    NOT NULL REFERENCES products(id),
  qty        INTEGER NOT NULL DEFAULT 1,
  size       TEXT,
  UNIQUE (cart_id, product_id, size)
);

CREATE TABLE IF NOT EXISTS wishlists (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT    NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  number        TEXT UNIQUE NOT NULL,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  subtotal      INTEGER NOT NULL,
  shipping      INTEGER NOT NULL DEFAULT 0,
  total         INTEGER NOT NULL,
  delivery      TEXT NOT NULL,
  payment       TEXT NOT NULL,
  full_name     TEXT,
  phone         TEXT,
  line1         TEXT,
  line2         TEXT,
  city          TEXT,
  postcode      TEXT,
  country       TEXT DEFAULT 'LK',
  note          TEXT,
  samples       TEXT,
  gift_wrap     INTEGER DEFAULT 0,
  created_at    INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   TEXT    NOT NULL REFERENCES products(id),
  brand_key    TEXT,
  name         TEXT,
  italic       TEXT,
  size         TEXT,
  qty          INTEGER NOT NULL,
  unit_price   INTEGER NOT NULL,
  line_total   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS newsletter (
  email      TEXT PRIMARY KEY,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

-- Phone-OTP sign-up. One active row per phone (older rows are replaced on resend).
-- code_hash = SHA-256 of the 6-digit code (never store it in plaintext).
CREATE TABLE IF NOT EXISTS otp_codes (
  phone        TEXT PRIMARY KEY,
  code_hash    TEXT NOT NULL,
  expires_at   INTEGER NOT NULL,             -- unix seconds; 10 min after issue
  attempts     INTEGER NOT NULL DEFAULT 0,   -- wrong guesses; lock at 5
  last_sent_at INTEGER NOT NULL DEFAULT 0,   -- for the 60s resend rate-limit
  verified_at  INTEGER,                      -- set once the code is confirmed
  created_at   INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  subject    TEXT,
  message    TEXT NOT NULL,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,                                -- JSON-encoded
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  text       TEXT NOT NULL,
  sort       INTEGER DEFAULT 0,
  active     INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS hero_slides (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  TEXT REFERENCES products(id) ON DELETE CASCADE,
  custom_tag  TEXT,
  sort        INTEGER DEFAULT 0,
  active      INTEGER DEFAULT 1,
  created_at  INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS journal_posts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT UNIQUE NOT NULL,
  title         TEXT NOT NULL,
  italic        TEXT,
  excerpt       TEXT,
  body          TEXT,                            -- Markdown
  cover_image   TEXT,
  tag           TEXT,
  meta_title    TEXT,
  meta_desc     TEXT,
  glyph         TEXT,
  sort          INTEGER DEFAULT 0,
  published_at  INTEGER,
  created_at    INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS faqs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  sort       INTEGER DEFAULT 0,
  active     INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS shop_locations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  address    TEXT,
  hours      TEXT,
  phone      TEXT,
  sort       INTEGER DEFAULT 0,
  active     INTEGER DEFAULT 1
);

-- ── Owned analytics (first-party) ──────────────────────────────────────────
-- One row per visitor session (sh_sid-equivalent cookie). Phone is stored ONLY
-- as a hash (for repeat-buyer matching) + last 4 (for eyeball recognition) —
-- never the full number, which lives in orders alone. Attached at checkout.
CREATE TABLE IF NOT EXISTS analytics_sessions (
  id          TEXT PRIMARY KEY,             -- the sh_sid cookie value
  phone_hash  TEXT,                         -- SHA-256 of normalized phone (nullable)
  phone_last4 TEXT,                         -- last 4 digits, for recognition
  first_seen  INTEGER DEFAULT (strftime('%s','now')),
  last_seen   INTEGER DEFAULT (strftime('%s','now'))
);

-- Append-only event log. Common columns per the brief; meta is free-form JSON.
-- "The Key" premium-membership invites. Owner generates a code (optionally bound
-- to an eligible customer's email); the customer redeems it to become premium.
CREATE TABLE IF NOT EXISTS membership_invites (
  code        TEXT PRIMARY KEY,
  email       TEXT,                          -- optional: binds the invite to one customer
  note        TEXT,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expires_at  INTEGER,                        -- unix seconds; NULL = no expiry
  redeemed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  redeemed_at INTEGER,
  created_at  INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  type       TEXT NOT NULL,                 -- product_view | search | add_to_cart | begin_checkout | whatsapp_click | purchase
  product_id TEXT,
  value      INTEGER,                       -- e.g. order total, in LKR
  meta       TEXT,                          -- JSON-encoded extras (query, model, etc.)
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_products_brand    ON products(brand_key);
CREATE INDEX IF NOT EXISTS idx_products_cat      ON products(category);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart   ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_orders_user       ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_email      ON orders(email);
CREATE INDEX IF NOT EXISTS idx_journal_published ON journal_posts(published_at);
CREATE INDEX IF NOT EXISTS idx_events_session    ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_type       ON analytics_events(type);
CREATE INDEX IF NOT EXISTS idx_events_created    ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_product    ON analytics_events(product_id);
`);

// ── Safe column migrations for upgrading existing databases ────────────────
function ensureColumn(table, col, ddl) {
  const cols = raw.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === col)) {
    raw.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn("products", "image",            "image TEXT");
ensureColumn("products", "is_active",        "is_active INTEGER DEFAULT 1");
ensureColumn("products", "editor_pick_sort", "editor_pick_sort INTEGER");
ensureColumn("products", "editor_tag",       "editor_tag TEXT");
ensureColumn("products", "meta_title",        "meta_title TEXT");   // AI-drafted SEO <title>
ensureColumn("products", "meta_desc",         "meta_desc TEXT");    // AI-drafted SEO description
// The Key (premium) product gating:
ensureColumn("products", "members_only",       "members_only INTEGER DEFAULT 0");  // 1 = premium members only, always
ensureColumn("products", "early_access_until", "early_access_until INTEGER");       // epoch s; premium-only until then, public after
ensureColumn("brands",   "image",            "image TEXT");
ensureColumn("users",    "tier",             "tier TEXT DEFAULT 'standard'"); // standard | premium
ensureColumn("users",    "tier_since",        "tier_since INTEGER");
ensureColumn("orders",   "discount",          "discount INTEGER DEFAULT 0");  // premium (The Key) discount
// Editorial hero slides — a slide can be product-based (product_id set) OR a
// free-form editorial slide (product_id NULL, these custom_* fields drive it).
ensureColumn("hero_slides", "custom_title", "custom_title TEXT");  // headline (overrides product name)
ensureColumn("hero_slides", "custom_dek",   "custom_dek TEXT");    // supporting line (overrides product copy)
ensureColumn("hero_slides", "custom_cta",   "custom_cta TEXT");    // button label (default "Shop")
ensureColumn("hero_slides", "custom_href",  "custom_href TEXT");   // where the CTA points (default #shelf)

// ── Phone-OTP sign-up: make users.email optional ───────────────────────────
// Phone-first accounts have no email, but the original schema declared
// `email TEXT UNIQUE NOT NULL`. SQLite can't drop a NOT NULL in place, so we
// rebuild the table once (idempotent — only runs while the column is still
// NOT NULL). Row ids are preserved, so every FK that references users(id)
// stays valid. UNIQUE on email is kept (NULLs are exempt from UNIQUE in SQLite,
// so multiple phone-only users are fine).
function makeUserEmailNullable() {
  const cols = raw.prepare("PRAGMA table_info(users)").all();
  const email = cols.find(c => c.name === "email");
  if (!email || email.notnull === 0) return; // already nullable (or table absent)

  raw.exec("PRAGMA foreign_keys=OFF");
  raw.exec("BEGIN");
  try {
    raw.exec(`
      CREATE TABLE users_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        email         TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        first_name    TEXT,
        last_name     TEXT,
        phone         TEXT,
        is_admin      INTEGER DEFAULT 0,
        created_at    INTEGER DEFAULT (strftime('%s','now'))
      );
    `);
    raw.exec(`
      INSERT INTO users_new (id,email,password_hash,first_name,last_name,phone,is_admin,created_at)
      SELECT id,email,password_hash,first_name,last_name,phone,is_admin,created_at FROM users;
    `);
    raw.exec("DROP TABLE users");
    raw.exec("ALTER TABLE users_new RENAME TO users");
    raw.exec("COMMIT");
  } catch (e) {
    try { raw.exec("ROLLBACK"); } catch (_) {}
    raw.exec("PRAGMA foreign_keys=ON");
    throw e;
  }
  raw.exec("PRAGMA foreign_keys=ON");
}
makeUserEmailNullable();

// Unique phone per account, but only when set (partial index → many NULLs allowed).
raw.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL");

module.exports = db;
