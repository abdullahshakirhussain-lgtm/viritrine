// shop.jsx — full Shop page logic.
// ShopPage · Breadcrumb · ShopHeader · FilterBar · FilterDropdown
// MobileFilterSheet · ProductGrid · ProductTile · QuickView · ExpressCheckout · Toast

/* ── Utilities ─────────────────────────────────── */
const fmtLKR = (n) => "LKR " + n.toLocaleString("en-US");

function parseHash() {
  const out = Object.fromEntries(new URLSearchParams((window.location.hash || "").replace(/^#/, "")).entries());
  // Pretty URLs: /brand/:key, /category/:key, /skin/:key, /concern/:key map to filters.
  const m = window.location.pathname.match(/^\/(brand|category|skin|concern)\/([a-z0-9_-]+)/i);
  if (m) {
    const kind = m[1].toLowerCase(), val = decodeURIComponent(m[2]);
    if (kind === "brand")    out.brand = val;
    if (kind === "category") out.cat   = val;
    if (kind === "skin")     out.skin  = val;
    if (kind === "concern")  out.concern = val;
  }
  return out;
}

function filterProducts(items, f) {
  return items.filter(p => {
    if (f.category && p.category !== f.category) return false;
    if (f.brand && p.brand !== f.brand) return false;
    if (f.concern && !(p.concerns || []).includes(f.concern)) return false;
    if (f.skin && !(p.skinTypes || []).includes(f.skin)) return false;
    if (f.sale && !p.sale) return false;
    if (f.newOnly && !p.isNew) return false;
    if (f.ceylonOnly) {
      const b = BRANDS[p.brand] || { loc: p.brandLoc };
      if (!(b.loc === "Colombo" || b.loc === "Galle")) return false;
    }
    return true;
  });
}

function sortProducts(items, sort) {
  const a = [...items];
  switch (sort) {
    case "new":         return a.sort((x,y) => Number(!!y.isNew) - Number(!!x.isNew));
    case "price-asc":   return a.sort((x,y) => (x.sale || x.price) - (y.sale || y.price));
    case "price-desc":  return a.sort((x,y) => (y.sale || y.price) - (x.sale || x.price));
    case "bestselling": return a.sort((x,y) => Number(!!y.isBestseller) - Number(!!x.isBestseller));
    case "off-desc":    return a.sort((x,y) => (y.off || 0) - (x.off || 0));
    default:            return a;
  }
}

/* ── Toast ─────────────────────────────────────── */
function Toast({ msg }) {
  return (
    <div className={"toast" + (msg ? " show" : "")}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
      <span>Added to bag</span>
      <b>{msg || ""}</b>
    </div>
  );
}

/* ── Breadcrumb ────────────────────────────────── */
function Breadcrumb({ filters }) {
  const last = filters.brand ? (BRANDS[filters.brand]?.name || filters.brand)
            : filters.category ? CATEGORIES.find(c => c.key === filters.category)?.label
            : filters.skin ? (SKIN_TYPES.find(c => c.key === filters.skin)?.label || filters.skin) + " skin"
            : filters.concern ? CONCERNS.find(c => c.key === filters.concern)?.label
            : filters.sale ? "Sale"
            : "All";
  return (
    <div className="crumb">
      <a href="/">Home</a>
      <span className="sep">/</span>
      <a href="Shop.html">Shop</a>
      <span className="sep">/</span>
      <span className="now">{last}</span>
    </div>
  );
}

/* ── Shop header (varies per filter context) ──── */
function ShopHeader({ filters, count }) {
  // For admin-added brands not in the static data.jsx map, fetch live brand info.
  const [liveBrand, setLiveBrand] = React.useState(null);
  React.useEffect(() => {
    if (!filters.brand) { setLiveBrand(null); return; }
    if (BRANDS[filters.brand]) { setLiveBrand(BRANDS[filters.brand]); return; }
    window.api?.get("/api/brands")
      .then(rows => setLiveBrand(rows.find(r => r.key === filters.brand) || { name: filters.brand, loc: "", cat: "" }))
      .catch(() => setLiveBrand({ name: filters.brand, loc: "", cat: "" }));
  }, [filters.brand]);
  let title, italic, eyebrow, copy;
  if (filters.brand) {
    const b = liveBrand || BRANDS[filters.brand] || { name: filters.brand, loc: "", cat: "" };
    eyebrow = b.cat || "Brand";
    title = b.name;
    italic = b.loc;
    copy = `Every piece from ${b.name}, in stock and ready to ship across the island.`;
  } else if (filters.category) {
    const c = CATEGORIES.find(x => x.key === filters.category) || { label: filters.category, italic: "" };
    eyebrow = "Shop by Category";
    title = c.label;
    italic = c.italic;
    copy = "A curated selection from the brands we carry, sorted for clarity.";
  } else if (filters.skin) {
    const c = SKIN_TYPES.find(x => x.key === filters.skin) || { label: filters.skin };
    eyebrow = "Shop by Skin Type";
    title = c.label + " Skin";
    italic = "Matched";
    copy = `Cleansers, serums and moisturisers our team recommends for ${c.label.toLowerCase()} skin.`;
  } else if (filters.concern) {
    const c = CONCERNS.find(x => x.key === filters.concern) || { label: filters.concern };
    eyebrow = "Shop by Concern";
    title = c.label;
    italic = "by Concern";
    copy = "Products our team recommends for this specific concern.";
  } else if (filters.sale) {
    eyebrow = "Up to 40% off";
    title = "Sale";
    italic = "Marked Down";
    copy = "Hand-picked, marked down. Ends 30 June. While stocks last.";
  } else {
    eyebrow = "Multi-brand Beauty";
    title = "Shop";
    italic = "All";
    copy = "Every piece in the shop, all categories and all brands, in one grid.";
  }
  return (
    <header className="shop-head">
      <div className="shell">
        <div className="shop-head-row">
          <div>
            <div className="eyebrow"><span>{eyebrow}</span></div>
            <h1>{title} {italic && <em>{italic}</em>}</h1>
            <p>{copy}</p>
          </div>
          <div className="count"><b>{count}</b>&nbsp;product{count === 1 ? "" : "s"}</div>
        </div>
      </div>
    </header>
  );
}

/* ── Filter dropdown ──────────────────────────── */
function CaretSmall() {
  return (
    <svg className="nav-caret" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5l3 3 3-3" />
    </svg>
  );
}

function FilterDrop({ label, value, options, onChange, alignRight }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const active = options.find(o => o.key === value);
  const displayLabel = active ? `${label}: ${active.label}` : label;

  return (
    <div className="filter-trigger-wrap" ref={ref}>
      <button
        className={"filter-trigger" + (open ? " active" : "") + (value ? " has-value" : "")}
        onClick={() => setOpen(o => !o)}
      >
        {displayLabel}
        <CaretSmall />
      </button>
      <div className={"filter-drop" + (open ? " open" : "")}
           style={alignRight ? { right: 0 } : { left: 0 }}>
        <div className="filter-drop-inner">
          {options.map(o => (
            <button
              key={o.key}
              className={"filter-drop-item" + (o.key === value ? " on" : "")}
              onClick={() => { onChange(o.key === value ? null : o.key); setOpen(false); }}
            >
              <span>{o.label}</span>
              <span className="check">✓</span>
            </button>
          ))}
          {value !== null && (
            <button className="filter-drop-clear" onClick={() => { onChange(null); setOpen(false); }}>
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SortDrop({ value, onChange }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  const active = SORTS.find(s => s.key === value) || SORTS[0];
  return (
    <div className="filter-trigger-wrap" ref={ref}>
      <button
        className={"filter-trigger" + (open ? " active" : "")}
        onClick={() => setOpen(o => !o)}
      >
        Sort: {active.label} <CaretSmall />
      </button>
      <div className={"filter-drop" + (open ? " open" : "")} style={{ left: 0 }}>
        <div className="filter-drop-inner">
          {SORTS.map(s => (
            <button key={s.key}
                    className={"filter-drop-item" + (s.key === value ? " on" : "")}
                    onClick={() => { onChange(s.key); setOpen(false); }}>
              <span>{s.label}</span>
              <span className="check">✓</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Filter drawer (right side) ────────────────────── */
function FilterDrawer({ open, onClose, filters, setFilters, results }) {
  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  React.useEffect(() => {
    if (!open) return;
    const onEsc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);
  return (
    <>
      <div className={"drawer-scrim" + (open ? " open" : "")} onClick={onClose}></div>
      <aside className={"filter-drawer" + (open ? " open" : "")} aria-hidden={!open}>
        <div className="fd-head">
          <div className="fd-title">Filters</div>
          <button className="bag-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="fd-body">
          <div className="fd-section">Category</div>
          <div className="fd-chips">
            {CATEGORIES.map(c => (
              <button key={c.key} className={"fd-chip" + (c.key === filters.category ? " on" : "")}
                onClick={() => setF("category", c.key === filters.category ? null : c.key)}>{c.label}</button>
            ))}
          </div>
          <div className="fd-section">Skin type</div>
          <div className="fd-chips">
            {SKIN_TYPES.map(c => (
              <button key={c.key} className={"fd-chip" + (c.key === filters.skin ? " on" : "")}
                onClick={() => setF("skin", c.key === filters.skin ? null : c.key)}>{c.label}</button>
            ))}
          </div>
          <div className="fd-section">Concern</div>
          <div className="fd-chips">
            {CONCERNS.map(c => (
              <button key={c.key} className={"fd-chip" + (c.key === filters.concern ? " on" : "")}
                onClick={() => setF("concern", c.key === filters.concern ? null : c.key)}>{c.label}</button>
            ))}
          </div>
          <div className="fd-section">Brand</div>
          <div className="fd-chips">
            {BRAND_LIST.map(k => (
              <button key={k} className={"fd-chip" + (k === filters.brand ? " on" : "")}
                onClick={() => setF("brand", k === filters.brand ? null : k)}>{BRANDS[k]?.name || k}</button>
            ))}
          </div>
          <div className="fd-section">More</div>
          <div className="fd-chips">
            <button className={"fd-chip" + (filters.sale ? " on" : "")} onClick={() => setF("sale", !filters.sale)}>On Sale</button>
            <button className={"fd-chip" + (filters.newOnly ? " on" : "")} onClick={() => setF("newOnly", !filters.newOnly)}>New Arrivals</button>
            <button className={"fd-chip" + (filters.ceylonOnly ? " on" : "")} onClick={() => setF("ceylonOnly", !filters.ceylonOnly)}>Ceylon Brands</button>
          </div>
        </div>
        <div className="fd-foot">
          <div className="results"><b>{results}</b>result{results === 1 ? "" : "s"}</div>
          <button className="btn-ghost" onClick={() =>
            setFilters({ category: null, brand: null, concern: null, skin: null, sale: false, newOnly: false, ceylonOnly: false })
          }>Clear</button>
          <button className="btn-solid" onClick={onClose}>Apply <span>⟶</span></button>
        </div>
      </aside>
    </>
  );
}

/* ── Filter bar (sticky) ───────────────────────── */
function FilterBar({ sort, cols, setSort, setCols, onFiltersOpen, activeCount, results }) {
  return (
    <div className="filter-bar">
      <div className="filter-row">
        <SortDrop value={sort} onChange={setSort} />
        <button className={"filter-trigger filters-btn" + (activeCount > 0 ? " has-value" : "")} onClick={onFiltersOpen}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18M6 12h12M10 19h4"/></svg>
          Filters
          {activeCount > 0 && <span className="count-pill">{activeCount}</span>}
        </button>
        <span style={{fontSize:11,letterSpacing:"0.16em",textTransform:"uppercase",color:"var(--ink-3)",marginLeft:8}}>
          {results} product{results === 1 ? "" : "s"}
        </span>
        <div className="filter-spacer"></div>
        <div className="filter-cols" aria-label="Grid density">
          {[2, 3, 4].map(n => (
            <button key={n} className={cols === n ? "active" : ""} onClick={() => setCols(n)} aria-label={n + " columns"}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                {Array.from({length: n}).map((_, i) => (
                  <rect key={i} x={i * (12 / n) + 0.5} y="1.5" width={(12 / n) - 1} height="9" rx="1" />
                ))}
              </svg>
            </button>
          ))}
        </div>
      </div>
      <div className="filter-mobile">
        <button className="filter-mobile-btn" onClick={onFiltersOpen}>
          Filter &amp; Sort
          {activeCount > 0 && <span className="count">{activeCount}</span>}
        </button>
      </div>
    </div>
  );
}

/* ── Active filter pills ─────────────────────── */
function ActiveFilters({ filters, setFilters, sort }) {
  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const pills = [];
  if (filters.category) pills.push({ k: "category", label: "Category: " + (CATEGORIES.find(c => c.key === filters.category)?.label || filters.category) });
  if (filters.brand)    pills.push({ k: "brand",    label: "Brand: " + (BRANDS[filters.brand]?.name || filters.brand) });
  if (filters.skin)     pills.push({ k: "skin",     label: "Skin: " + (SKIN_TYPES.find(c => c.key === filters.skin)?.label || filters.skin) });
  if (filters.concern)  pills.push({ k: "concern",  label: "Concern: " + (CONCERNS.find(c => c.key === filters.concern)?.label || filters.concern) });
  if (filters.sale)       pills.push({ k: "sale",       label: "On Sale" });
  if (filters.newOnly)    pills.push({ k: "newOnly",    label: "New" });
  if (filters.ceylonOnly) pills.push({ k: "ceylonOnly", label: "Ceylon" });
  if (pills.length === 0) return null;

  return (
    <div className="active-filters">
      <span className="label">Filtering by</span>
      {pills.map(p => (
        <span className="active-pill" key={p.k}>
          {p.label}
          <button onClick={() => setF(p.k, p.k === "sale" || p.k === "newOnly" || p.k === "ceylonOnly" ? false : null)} aria-label="Remove">×</button>
        </span>
      ))}
      <button className="clear-all" onClick={() =>
        setFilters({ category: null, brand: null, concern: null, skin: null, sale: false, newOnly: false, ceylonOnly: false })
      }>Clear All</button>
    </div>
  );
}

/* ── Mobile filter sheet ─────────────────────── */
function MobileFilterSheet({ open, onClose, filters, setFilters, sort, setSort }) {
  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  React.useEffect(() => {
    if (!open) return;
    const onEsc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  return (
    <>
      <div className={"drawer-scrim" + (open ? " open" : "")} onClick={onClose}></div>
      <aside className={"mfs" + (open ? " open" : "")} aria-hidden={!open}>
        <div className="mfs-head">
          <span className="grab"></span>
          <div className="tt">Filter &amp; Sort</div>
          <button className="bag-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="mfs-body">
          <div className="mfs-section">Sort by</div>
          <div className="mfs-chips">
            {SORTS.map(s => (
              <button key={s.key} className={"mfs-chip" + (s.key === sort ? " on" : "")} onClick={() => setSort(s.key)}>{s.label}</button>
            ))}
          </div>

          <div className="mfs-section">Category</div>
          <div className="mfs-chips">
            {CATEGORIES.map(c => (
              <button key={c.key} className={"mfs-chip" + (c.key === filters.category ? " on" : "")} onClick={() => setF("category", c.key === filters.category ? null : c.key)}>{c.label}</button>
            ))}
          </div>

          <div className="mfs-section">Skin type</div>
          <div className="mfs-chips">
            {SKIN_TYPES.map(c => (
              <button key={c.key} className={"mfs-chip" + (c.key === filters.skin ? " on" : "")} onClick={() => setF("skin", c.key === filters.skin ? null : c.key)}>{c.label}</button>
            ))}
          </div>

          <div className="mfs-section">Concern</div>
          <div className="mfs-chips">
            {CONCERNS.map(c => (
              <button key={c.key} className={"mfs-chip" + (c.key === filters.concern ? " on" : "")} onClick={() => setF("concern", c.key === filters.concern ? null : c.key)}>{c.label}</button>
            ))}
          </div>

          <div className="mfs-section">Brand</div>
          <div className="mfs-chips">
            {BRAND_LIST.map(k => (
              <button key={k} className={"mfs-chip" + (k === filters.brand ? " on" : "")} onClick={() => setF("brand", k === filters.brand ? null : k)}>{BRANDS[k]?.name || k}</button>
            ))}
          </div>

          <div className="mfs-section">More</div>
          <div className="mfs-chips">
            <button className={"mfs-chip" + (filters.sale ? " on" : "")} onClick={() => setF("sale", !filters.sale)}>On Sale</button>
            <button className={"mfs-chip" + (filters.newOnly ? " on" : "")} onClick={() => setF("newOnly", !filters.newOnly)}>New</button>
            <button className={"mfs-chip" + (filters.ceylonOnly ? " on" : "")} onClick={() => setF("ceylonOnly", !filters.ceylonOnly)}>Ceylon</button>
          </div>
        </div>
        <div className="mfs-foot">
          <button className="btn-ghost" onClick={() => {
            setFilters({ category: null, brand: null, concern: null, skin: null, sale: false, newOnly: false, ceylonOnly: false });
            setSort("featured");
          }}>Clear</button>
          <button className="btn-solid" onClick={onClose}>Apply <span>⟶</span></button>
        </div>
      </aside>
    </>
  );
}

/* ── Product tile ──────────────────────────────── */
function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" strokeLinecap="round" strokeLinejoin="round"/></svg>
  );
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
  );
}

function ProductTile({ p, idx, onOpen, onQuickAdd, wishOn, onWish }) {
  const b = BRANDS[p.brand] || { name: p.brandName, loc: p.brandLoc, accent: undefined, font: "Italiana, serif" };
  const isCeylon = b.loc === "Colombo" || b.loc === "Galle";
  const now = p.sale || p.price;
  return (
    <article className="tile" style={{ animationDelay: `${Math.min(idx, 12) * 40}ms` }} onClick={onOpen}>
      <div className="tile-badges">
        {p.sale && <span className="tile-badge sale">−{p.off}%</span>}
        {p.isNew && <span className="tile-badge new">New</span>}
        {p.isBestseller && <span className="tile-badge bestseller">Bestseller</span>}
        {isCeylon && <span className="tile-badge ceylon">Ceylon</span>}
      </div>
      <button className={"tile-wish" + (wishOn ? " on" : "")} onClick={(e) => { e.stopPropagation(); onWish(); }} aria-label="Wishlist">
        <HeartIcon />
      </button>
      <div className="tile-stage" data-monogram={(b.name || "")[0]} style={{"--brand-accent": b.accent}}>
        <ProductVisual image={p.image} variant={p.variant} brand={b} product={{ name: p.italic }}
                       liquid={p.liquid} liquidTop={p.liquidTop} />
      </div>
      <div className="tile-info">
        <div className="tile-brand">{b.name}</div>
        <h3 className="tile-name">{p.name} <em>{p.italic}</em></h3>
      </div>
      <div className="tile-row">
        <div className="tile-prices">
          <span className="tile-now">{fmtLKR(now)}</span>
          {p.sale && <span className="tile-was">{fmtLKR(p.price)}</span>}
        </div>
        <button className="tile-add" onClick={(e) => { e.stopPropagation(); onQuickAdd(p); }} aria-label="Quick add">
          <PlusIcon />
        </button>
      </div>
    </article>
  );
}

/* ── Quick View modal ─────────────────────────── */
function Accordion({ title, children }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className={"qv-acc" + (open ? " open" : "")}>
      <button className="qv-acc-head" onClick={() => setOpen(o => !o)}>
        <span>{title}</span><span className="icn">+</span>
      </button>
      <div className="qv-acc-body"><div style={{padding: "0 0 0"}}>{children}</div></div>
    </div>
  );
}

function QuickView({ product, onClose, onAddToBag, onBuyNow, wishOn, onWish }) {
  const [size, setSize] = React.useState(product?.size);
  const [qty, setQty] = React.useState(1);
  React.useEffect(() => {
    if (!product) return;
    setSize(product.size); setQty(1);
    const onEsc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [product, onClose]);

  if (!product) return null;
  const b = BRANDS[product.brand] || { name: product.brandName, loc: product.brandLoc, accent: undefined, font: "Italiana, serif" };
  const sizes = product.size ? [product.size, product.size.replace(/(\d+)/, (m) => +m * 2), product.size.replace(/(\d+)/, (m) => +m / 2)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3) : [];
  const now = product.sale || product.price;

  return (
    <>
      <div className={"qv-scrim" + (product ? " open" : "")} onClick={onClose}></div>
      <div className={"qv-modal" + (product ? " open" : "")} role="dialog" aria-modal="true">
        <button type="button" className="qv-close" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 6l12 12M18 6 6 18" strokeLinecap="round"/></svg>
        </button>
        <div className="qv-stage">
          <ProductVisual image={product.image} variant={product.variant} brand={b} product={{ name: product.italic }}
                         liquid={product.liquid} liquidTop={product.liquidTop} />
          <div className="qv-stage-tag">Réf. {product.id.toUpperCase()}</div>
        </div>
        <div className="qv-body">
          <div className="qv-brand">
            <span>{b.name}</span><span className="dot"></span><span>{b.loc}</span>
          </div>
          <h2 className="qv-name">{product.name} <em>{product.italic}</em></h2>
          <div className="qv-rate">
            <span className="stars">★★★★★</span>
            <span>4.8 · 124 reviews</span>
          </div>
          <p className="qv-copy">{product.copy}</p>
          {product.notes && product.notes.length > 0 && (
            <div className="qv-notes">
              {product.notes.map((n, i) => <span key={i} className="qv-note">{n}</span>)}
            </div>
          )}

          {sizes.length > 1 && (
            <>
              <div className="qv-section">Size</div>
              <div className="qv-sizes">
                {sizes.map(s => (
                  <button key={s} className={"qv-size" + (s === size ? " active" : "")} onClick={() => setSize(s)}>{s}</button>
                ))}
              </div>
            </>
          )}

          <div className="qv-row">
            <div className="qv-qty">
              <button onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
              <span>{qty}</span>
              <button onClick={() => setQty(qty + 1)}>+</button>
            </div>
            <div className="qv-price">
              <span className="now">{fmtLKR(now * qty)}</span>
              {product.sale && <>
                <span className="was">{fmtLKR(product.price * qty)}</span>
                <span className="off">−{product.off}%</span>
              </>}
            </div>
          </div>

          <div className="qv-actions">
            <button className="btn-solid" onClick={() => onAddToBag({ ...product, qty, size })}>
              Add to Bag <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="14" height="14"><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button className="btn-ghost" onClick={() => onBuyNow({ ...product, qty, size })}>Buy Now</button>
            <button className={"qv-wish" + (wishOn ? " on" : "")} onClick={onWish} aria-label="Wishlist">
              <HeartIcon />
            </button>
          </div>

          <div className="qv-accordion">
            <Accordion title="Ingredients">
              {(product.notes || []).map((n, i) => <span key={i} style={{display:"inline-block", margin:"4px 12px 4px 0"}}>{n}</span>)}
            </Accordion>
            <Accordion title="How to Use">
              Apply morning &amp; night to clean, dry skin. Patch test on sensitive skin. Best results within two weeks of consistent use.
            </Accordion>
            <Accordion title="Delivery &amp; Returns">
              Free delivery across Sri Lanka on orders over LKR 25,000. Standard delivery 2–4 business days. Returns within 14 days, unopened.
            </Accordion>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Express Checkout sheet ───────────────────── */
function ExpressCheckout({ product, onClose, onDone }) {
  const [email, setEmail] = React.useState("");
  const [delivery, setDelivery] = React.useState("std");
  const [payment, setPayment] = React.useState("card");
  const [placed, setPlaced] = React.useState(false);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    if (!product) return;
    setEmail(""); setDelivery("std"); setPayment("card"); setPlaced(false); setErr("");
    const onEsc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [product, onClose]);

  if (!product) return null;
  const b = BRANDS[product.brand] || { name: product.brandName, loc: product.brandLoc, accent: undefined, font: "Italiana, serif" };
  const now = (product.sale || product.price) * (product.qty || 1);
  const shipping = delivery === "express" ? 1500 : (now >= 25000 ? 0 : 850);
  const total = now + shipping + (payment === "cod" ? 200 : 0);

  const place = () => {
    setErr("");
    if (!email) { setErr("Email required"); return; }
    sessionStorage.setItem("vt_express", JSON.stringify({
      product_id: product.id, qty: product.qty || 1, size: product.size,
      email, delivery, payment,
    }));
    window.location.href = "checkout.html?express=1";
  };

  return (
    <>
      <div className={"qv-scrim" + (product ? " open" : "")} onClick={onClose}></div>
      <div className={"xc-modal" + (product ? " open" : "")}>
        <header className="xc-head">
          <div>
            <div className="xc-title">{placed ? "Order placed ✓" : "Express Checkout"}</div>
            <div className="xc-sub">{placed ? "Confirmation sent to your inbox" : "One screen · Twenty seconds"}</div>
          </div>
          <button className="bag-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M6 6l12 12M18 6 6 18" strokeLinecap="round"/></svg>
          </button>
        </header>
        <div className="xc-body">
          <div className="xc-item">
            <div className="xc-item-art">
              <ProductVisual image={product.image} variant={product.variant} brand={b} product={{ name: product.italic }}
                             liquid={product.liquid} liquidTop={product.liquidTop} />
            </div>
            <div>
              <div className="xc-item-brand">{b.name}</div>
              <div className="xc-item-name">{product.name} <em>{product.italic}</em></div>
              <div className="xc-item-meta">{product.size} · Qty {product.qty || 1}</div>
            </div>
            <div className="xc-item-price">{fmtLKR(now)}</div>
          </div>

          {!placed && <>
            <div className="xc-field">
              <label>Email</label>
              <input className="xc-input" type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div className="xc-field">
              <label>Delivery</label>
              <div className="xc-options">
                <button className={"xc-opt" + (delivery === "std" ? " active" : "")} onClick={() => setDelivery("std")}>
                  <span className="opt-name">Island Standard</span>
                  <span className="opt-sub">2–4 business days</span>
                  <span className="opt-price">{now >= 25000 ? "Free" : "LKR 850"}</span>
                </button>
                <button className={"xc-opt" + (delivery === "express" ? " active" : "")} onClick={() => setDelivery("express")}>
                  <span className="opt-name">Express</span>
                  <span className="opt-sub">Next day · Colombo</span>
                  <span className="opt-price">LKR 1,500</span>
                </button>
              </div>
            </div>

            <div className="xc-field">
              <label>Payment</label>
              <div className="xc-options">
                <button className={"xc-opt" + (payment === "card" ? " active" : "")} onClick={() => setPayment("card")}>
                  <span className="opt-name">Card</span>
                  <span className="opt-sub">Visa · Mastercard · Amex</span>
                </button>
                <button className={"xc-opt" + (payment === "cod" ? " active" : "")} onClick={() => setPayment("cod")}>
                  <span className="opt-name">Cash on Delivery</span>
                  <span className="opt-sub">+ LKR 200 fee</span>
                </button>
                <button className={"xc-opt" + (payment === "koko" ? " active" : "")} onClick={() => setPayment("koko")}>
                  <span className="opt-name">KOKO</span>
                  <span className="opt-sub">3 payments · 0% interest</span>
                </button>
              </div>
            </div>
          </>}

          <div className="xc-totals">
            <div className="xc-tot-row"><span>Subtotal</span><span>{fmtLKR(now)}</span></div>
            <div className="xc-tot-row"><span>Delivery</span><span>{shipping === 0 ? "Free" : fmtLKR(shipping)}</span></div>
            <div className="xc-tot-row grand"><span>Total</span><b>{fmtLKR(total)}</b></div>
          </div>

          {!placed && <>
            {err && <div className="auth-error" style={{margin:"6px 0"}}>{err}</div>}
            <button className="btn-solid xc-place" onClick={place} disabled={!email}>
              Continue to Checkout <span className="arr">⟶</span>
            </button>
            <div className="xc-secure">Encrypted &middot; Secure checkout</div>
          </>}
        </div>
      </div>
    </>
  );
}

/* ── ShopPage main ─────────────────────────────── */
function ShopPage() {
  const initial = parseHash();
  const [filters, setFilters] = React.useState({
    category: initial.cat || null,
    brand:    initial.brand || null,
    concern:  initial.concern || null,
    skin:     initial.skin || null,
    sale:     initial.sale === "1",
    newOnly:  initial.new === "1",
    ceylonOnly: initial.ceylon === "1",
  });
  const [sort, setSort] = React.useState("featured");
  const [cols, setCols] = React.useState(4);
  const [quickView, setQuickView] = React.useState(null);
  const [checkoutItem, setCheckoutItem] = React.useState(null);
  const [bagOpen, setBagOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [mfsOpen, setMfsOpen] = React.useState(false);  // legacy unused
  const [fdOpen, setFdOpen] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const [wishlist, setWishlist] = React.useState(new Set());

  const [livePR, setLivePR] = React.useState(null);
  React.useEffect(() => {
    window.api.get("/api/products?limit=500")
      .then(rs => {
        // Normalize API shape to match local PRODUCTS shape (sale, off, isNew, etc).
        const norm = rs.map(p => ({
          ...p,
          liquidTop: p.liquidTop,
          isNew: !!p.isNew,
          isBestseller: !!p.isBestseller,
        }));
        setLivePR(norm);
      })
      .catch(() => setLivePR(null));
  }, []);
  const loading = livePR === null;
  const sourcePR = livePR || []; // never fall back to the static demo set

  const filtered = React.useMemo(
    () => sortProducts(filterProducts(sourcePR, filters), sort),
    [filters, sort, sourcePR]
  );

  const activeCount =
    (filters.category ? 1 : 0) + (filters.brand ? 1 : 0) + (filters.concern ? 1 : 0) +
    (filters.skin ? 1 : 0) + (filters.sale ? 1 : 0) + (filters.newOnly ? 1 : 0) + (filters.ceylonOnly ? 1 : 0);

  const addToBag = async (product) => {
    try {
      await window.api.post("/api/cart/items", {
        product_id: product.id,
        qty: product.qty || 1,
        size: product.size,
      });
      window.dispatchEvent(new CustomEvent("cart:changed"));
      setToast(product.name + " " + product.italic);
      setTimeout(() => setToast(null), 2200);
    } catch (e) {
      setToast(e.message || "Couldn't add");
      setTimeout(() => setToast(null), 2200);
    }
  };
  const toggleWish = async (id) => {
    const me = await window.api.get("/api/auth/me").catch(() => ({ user: null }));
    if (!me.user) {
      window.location.href = "login.html?next=" + encodeURIComponent(window.location.pathname + window.location.hash);
      return;
    }
    const on = wishlist.has(id);
    setWishlist(prev => {
      const s = new Set(prev);
      on ? s.delete(id) : s.add(id);
      return s;
    });
    try {
      if (on) await window.api.del("/api/wishlist/" + encodeURIComponent(id));
      else    await window.api.post("/api/wishlist/" + encodeURIComponent(id));
      window.dispatchEvent(new CustomEvent("wishlist:changed"));
    } catch {}
  };

  React.useEffect(() => {
    window.api.get("/api/wishlist")
      .then(items => setWishlist(new Set((items || []).map(i => i.id))))
      .catch(() => {});
  }, []);

  // Re-read filters from URL hash whenever it changes — so clicking the Sale
  // dropdown (or any in-page nav) actually updates the grid while staying on Shop.html.
  React.useEffect(() => {
    const onHash = () => {
      const f = parseHash();
      setFilters({
        category:   f.cat || null,
        brand:      f.brand || null,
        concern:    f.concern || null,
        sale:       f.sale === "1",
        newOnly:    f.new === "1",
        ceylonOnly: f.ceylon === "1",
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Tweak theme
  const tweakDefaults = /*EDITMODE-BEGIN*/{
    "theme": "cabinet",
    "shopName": "VITRINE",
    "shopTagline": "Beauty, Hand-Picked"
  }/*EDITMODE-END*/;
  const [tw, setTw] = useTweaks(tweakDefaults);
  React.useEffect(() => {
    document.documentElement.dataset.theme = tw.theme;
  }, [tw.theme]);

  return (
    <>
      <Announce />
      <Nav
        name={tw.shopName} tagline={tw.shopTagline}
        onSearch={() => setSearchOpen(true)}
        onBag={() => setBagOpen(true)}
      />
      <Breadcrumb filters={filters} />
      <ShopHeader filters={filters} count={filtered.length} />
      <FilterBar
        sort={sort} cols={cols}
        setSort={setSort} setCols={setCols}
        onFiltersOpen={() => setFdOpen(true)}
        activeCount={activeCount}
        results={filtered.length}
      />
      <ActiveFilters filters={filters} setFilters={setFilters} sort={sort} />

      <div className="shop-grid-wrap">
        {loading ? (
          <div className="shop-loading" style={{ padding: "90px 0", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.14em", color: "var(--ink-3)" }}>LOADING THE SHELF…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="glyph">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" strokeLinecap="round"/><path d="m20 20-4-4" strokeLinecap="round"/></svg>
            </div>
            <span className="eyebrow">Empty Shelf</span>
            <h2>No matches in <em>this corner.</em></h2>
            <p>Try clearing a filter or two — or wander into the Ceylon brands, where everyone tends to find something.</p>
            <div className="actions">
              <button className="btn-solid" onClick={() => setFilters({ category: null, brand: null, concern: null, skin: null, sale: false, newOnly: false, ceylonOnly: false })}>Clear all filters</button>
              <a className="btn-ghost" href="Shop.html#ceylon=1">Browse Ceylon ⟶</a>
            </div>
            <div className="ornament">
              <span className="line"></span><span>Or visit · 33 Galle Face Terrace</span><span className="line"></span>
            </div>
          </div>
        ) : (
          <div className="shop-grid" data-cols={cols}>
            {filtered.map((p, i) => (
              <ProductTile
                key={p.id} p={p} idx={i}
                onOpen={() => setQuickView(p)}
                onQuickAdd={(p) => addToBag(p)}
                wishOn={wishlist.has(p.id)}
                onWish={() => toggleWish(p.id)}
              />
            ))}
          </div>
        )}
        {!loading && (
          <div className="shop-foot">
            <div className="count-line">Showing {filtered.length} product{filtered.length === 1 ? "" : "s"}</div>
          </div>
        )}
      </div>

      <section className="you-may">
        <h3>More on <em>sale</em></h3>
        <div className="edit-scroller-wrap">
          <div className="edit-scroller">
            {sourcePR.filter(p => p.sale).slice(0, 10).map((p) => {
              const b = BRANDS[p.brand] || { name: p.brandName, loc: p.brandLoc, accent: undefined, font: "Italiana, serif" };
              const now = p.sale || p.price;
              return (
                <article className="product" key={p.id} onClick={() => setQuickView(p)}>
                  <div className="product-tag" style={{color:"var(--wine)"}}>−{p.off}% off</div>
                  <div className="product-stage" data-monogram={(b.name || "")[0]} style={{"--brand-accent": b.accent}}>
                    <ProductVisual image={p.image} variant={p.variant} brand={b} product={{name: p.italic}} liquid={p.liquid} liquidTop={p.liquidTop}/>
                  </div>
                  <div className="product-brand">{b.name}</div>
                  <h3 className="product-name">{p.name} <em>{p.italic}</em></h3>
                  <div className="product-row">
                    <div className="product-meta">{p.sub}</div>
                    <div className="product-price" style={{display:"flex",alignItems:"baseline",gap:6}}>
                      <span>{fmtLKR(now)}</span>
                      <span style={{fontSize:10,color:"var(--ink-3)",textDecoration:"line-through"}}>{fmtLKR(p.price)}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <BrandStrip />
      <Footer name={tw.shopName} tagline={tw.shopTagline} />

      <QuickView
        product={quickView}
        onClose={() => setQuickView(null)}
        onAddToBag={(p) => { addToBag(p); setQuickView(null); }}
        onBuyNow={(p) => { setQuickView(null); setCheckoutItem(p); }}
        wishOn={quickView && wishlist.has(quickView.id)}
        onWish={() => quickView && toggleWish(quickView.id)}
      />
      <ExpressCheckout
        product={checkoutItem}
        onClose={() => setCheckoutItem(null)}
        onDone={() => setTimeout(() => setCheckoutItem(null), 1800)}
      />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <BagDrawer open={bagOpen} onClose={() => setBagOpen(false)} />
      <FilterDrawer
        open={fdOpen} onClose={() => setFdOpen(false)}
        filters={filters} setFilters={setFilters}
        results={filtered.length}
      />
      <Toast msg={toast} />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<ShopPage />);
