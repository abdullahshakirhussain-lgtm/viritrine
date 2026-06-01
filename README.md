# VITRINE

A Colombo multi-brand beauty boutique — Sri Lankan e-commerce site.
Frontend is the original Claude Design export (React via Babel-in-browser, served as
static files). Backend is a single Node + Express + SQLite process. No build step.

## Quick start (Windows / PowerShell)

```powershell
cd vitrine
npm install
copy .env.example .env       # then edit JWT_SECRET if you like
node server/seed.js          # seeds brands, products, admin user
npm start                    # http://localhost:4000
```

`npm run dev` for `--watch` auto-restart during development.

## Default admin

Set via `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`). Defaults to:

- email: `admin@vitrine.lk`
- password: `admin`

Sign in as admin to hit `/api/admin/*` endpoints (orders, contact, newsletter).

## Pages

### Storefront
| Page                              | Notes                                                  |
|-----------------------------------|--------------------------------------------------------|
| `/`                               | Homepage (design export)                               |
| `/Shop.html`                      | Shop / filter / quick view (now fetches live catalogue)|
| `/product.html?id=ay-01`          | Product detail page                                    |
| `/cart.html`                      | Full bag page                                          |
| `/checkout.html`                  | Single-page checkout (no payment processing)           |
| `/order-confirmation.html?...`    | Post-order confirmation                                |
| `/login.html` / `/signup.html`    | Auth                                                   |
| `/account.html`                   | Profile, orders, addresses                             |
| `/wishlist.html`                  | Saved items (requires sign-in)                         |
| `/contact.html`                   | Contact form + FAQ                                     |
| `/track.html?number=…&email=…`    | Guest order tracking                                   |

### Storefront — Journal
| Page                              | Notes                                                  |
|-----------------------------------|--------------------------------------------------------|
| `/journal.html`                   | Index of all published stories                         |
| `/journal-post.html?slug=…`       | Single post (with SEO `<title>` + `<meta>` + OG tags)  |

### Admin (requires `is_admin` login)
| Page                              | Notes                                                  |
|-----------------------------------|--------------------------------------------------------|
| `/admin.html`                     | Dashboard — revenue, orders, products, recent orders   |
| `/admin-products.html`            | Product list — search, filter, hide/show, delete       |
| `/admin-product-edit.html?id=…`   | Add or edit a product — incl. real image upload + Editor's pick toggle |
| `/admin-brands.html`              | Brand list                                             |
| `/admin-brand-edit.html?key=…`    | Add or edit a brand — incl. logo upload                |
| `/admin-categories.html`          | Manage categories + concerns                           |
| `/admin-hero.html`                | Homepage hero carousel — pick products, set tags       |
| `/admin-announcements.html`       | Top-of-page rotating announcements                     |
| `/admin-journal.html`             | Story list (publish / draft / delete)                  |
| `/admin-journal-edit.html?id=…`   | Markdown editor + cover image + SEO meta               |
| `/admin-faqs.html`                | Contact-page FAQ list                                  |
| `/admin-locations.html`           | Boutiques + pop-ups (footer + contact page)            |
| `/admin-orders.html`              | Orders list + status updates + detail modal            |
| `/admin-messages.html`            | Contact form submissions                               |
| `/admin-newsletter.html`          | Subscriber list + CSV export                           |
| `/admin-settings.html`            | Site identity, contact, newsletter copy, shipping rates, sample list |

## Editable content reference

Almost every piece of text/image on the storefront comes from the database. To change something, sign in to the admin and open the corresponding page:

| What you see on the site                | Where to edit                              |
|-----------------------------------------|--------------------------------------------|
| Top rotating announce bar               | Announcements                              |
| Hero carousel (homepage)                | Hero slides                                |
| "Shop the Shelf" rail (homepage)        | Products → toggle "Editor's pick" + sort   |
| Sale section (homepage + shop)          | Auto-filled from products with sale prices |
| Brand marquee + brand wall              | Brands                                     |
| Newsletter heading + body               | Settings → Newsletter copy                 |
| Footer description, address, socials    | Settings → Shop identity / Contact details |
| Footer "Visit" column                   | Locations                                  |
| Contact page FAQ                        | FAQs                                       |
| Contact page "Visit" sidebar            | Locations                                  |
| Checkout free-sample list               | Settings → Free samples                    |
| Checkout shipping rates + COD fee       | Settings → Shipping rates                  |
| Megamenu category/concern items         | Categories / Concerns                      |
| Megamenu featured product               | First active Hero slide                    |
| Stories / Journal articles              | Journal                                    |

## API (all under `/api`)

### Catalog
- `GET  /api/brands`
- `GET  /api/products?category=&brand=&concern=&sale=1&isNew=1&ceylon=1&q=&sort=&limit=&offset=`
- `GET  /api/products/:id` → `{ product, related }`
- `GET  /api/search?q=`

