// Nav components — Shop megamenu, Sale dropdown, Account dropdown,
// Search overlay, Bag drawer, Wishlist link.

function CaretIcon() {
  return (
    <svg className="nav-caret" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5l3 3 3-3" />
    </svg>
  );
}

function NavIcon({ d }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/* ── Shop megamenu (Drawer below nav) ─────────────── */
function ShopMega({ open, onClose }) {
  const [cats, setCats] = React.useState([]);
  const [conc, setConc] = React.useState([]);
  const [hero, setHero] = React.useState(null);
  React.useEffect(() => {
    window.api?.get("/api/categories").then(setCats).catch(() => setCats([]));
    window.api?.get("/api/concerns").then(setConc).catch(() => setConc([]));
    window.api?.get("/api/hero-slides").then(rs => setHero(rs?.[0] || null)).catch(() => {});
  }, []);
  // Split categories ~50/50 across the two columns.
  const half = Math.ceil(cats.length / 2);
  const left = cats.slice(0, half);
  const right = cats.slice(half);
  const heroBrand = hero && BRANDS[hero.brand];
  return (
    <div className={"mega" + (open ? " open" : "")} onMouseLeave={onClose}>
      <div className="mega-inner shell">
        <a className="mega-shopall" href="Shop.html">
          Shop All <span className="arr">⟶</span>
        </a>
        <div className="mega-cols">
          <div className="mega-col">
            <h6>By Category</h6>
            {left.map(c => (
              <a key={c.key} href={"Shop.html#cat=" + c.key} className="mega-cat">{c.label}</a>
            ))}
          </div>
          <div className="mega-col">
            <h6>&nbsp;</h6>
            {right.map(c => (
              <a key={c.key} href={"Shop.html#cat=" + c.key} className="mega-cat">{c.label}</a>
            ))}
            <a href="Shop.html" className="mega-cat">Gift Sets</a>
          </div>
          <div className="mega-col">
            <h6>By Brand</h6>
            <a href="/brands" className="mega-cat">All Brands ⟶</a>
            <a href="Shop.html#ceylon=1" className="mega-sub mega-pop">Ceylon Brands</a>
            {(window.BRAND_LIST || []).slice(0, 6).map(k => (
              <a key={k} href={"Shop.html#brand=" + k} className="mega-sub">{BRANDS[k]?.name}</a>
            ))}
            {conc.length > 0 && <h6 style={{marginTop:24}}>By Concern</h6>}
            {conc.map(c => (
              <a key={c.key} href={"Shop.html#concern=" + c.key} className="mega-sub">{c.label}</a>
            ))}
          </div>
          {hero && heroBrand && (
            <div className="mega-feature">
              <div className="mega-feature-tag">{hero.customTag || "Featured"}</div>
              <div className="mega-feature-stage">
                <ProductVisual image={hero.image} variant={hero.variant} brand={heroBrand}
                               product={{ name: hero.italic }} liquid={hero.liquid} liquidTop={hero.liquidTop} />
              </div>
              <div className="mega-feature-brand">{heroBrand.name}</div>
              <div className="mega-feature-name">{hero.name} <em>{hero.italic}</em></div>
              <a href={"/product/" + hero.id} className="mega-feature-cta">Shop &nbsp;⟶</a>
            </div>
          )}
        </div>
        <div className="mega-strip">
          <a href="Shop.html#new=1">New Arrivals</a>
          <a href="Shop.html">Pre-orders</a>
          <a href="Shop.html#ceylon=1">Ceylon Brands</a>
          <a href="Shop.html#sale=1">Editor's Picks</a>
        </div>
      </div>
    </div>
  );
}

/* ── Sale dropdown ────────────────────────────────── */
function SaleMenu({ open, onClose }) {
  return (
    <div className={"dropdown sale-drop" + (open ? " open" : "")} onMouseLeave={onClose}>
      <div className="dropdown-inner">
        <a href="Shop.html#sale=1" className="dropdown-head">All Sale <span className="arr">⟶</span></a>
        <a href="Shop.html#sale=1" className="dropdown-item">Up to 30% off</a>
        <a href="Shop.html#sale=1" className="dropdown-item">Up to 50% off</a>
        <a href="Shop.html#sale=1" className="dropdown-item">Last Chance</a>
        <div className="dropdown-divider"></div>
        <div className="dropdown-section">By Category</div>
        <a href="Shop.html#sale=1&cat=skincare" className="dropdown-item">Skincare</a>
        <a href="Shop.html#sale=1&cat=makeup" className="dropdown-item">Makeup</a>
        <a href="Shop.html#sale=1&cat=fragrance" className="dropdown-item">Fragrance</a>
        <a href="Shop.html#sale=1&cat=body" className="dropdown-item">Body &amp; Hair</a>
      </div>
    </div>
  );
}

/* ── Account dropdown ─────────────────────────────── */
function AccountMenu({ open, onClose }) {
  const [user, setUser] = React.useState(null);
  React.useEffect(() => {
    if (!open || !window.api) return;
    window.api.get("/api/auth/me").then(r => setUser(r.user)).catch(() => setUser(null));
  }, [open]);
  const signOut = async () => {
    try { await window.api.post("/api/auth/logout"); } catch {}
    setUser(null);
    window.location.href = "/";
  };
  return (
    <div className={"dropdown acct-drop" + (open ? " open" : "")} onMouseLeave={onClose}>
      <div className="dropdown-inner">
        {user ? (
          <>
            <div className="dropdown-section">Hello, {(user.first_name || user.email).split("@")[0]}</div>
            {user.is_admin && (
              <>
                <a href="admin.html" className="dropdown-item" style={{color:"var(--wine)",fontWeight:500}}>★ Admin Dashboard</a>
                <div className="dropdown-divider"></div>
              </>
            )}
            <a href="account.html" className="dropdown-item">Your Account</a>
            <a href="account.html#orders" className="dropdown-item">Orders</a>
            <a href="wishlist.html" className="dropdown-item">Wishlist</a>
            <div className="dropdown-divider"></div>
            <button type="button" onClick={signOut} className="dropdown-item" style={{textAlign:"left",width:"100%"}}>Sign Out</button>
          </>
        ) : (
          <>
            <div className="dropdown-section">Account</div>
            <a href="login.html" className="dropdown-item">Sign In</a>
            <a href="signup.html" className="dropdown-item">Create Account</a>
            <div className="dropdown-divider"></div>
            <a href="track.html" className="dropdown-item">Track Order</a>
            <a href="contact.html" className="dropdown-item">Help &amp; Returns</a>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Search overlay ───────────────────────────────── */
function SearchOverlay({ open, onClose }) {
  const [q, setQ] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    const onEsc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  const [results, setResults] = React.useState([]);
  React.useEffect(() => {
    if (!q || q.length < 2 || !window.api) { setResults([]); return; }
    const t = setTimeout(() => {
      window.api.get("/api/search?q=" + encodeURIComponent(q))
        .then(rs => setResults(rs))
        .catch(() => setResults([]));
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className={"search-overlay" + (open ? " open" : "")} onClick={onClose}>
      <div className="search-panel" onClick={(e) => e.stopPropagation()}>
        <div className="search-row">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <input
            autoFocus={open}
            placeholder="Search for brands, products, ingredients…"
            value={q} onChange={(e) => setQ(e.target.value)}
          />
          <button className="search-close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="search-body">
          {q.length === 0 ? (
            <>
              <div className="search-section">Popular</div>
              <div className="search-chips">
                {["CeraVe", "The Ordinary", "Sunscreen", "Vitamin C", "Anua", "Niacinamide", "Cleanser"].map(t => (
                  <button key={t} onClick={() => setQ(t)} className="search-chip">{t}</button>
                ))}
              </div>
              <div className="search-section">Quick Links</div>
              <div className="search-links">
                <a href="Shop.html#sale=1">Sale</a>
                <a href="/brands">All Brands</a>
                <a href="Shop.html#new=1">New Arrivals</a>
                <a href="Shop.html#ceylon=1">Ceylon Brands</a>
              </div>
            </>
          ) : (
            <>
              <div className="search-section">{results.length} result{results.length === 1 ? "" : "s"}</div>
              <div className="search-results">
                {results.map((p, i) => {
                  const b = BRANDS[p.brand] || { name: p.brandName };
                  const price = p.sale || p.price;
                  return (
                    <a key={i} href={"/product/" + encodeURIComponent(p.id)} className="search-result">
                      <div className="search-result-art">
                        <ProductVisual image={p.image} variant={p.variant} brand={b}
                                       product={{ name: p.italic }}
                                       liquid={p.liquid} liquidTop={p.liquidTop} />
                      </div>
                      <div className="search-result-info">
                        <div className="search-result-brand">{b.name}</div>
                        <div className="search-result-name">{p.name} <em>{p.italic}</em></div>
                        <div className="search-result-meta">{p.sub || p.category}</div>
                      </div>
                      <div className="search-result-price">{window.fmtLKR ? window.fmtLKR(price) : "LKR " + price}</div>
                    </a>
                  );
                })}
                {results.length === 0 && (
                  <div className="search-empty">No matches. Try "Ceylon", "Iris" or "Lip".</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Bag drawer ───────────────────────────────────── */
function BagDrawer({ open, onClose }) {
  const [cart, setCart] = React.useState({ items: [], subtotal: 0, count: 0 });
  const [loading, setLoading] = React.useState(false);
  const fmt = (n) => "LKR " + Number(n || 0).toLocaleString("en-US");

  const refresh = React.useCallback(async () => {
    if (!window.api) return;
    setLoading(true);
    try { setCart(await window.api.get("/api/cart")); }
    catch {}
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    refresh();
    const onEsc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose, refresh]);

  React.useEffect(() => {
    const h = () => refresh();
    window.addEventListener("cart:changed", h);
    return () => window.removeEventListener("cart:changed", h);
  }, [refresh]);

  const setQty = async (lineId, qty) => {
    try { setCart(await window.api.patch("/api/cart/items/" + lineId, { qty })); }
    catch {}
  };
  const remove = async (lineId) => {
    try { setCart(await window.api.del("/api/cart/items/" + lineId)); }
    catch {}
  };

  const items = cart.items || [];

  return (
    <>
      <div className={"drawer-scrim" + (open ? " open" : "")} onClick={onClose}></div>
      <aside className={"bag-drawer" + (open ? " open" : "")} aria-hidden={!open}>
        <header className="bag-head">
          <div>
            <div className="bag-title">Your Bag</div>
            <div className="bag-sub">{cart.count} item{cart.count === 1 ? "" : "s"}</div>
          </div>
          <button className="bag-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" /></svg>
          </button>
        </header>
        <div className="bag-body">
          {items.length === 0 ? (
            <div className="bag-empty">
              <div className="bag-empty-title">{loading ? "Loading…" : "Your bag is empty."}</div>
              <div className="bag-empty-sub">Start with the bestsellers — Tea Glow, Gold Oil, Red No. 12.</div>
              <a href="Shop.html" className="btn-solid" onClick={onClose}>Shop the shelf <span>⟶</span></a>
            </div>
          ) : items.map((line) => {
            const it = line.product;
            const b = (BRANDS && BRANDS[it.brand]) || { name: it.brandName };
            return (
              <div className="bag-item" key={line.lineId}>
                <div className="bag-item-art">
                  <ProductVisual image={it.image} variant={it.variant} brand={b}
                                 product={{ name: it.italic }}
                                 liquid={it.liquid} liquidTop={it.liquidTop} />
                </div>
                <div className="bag-item-info">
                  <div className="bag-item-brand">{b.name}</div>
                  <div className="bag-item-name">{it.name} <em>{it.italic}</em></div>
                  <div className="bag-item-qty">
                    <button onClick={() => setQty(line.lineId, Math.max(1, line.qty - 1))} aria-label="Decrease">−</button>
                    <span>{line.qty}</span>
                    <button onClick={() => setQty(line.lineId, line.qty + 1)} aria-label="Increase">+</button>
                    <button className="bag-item-remove" onClick={() => remove(line.lineId)}>Remove</button>
                  </div>
                </div>
                <div className="bag-item-price">{fmt(line.lineTotal)}</div>
              </div>
            );
          })}
          {items.length > 0 && (
            <div className="bag-note">
              <span>Free samples</span>
              <small>Pick 3 at checkout</small>
            </div>
          )}
        </div>
        {items.length > 0 && (
          <footer className="bag-foot">
            <div className="bag-totals">
              <div className="bag-total-row"><span>Subtotal</span><b>{fmt(cart.subtotal)}</b></div>
              <div className="bag-total-row small"><span>Delivery</span><span>Calculated next</span></div>
            </div>
            <a href="checkout.html" className="btn-solid bag-checkout">Checkout <span>⟶</span></a>
            <a href="cart.html" className="bag-keep">view full bag</a>
          </footer>
        )}
      </aside>
    </>
  );
}

/* ── Mobile drawer (whole menu) ───────────────────── */
function MobileMenu({ open, onClose }) {
  return (
    <>
      <div className={"drawer-scrim" + (open ? " open" : "")} onClick={onClose}></div>
      <aside className={"mob-menu" + (open ? " open" : "")} aria-hidden={!open}>
        <header className="bag-head">
          <div className="bag-title">Menu</div>
          <button className="bag-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" /></svg>
          </button>
        </header>
        <div className="mob-list">
          <a href="Shop.html" onClick={onClose}>Shop</a>
          <a href="/brands" onClick={onClose}>Brands</a>
          <a href="Shop.html#sale=1" onClick={onClose}>Sale <span className="mob-dot"></span></a>
          <a href="/#journal" onClick={onClose}>Stories</a>
          <div className="mob-divider"></div>
          <a href="login.html" onClick={onClose}>Sign In</a>
          <a href="wishlist.html" onClick={onClose}>Wishlist</a>
          <a href="track.html" onClick={onClose}>Track Order</a>
          <a href="contact.html" onClick={onClose}>Help</a>
        </div>
      </aside>
    </>
  );
}

/* ── Main nav ─────────────────────────────────────── */
function Nav({ name, tagline, onSearch, onBag }) {
  const [menu, setMenu] = React.useState(null); // 'shop' | 'sale' | 'account' | null
  const [mobOpen, setMobOpen] = React.useState(false);
  const [bagCount, setBagCount] = React.useState(0);
  const [wishCount, setWishCount] = React.useState(0);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setMenu(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (!window.api) return;
    const loadCart = () => window.api.get("/api/cart").then(r => setBagCount(r.count || 0)).catch(() => {});
    const loadWish = () => window.api.get("/api/wishlist")
      .then(r => setWishCount((r || []).length))
      .catch(() => setWishCount(0));
    loadCart(); loadWish();
    const bh = () => loadCart();
    const wh = () => loadWish();
    window.addEventListener("cart:changed", bh);
    window.addEventListener("wishlist:changed", wh);
    return () => {
      window.removeEventListener("cart:changed", bh);
      window.removeEventListener("wishlist:changed", wh);
    };
  }, []);

  return (
    <>
      <nav className="nav">
        <div className="shell nav-inner">
          <div className="nav-links">
            <button
              className={"nav-link nav-trigger" + (menu === "shop" ? " active" : "")}
              onMouseEnter={() => setMenu("shop")}
              onClick={() => setMenu(menu === "shop" ? null : "shop")}
            >Shop <CaretIcon /></button>
            <a className="nav-link" href="/brands" onMouseEnter={() => setMenu(null)}>Brands</a>
            <div className="nav-trigger-wrap">
              <button
                className={"nav-link nav-trigger sale" + (menu === "sale" ? " active" : "")}
                onMouseEnter={() => setMenu("sale")}
                onClick={() => setMenu(menu === "sale" ? null : "sale")}
              >Sale <span className="nav-dot"></span></button>
              <SaleMenu open={menu === "sale"} onClose={() => setMenu(null)} />
            </div>
            <a className="nav-link" href="/#journal" onMouseEnter={() => setMenu(null)}>Stories</a>
          </div>

          <button className="nav-burger" onClick={() => setMobOpen(true)} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" /></svg>
          </button>

          <div className="nav-logo" onMouseEnter={() => setMenu(null)}>
            <div className="mark">{name}</div>
            <small>{tagline}</small>
          </div>

          <div className="nav-right">
            <button className="nav-icon-btn" onClick={onSearch} aria-label="Search">
              <NavIcon d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35" />
            </button>
            <div className="nav-trigger-wrap nav-icon-wrap" onMouseEnter={() => setMenu("account")} onMouseLeave={() => setMenu(null)}>
              <button className="nav-icon-btn" aria-label="Account">
                <NavIcon d="M20 21a8 8 0 0 0-16 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
              </button>
              <AccountMenu open={menu === "account"} onClose={() => setMenu(null)} />
            </div>
            <a className="nav-icon-btn nav-wish" aria-label="Wishlist" href="wishlist.html">
              <NavIcon d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
              {wishCount > 0 && <span className="nav-badge">{wishCount}</span>}
            </a>
            <button className="bag-pill" onClick={onBag}>
              <svg width="12" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 8h12l-1.5 12h-9zM9 8V5a3 3 0 0 1 6 0v3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Bag <span className="count">({String(bagCount).padStart(2, "0")})</span>
            </button>
          </div>
        </div>

        <ShopMega open={menu === "shop"} onClose={() => setMenu(null)} />
      </nav>
      <MobileMenu open={mobOpen} onClose={() => setMobOpen(false)} />
    </>
  );
}

Object.assign(window, { Nav, SearchOverlay, BagDrawer });
