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

CREATE INDEX IF NOT EXISTS idx_products_brand    ON products(brand_key);
CREATE INDEX IF NOT EXISTS idx_products_cat      ON products(category);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart   ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_orders_user       ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_email      ON orders(email);
CREATE INDEX IF NOT EXISTS idx_journal_published ON journal_posts(published_at);
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
ensureColumn("brands",   "image",            "image TEXT");

module.exports = db;