### Auth
- `POST /api/auth/signup`  body: `{ email, password, first_name?, last_name?, phone? }`
- `POST /api/auth/login`   body: `{ email, password }`
- `POST /api/auth/logout`
- `GET  /api/auth/me`
- `PATCH /api/auth/me`     body: `{ first_name, last_name, phone }`

### Cart (cookie-scoped; merges with user on login)
- `GET    /api/cart`
- `POST   /api/cart/items`           body: `{ product_id, qty, size? }`
- `PATCH  /api/cart/items/:lineId`   body: `{ qty }` (0 deletes)
- `DELETE /api/cart/items/:lineId`
- `DELETE /api/cart`

### Wishlist (requires auth)
- `GET    /api/wishlist`
- `POST   /api/wishlist/:productId`
- `DELETE /api/wishlist/:productId`

### Orders
- `POST  /api/orders`                   places an order from the current cart
- `GET   /api/orders/me`                requires auth
- `GET   /api/orders/by-number/:n?email=…`  guest tracking by number + email

### Misc
- `POST  /api/newsletter`            body: `{ email }`
- `POST  /api/contact`               body: `{ name, email, subject?, message }`

### Admin (requires `is_admin`)
- `GET    /api/admin/stats`                                     dashboard counters
- `GET    /api/admin/products`                                  full list incl. inactive
- `POST   /api/admin/products`        body: `{ id, brand_key, name, … }`
- `PATCH  /api/admin/products/:id`    partial update
- `DELETE /api/admin/products/:id`
- `POST   /api/admin/upload/products/:id`   `multipart/form-data` field `image`
- `DELETE /api/admin/upload/products/:id`   removes image only
- `GET/POST /api/admin/brands`
- `PATCH/DELETE /api/admin/brands/:key`
- `POST/DELETE /api/admin/upload/brands/:key`   brand logo
- `GET/POST /api/admin/categories`
- `PATCH/DELETE /api/admin/categories/:key`
- `GET/POST/DELETE /api/admin/concerns[/:key]`
- `GET    /api/admin/orders`
- `GET    /api/admin/orders/:id`     includes items
- `PATCH  /api/admin/orders/:id`     body: `{ status }`
- `GET    /api/admin/contact`
- `GET    /api/admin/newsletter`

### Uploads
- Images saved under `server/data/uploads/{products,brands}/` and served at `/uploads/*`
- Max 6 MB, formats: PNG / JPG / WEBP / AVIF / GIF
- Old image is auto-deleted when a new one is uploaded or the product is deleted

## What's deliberately not built

- **Payments.** The checkout collects payment method preference (Card / COD / KOKO)
  and emails a pay-link in the copy, but no Stripe/PayHere integration is wired.
  Drop in your gateway of choice on `POST /api/orders` — the order is created in
  status `awaiting_payment` (card/koko) or `pending` (cod).
- Real email sending — newsletter and contact submissions land in SQLite. Hook up
  Resend / Postmark / SES at the relevant endpoint.

## Project layout

```
vitrine/
├── package.json
├── .env.example
├── README.md
├── public/                              ← static site (served by Express)
│   ├── VITRINE - Beauty, Curated.html   ← homepage (design export)
│   ├── Shop.html                        ← shop page (design export)
│   ├── product.html
│   ├── cart.html
│   ├── checkout.html
│   ├── order-confirmation.html
│   ├── login.html  signup.html  account.html
│   ├── wishlist.html  contact.html  track.html
│   └── src/
│       ├── styles.css  nav.css  shop.css  pages.css
│       ├── api.jsx      ← fetch helper (window.api, window.fmtLKR)
│       ├── chrome.jsx   ← Announce / BrandStrip / Footer
│       ├── page-shell.jsx
│       ├── nav.jsx      ← wired to /api/cart, /api/search, /api/auth/me
│       ├── data.jsx  products.jsx  sale.jsx  Bottle.jsx
│       ├── App.jsx     ← homepage
│       ├── shop.jsx    ← shop page
│       └── tweaks-panel.jsx
└── server/
    ├── index.js         ← Express app (auth, cart, orders, etc.)
    ├── db.js            ← SQLite schema (better-sqlite3, WAL)
    ├── seed.js          ← seeds brands + products + admin
    └── data/vitrine.db  ← created on first run (gitignored)
```

## Notes

- The frontend uses Babel-standalone to compile JSX in the browser — fine for
  iteration, but for production you'd want a build step (Vite/esbuild) so the
  unpkg + Babel scripts don't ship to users.
- All money is integer LKR. Shipping rules: free over LKR 25,000, otherwise
  LKR 850 standard / LKR 1,500 express; COD adds LKR 200.
- Cart is identified by an `httpOnly` cookie (`vt_cart`); on sign-in / sign-up
  the anonymous cart is attached to the user.
- Order numbers look like `VTR-YYMMDD-NNNN`.
