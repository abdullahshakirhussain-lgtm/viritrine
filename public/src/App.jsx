// App.jsx — the full page composition.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "ceylon",
  "showSideMarks": true,
  "shopName": "VITRINE",
  "shopTagline": "Beauty, Hand-Picked"
}/*EDITMODE-END*/;

/* ── Reveal hook ─────────────────────────────────────── */
function useReveal() {
  React.useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("in"); });
    }, { threshold: 0.04, rootMargin: "0px 0px -40px 0px" });
    document.querySelectorAll(".reveal").forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ── Announce bar ────────────────────────────────────── */
const ANNOUNCE_FALLBACK = ["Free delivery across Sri Lanka on orders over LKR 25,000"];
function Announce() {
  const [texts, setTexts] = React.useState(ANNOUNCE_FALLBACK);
  React.useEffect(() => {
    window.api?.get("/api/announcements")
      .then(rows => { if (rows?.length) setTexts(rows.map(r => r.text)); })
      .catch(() => {});
  }, []);
  const items = [...texts, ...texts, ...texts];
  return (
    <div className="announce">
      <div className="announce-track">
        {items.map((t, i) => (
          <span key={i}><span>{t}</span><span className="dot"></span></span>
        ))}
      </div>
    </div>
  );
}

/* ── Nav is loaded from src/nav.jsx ──────────────────── */
/* (Defines Nav, ShopMega, SaleMenu, AccountMenu, SearchOverlay, BagDrawer, MobileMenu) */

/* ── Hero (split carousel + swipe) ──────────────────── */
const HERO_SLIDES = [
  {
    productId: "ay-01",
    brand: "ayana", tag: "Pick of the week",
    title: "Tea", italic: "Glow", variant: "jar",
    liquid: "#1F4538", liquidTop: "#9BB7A7",
    copy: "Ceylon green tea, gotu kola, and saffron pressed into a featherweight day cream. Made in Kandy, in small batches.",
    price: "LKR 24,500", size: "50 ML · DAY CREAM",
  },
  {
    productId: "fl-01",
    brand: "florent", tag: "Iconic, since 1962",
    title: "Red", italic: "No. 12", variant: "compact",
    liquid: "#7A1B2F", liquidTop: "#A23148",
    copy: "Florent's house red — a matte velvet the colour of theatre curtains, in a brass compact that ages like a good clock.",
    price: "LKR 16,500", size: "3.5 G · LIP",
  },
  {
    productId: "sl-01",
    brand: "saint", tag: "Bestseller of the season",
    title: "Gold", italic: "Oil", variant: "dropper",
    liquid: "#C49453", liquidTop: "#F0DBA3",
    copy: "Forty-two plant actives in a weightless oil — for skin that reads as lit from within. Quietly loved for forty years.",
    price: "LKR 48,000", size: "30 ML · DAY OIL",
  },
  {
    productId: "no-01",
    brand: "noire", tag: "Arrived this month",
    title: "Velvet", italic: "Black", variant: "flacon",
    liquid: "#1A1410", liquidTop: "#5A4A3D",
    copy: "Black iris, soft leather, and a whisper of incense from a Milanese house known for one rule — never more than seven notes.",
    price: "LKR 86,000", size: "75 ML · PERFUME",
  },
];

async function addToBag(productId, qty = 1) {
  if (!window.api) return;
  try {
    await window.api.post("/api/cart/items", { product_id: productId, qty });
    window.dispatchEvent(new CustomEvent("cart:changed"));
    window.flash && window.flash("Added to bag");
  } catch (e) {
    window.flash && window.flash(e.message || "Couldn't add", { err: true });
  }
}
window.addToBag = addToBag;

function Hero() {
  const [idx, setIdx] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  // Starts null = "not loaded yet" so we don't paint static fallback content.
  const [slides, setSlides] = React.useState(null);
  const touchStartX = React.useRef(null);
  const touchDeltaX = React.useRef(0);

  React.useEffect(() => {
    window.api?.get("/api/hero-slides")
      .then(rows => {
        // Normalize API shape → the existing render shape. Empty array = clear.
        setSlides((rows || []).map(p => ({
          productId: p.id,
          brand: p.brand,
          tag: p.customTag || (p.isBestseller ? "Bestseller" : p.isNew ? "New arrival" : "Featured"),
          title: p.name,
          italic: p.italic,
          variant: p.variant,
          liquid: p.liquid,
          liquidTop: p.liquidTop,
          copy: p.copy,
          price: window.fmtLKR ? window.fmtLKR(p.sale || p.price) : ("LKR " + (p.sale || p.price)),
          size: ((p.size || "") + " · " + (p.sub || "")).toUpperCase(),
          image: p.image,
          accent: p.brandName && BRANDS[p.brand]?.accent,
        })));
      })
      .catch(() => setSlides([]));
  }, []);

  // Guard every `slides.length` against the initial null state.
  const len = slides ? slides.length : 0;
  React.useEffect(() => {
    if (paused || len < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % len), 5500);
    return () => clearInterval(t);
  }, [paused, len]);

  const go = (dir) => { if (len > 0) setIdx(i => (i + dir + len) % len); };

  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
    setPaused(true);
  };
  const onTouchMove = (e) => {
    if (touchStartX.current == null) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  };
  const onTouchEnd = () => {
    const dx = touchDeltaX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touchStartX.current = null; touchDeltaX.current = 0;
    setTimeout(() => setPaused(false), 800);
  };

  if (slides == null || slides.length === 0) return null;
  const safeIdx = idx % slides.length;
  const active = slides[safeIdx];
  const b = BRANDS[active.brand] || { name: "", font: "Italiana, serif" };
  const houseCls =
    b.font?.startsWith("Cormorant") ? "italic" :
    b.font?.startsWith("Manrope") ? "sans" : "";

  return (
    <section className="hero" data-screen-label="01 Hero"
             onMouseEnter={() => setPaused(true)}
             onMouseLeave={() => setPaused(false)}
             onTouchStart={onTouchStart}
             onTouchMove={onTouchMove}
             onTouchEnd={onTouchEnd}>
      <div className="hero-meta tl">
        <div>Issue <b>21</b></div>
        <div>Spring &middot; Summer 2026</div>
      </div>
      <div className="hero-meta tr">
        <div>Colombo &middot; 03</div>
        <div><b>42 Brands &middot; 318 Pieces</b></div>
      </div>

      <div className="hero-split">
        <div className="hero-caption">
          <div className="hero-tag"><span className="pulse"></span>{active.tag}</div>
          <div className={"hero-house " + houseCls} key={"h-" + idx}>{b.name}</div>
          <h1 className="hero-title-c" key={"t-" + idx}>
            {active.title} <em>{active.italic}</em>
          </h1>
          <p className="hero-copy" key={"c-" + idx}>{active.copy}</p>
          <div className="hero-row">
            <div className="hero-price">{active.price}<small>{active.size}</small></div>
          </div>
          <div className="hero-row" style={{ marginTop: 4 }}>
            <button className="btn-solid" onClick={() => addToBag(active.productId, 1)}>
              Add to Bag
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <a className="btn-ghost" href={"/product/" + active.productId}>View Details</a>
          </div>
          <div className="hero-dots" role="tablist">
            {slides.map((_, i) => (
              <button key={i} className={"hero-dot" + (i === safeIdx ? " active" : "")}
                      onClick={() => setIdx(i)} aria-label={"Slide " + (i + 1)}></button>
            ))}
          </div>
        </div>

        <div className="hero-stage-c">
          <div className="hero-stage-frame">
            <div className="hero-stage-bg"></div>
            <div className="hero-slide-tag">{b.name}</div>
            <div className="hero-slide-tag r">{String(safeIdx + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</div>
            {slides.map((s, i) => {
              const sb = BRANDS[s.brand] || { name: "" };
              return (
                <div key={i} className={"hero-slide" + (i === safeIdx ? " active" : "")}>
                  <ProductVisual
                    image={s.image}
                    variant={s.variant}
                    brand={sb}
                    product={{ name: s.italic }}
                    liquid={s.liquid}
                    liquidTop={s.liquidTop}
                  />
                </div>
              );
            })}
            <div className="hero-slide-counter">
              <span>{String(safeIdx + 1).padStart(2, "0")}</span>
              <small>/ {String(slides.length).padStart(2, "0")}</small>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Brand marquee ──────────────────────────────────── */
function BrandStrip() {
  const [rows, setRows] = React.useState([]);
  React.useEffect(() => {
    window.api?.get("/api/brands").then(setRows).catch(() => setRows([]));
  }, []);
  if (!rows.length) return null;
  const dup = [...rows, ...rows, ...rows];
  return (
    <div className="brand-strip" aria-hidden="true">
      <div className="brand-track">
        {dup.map((b, i) => {
          const cls =
            b.font?.startsWith("Cormorant") ? "it" :
            b.font?.startsWith("Manrope") ? "sn" : "";
          return (
            <span key={i}>
              <span className={cls}>{b.name}</span>
              <span className="sep"></span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ── The Edit (horizontal scroller) ─────────────────── */
function TheEdit() {
  const [items, setItems] = React.useState([]);
  React.useEffect(() => {
    window.api?.get("/api/editorial").then(setItems).catch(() => setItems([]));
  }, []);
  if (!items.length) return null;
  return (
    <section className="edit" id="edit" data-screen-label="02 Shop">
      <header className="section-head reveal">
        <div className="num">01</div>
        <h2 className="title">Shop <em>the Shelf</em></h2>
        <div className="meta">{items.length} piece{items.length === 1 ? "" : "s"}<br/>{new Set(items.map(i => i.brand)).size} brands</div>
      </header>
      <div className="edit-scroller-wrap">
        <div className="edit-scroller">
          {items.map((p, i) => {
            const b = BRANDS[p.brand] || { name: p.brandName, accent: undefined };
            const tag = p.editorTag || (p.isNew ? "New" : p.isBestseller ? "Bestseller" : "Pick");
            const price = window.fmtLKR(p.sale || p.price);
            return (
              <a className="product" key={p.id} href={"/product/" + encodeURIComponent(p.id)} style={{textDecoration:"none"}}>
                <div className={"product-tag" + (tag === "Pick" || tag === "Iconic" ? " gold" : "")}>{tag}</div>
                <div className="product-num">{String(i + 1).padStart(2, "0")}</div>
                <div className="product-stage" data-monogram={(b.name || "")[0]} style={{"--brand-accent": b.accent}}>
                  <ProductVisual image={p.image} variant={p.variant} brand={b} product={{ name: p.italic }} liquid={p.liquid} liquidTop={p.liquidTop} />
                </div>
                <div className="product-brand">{b.name}</div>
                <h3 className="product-name">{p.name} <em>{p.italic}</em></h3>
                <div className="product-row">
                  <div className="product-meta">{p.sub || p.category}</div>
                  <div className="product-price">{price}</div>
                </div>
                <div className="product-cta"><span>View</span><span className="arr">⟶</span></div>
              </a>
            );
          })}
        </div>
      </div>
      <div className="edit-scroll-hint">
        <span className="line"></span>
        <span>⟵ Swipe the shelf ⟶</span>
        <span className="line"></span>
      </div>
    </section>
  );
}

/* ── New Arrivals (latest products by date) ─────────── */
function NewArrivals() {
  const [items, setItems] = React.useState([]);
  React.useEffect(() => {
    window.api?.get("/api/products/new-arrivals?limit=8").then(setItems).catch(() => setItems([]));
  }, []);
  if (items.length < 2) return null;       // hide unless we have a meaningful rail
  return (
    <section className="edit" id="new-arrivals">
      <header className="section-head reveal">
        <div className="num">02</div>
        <h2 className="title">Just <em>In</em></h2>
        <div className="meta">{items.length} latest piece{items.length === 1 ? "" : "s"}<br/>added to the shop</div>
      </header>
      <div className="edit-scroller-wrap">
        <div className="edit-scroller">
          {items.map((p, i) => {
            const b = BRANDS[p.brand] || { name: p.brandName, accent: undefined };
            return (
              <a className="product" key={p.id} href={"/product/" + encodeURIComponent(p.id)} style={{textDecoration:"none"}}>
                <div className="product-tag">New</div>
                <div className="product-num">{String(i + 1).padStart(2, "0")}</div>
                <div className="product-stage" data-monogram={(b.name || "")[0]} style={{"--brand-accent": b.accent}}>
                  <ProductVisual image={p.image} variant={p.variant} brand={b} product={{ name: p.italic }} liquid={p.liquid} liquidTop={p.liquidTop} />
                </div>
                <div className="product-brand">{b.name}</div>
                <h3 className="product-name">{p.name} <em>{p.italic}</em></h3>
                <div className="product-row">
                  <div className="product-meta">{p.sub || p.category}</div>
                  <div className="product-price">{window.fmtLKR(p.sale || p.price)}</div>
                </div>
                <div className="product-cta"><span>View</span><span className="arr">⟶</span></div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── Sale (replaces Bestsellers) ────────────────────── */
function SaleSection() {
  const [items, setItems] = React.useState([]);
  React.useEffect(() => {
    window.api?.get("/api/products?sale=1&sort=off-desc&limit=8").then(setItems).catch(() => setItems([]));
  }, []);
  if (!items.length) return null;
  const maxOff = items.reduce((m, p) => Math.max(m, p.off || 0), 0);
  return (
    <section className="sale-section" id="sale" data-screen-label="03 Sale">
      <div className="shell">
        <header className="section-head reveal">
          <div className="num">02</div>
          <h2 className="title">The <em>Sale</em></h2>
          <div className="meta">Up to {maxOff}% off<br/>While stocks last</div>
        </header>
        <div className="sale-banner reveal">
          <div className="lede">Hand-picked, <em>marked down.</em></div>
          <div className="end">{items.length} piece{items.length === 1 ? "" : "s"} on sale</div>
        </div>
        <div className="sale-grid">
          {items.map((p) => {
            const b = BRANDS[p.brand] || { name: p.brandName };
            return (
              <article className="sale-card" key={p.id}>
                <div className="sale-off">−{p.off}%</div>
                <div className="sale-stage" data-monogram={(b.name || "")[0]} style={{"--brand-accent": b.accent}}>
                  <ProductVisual image={p.image} variant={p.variant} brand={b} product={{ name: p.italic }}
                                 liquid={p.liquid} liquidTop={p.liquidTop} />
                </div>
                <div className="sale-info">
                  <div className="sale-brand">{b.name}</div>
                  <h3 className="sale-name">{p.name} <em>{p.italic}</em></h3>
                </div>
                <div className="sale-row">
                  <div className="sale-prices">
                    <span className="sale-now">{window.fmtLKR(p.sale)}</span>
                    <span className="sale-was">{window.fmtLKR(p.price)}</span>
                  </div>
                  <button className="sale-add" aria-label="Add to bag" onClick={() => addToBag(p.id, 1)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── Brands wall (logo grid) ────────────────────────── */
function LogoWall() {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    window.api?.get("/api/brands").then(setRows).catch(() => setRows([]));
  }, []);
  if (rows === null) return null;          // still loading
  if (rows.length === 0) return null;       // no brands → hide section entirely
  return (
    <section className="logo-wall" id="brands" data-screen-label="04 Brands">
      <div className="shell">
        <header className="section-head reveal">
          <div className="num">03</div>
          <h2 className="title">Our <em>Brands</em></h2>
          <div className="meta">{rows.length} brand{rows.length === 1 ? "" : "s"}<br/>currently in store</div>
        </header>
        <div className="logo-grid">
          {rows.map((b) => {
            const cls =
              b.font?.startsWith("Cormorant") ? "italic" :
              b.font?.startsWith("Manrope") ? "sans" : "upper";
            const isCeylon = b.loc === "Colombo" || b.loc === "Galle";
            return (
              <a className={"logo-tile" + (isCeylon ? " ceylon" : "")}
                 key={b.key}
                 href={"/brand/" + b.key}>
                <div className={"mark " + cls}>{b.name}</div>
                <div className="loc">{b.loc}</div>
              </a>
            );
          })}
          <a className="logo-tile cta" href="Shop.html">
            <div className="cta-num" style={{fontSize:32,letterSpacing:"0.04em"}}>SHOP</div>
            <div className="cta-sub">All pieces<br/>in store</div>
            <div className="cta-arr">⟶</div>
          </a>
          <a className="logo-tile cta" href="Shop.html#new=1">
            <div className="cta-num" style={{fontSize:32,letterSpacing:"0.04em"}}>NEW</div>
            <div className="cta-sub">Arrivals<br/>this season</div>
            <div className="cta-arr">⟶</div>
          </a>
        </div>
        <div className="logo-all">
          <a href="Shop.html" className="btn-ghost">See all brands &nbsp;⟶</a>
        </div>
      </div>
    </section>
  );
}

/* ── Stories ─────────────────────────────────────────── */
function Journal() {
  const [articles, setArticles] = React.useState([]);
  React.useEffect(() => {
    window.api?.get("/api/journal?limit=3").then(setArticles).catch(() => setArticles([]));
  }, []);
  if (!articles.length) return null;
  const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  return (
    <section className="journal" id="journal" data-screen-label="05 Stories">
      <div className="shell">
        <header className="section-head reveal">
          <div className="num">04</div>
          <h2 className="title">The <em>Stories</em></h2>
          <div className="meta">Notes from<br/>the shop</div>
        </header>
        <div className="journal-grid">
          {articles.map((a, i) => (
            <a className={"article reveal d" + (i + 1)} key={a.id} href={"/journal/" + encodeURIComponent(a.slug)} style={{color:"inherit",textDecoration:"none"}}>
              <div className="article-cover">
                {a.tag && <span className="tag">{a.tag}</span>}
                <div className="accent"></div>
                {a.cover_image
                  ? <img src={a.cover_image} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",zIndex:0}} />
                  : <div className="glyph">{a.glyph || (a.title || "?")[0]}</div>}
              </div>
              <div className="article-meta"><span>{a.tag || "Journal"}</span><span>{fmtDate(a.published_at)}</span></div>
              <h3 className="article-title">{a.title} <em>{a.italic}</em></h3>
              <p className="article-excerpt">{a.excerpt}</p>
            </a>
          ))}
        </div>
        <div style={{display:"flex",justifyContent:"center",marginTop:32}}>
          <a href="journal.html" className="btn-ghost">All stories &nbsp;⟶</a>
        </div>
      </div>
    </section>
  );
}

/* ── Newsletter ─────────────────────────────────────── */
function Newsletter() {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [copy, setCopy] = React.useState({
    heading: "The Monthly Letter.",
    heading_em: "Monthly",
    body: "One email a month — early access to new arrivals, shop events at Galle Face, and the occasional ingredient story. Never more.",
  });
  React.useEffect(() => {
    window.api?.get("/api/settings").then(s => {
      setCopy({
        heading:    s["newsletter.heading"]    || copy.heading,
        heading_em: s["newsletter.heading_em"] || copy.heading_em,
        body:       s["newsletter.body"]       || copy.body,
      });
    }).catch(() => {});
  }, []);
  // Render the heading with the highlighted word in italic display style.
  const renderHeading = () => {
    if (!copy.heading_em) return copy.heading;
    const parts = copy.heading.split(new RegExp("(" + copy.heading_em.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")"));
    return parts.map((p, i) => p === copy.heading_em ? <em key={i}>{p}</em> : <React.Fragment key={i}>{p}</React.Fragment>);
  };
  const submit = async (e) => {
    e.preventDefault(); if (!email) return; setErr("");
    try { await window.api.post("/api/newsletter", { email }); setSent(true); }
    catch (ex) { setErr(ex.message || "Couldn't subscribe"); }
  };
  return (
    <section className="newsletter" data-screen-label="06 Letter">
      <h2 className="reveal">{renderHeading()}</h2>
      <p className="reveal d1">{copy.body}</p>
      <form className="news-form reveal d2" onSubmit={submit}>
        {sent
          ? <input value="Welcome — thank you." disabled />
          : <input type="email" required placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} />
        }
        <button type="submit">{sent ? "Sent ✦" : "Subscribe ⟶"}</button>
      </form>
      {err && <p className="reveal d3" style={{color:"var(--wine)",fontSize:13,marginTop:8}}>{err}</p>}
    </section>
  );
}

/* ── Footer ─────────────────────────────────────────── */
function Footer({ name, tagline }) {
  const [s, setS] = React.useState(null);
  const [locs, setLocs] = React.useState([]);
  React.useEffect(() => {
    window.api?.get("/api/settings").then(setS).catch(() => {});
    window.api?.get("/api/locations").then(setLocs).catch(() => {});
  }, []);
  const founded = s?.["site.founded"] || "1998";
  const blurb   = s?.["site.footer_blurb"] || "";
  const phone   = s?.["site.phone"] || "";
  const email   = s?.["site.email"] || "";
  const ig      = s?.["site.instagram"]; const pi = s?.["site.pinterest"]; const wa = s?.["site.whatsapp"];
  const year    = new Date().getFullYear();
  return (
    <footer className="footer" data-screen-label="07 Footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <div className="mark">{name}<small>{tagline} &middot; {locs[0]?.name?.split("—")[1]?.trim() || "Colombo"} &middot; Since {founded}</small></div>
          <p>{blurb}</p>
        </div>
        <div className="footer-col">
          <h5>Shop</h5>
          <a href="Shop.html#cat=fragrance">Perfume</a><a href="Shop.html#cat=skincare">Skin</a><a href="Shop.html#cat=makeup">Makeup</a><a href="Shop.html#cat=body">Body &amp; Bath</a><a href="Shop.html">Gift Sets</a>
        </div>
        <div className="footer-col">
          <h5>Brands</h5>
          <a href="/#brands">All Brands</a><a href="Shop.html#new=1">New Arrivals</a><a href="Shop.html#ceylon=1">Ceylon Brands</a><a href="Shop.html#sale=1">Limited Editions</a><a href="Shop.html">Only at {name}</a>
        </div>
        <div className="footer-col">
          <h5>Help</h5>
          <a href="contact.html">Contact</a><a href="contact.html#delivery">Delivery</a><a href="contact.html#returns">Returns</a><a href="contact.html#gifting">Gift Wrapping</a><a href="contact.html#faq">FAQ</a>
        </div>
        <div className="footer-col">
          <h5>Visit</h5>
          {locs.length > 0 ? locs.slice(0, 2).map(l => (
            <a key={l.id} href="contact.html#locations">{l.name}{l.address ? <><br/><span style={{color:"var(--ink-3)",fontSize:11}}>{l.address.split("\n")[0]}</span></> : null}</a>
          )) : <a href="contact.html">Locations</a>}
          {phone && <a href={"tel:" + phone.replace(/\s/g, "")}>{phone}</a>}
          {email && <a href={"mailto:" + email}>{email}</a>}
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {year} {name} &middot; Made in Sri Lanka</span>
        <div className="socials">
          {ig && <a href={ig} target="_blank">Instagram</a>}
          {pi && <a href={pi} target="_blank">Pinterest</a>}
          {wa && <a href={wa} target="_blank" onClick={() => window.track && window.track("whatsapp_click", { meta: { where: "footer" } })}>WhatsApp</a>}
        </div>
      </div>
    </footer>
  );
}

/* ── Tweaks palette ─────────────────────────────────── */
const THEMES = [
  { name: "ceylon",   label: "Ceylon",   swatch: ["#EFE6D2", "#6B1E3F", "#1F4538"] },
  { name: "noir",     label: "Midnight", swatch: ["#0E0907", "#C9456B", "#D9BD86"] },
  { name: "bordeaux", label: "Bordeaux", swatch: ["#2A0E1A", "#E0708C", "#F4E8DD"] },
];
function ThemePicker({ value, onChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, padding: "6px 0 4px" }}>
      {THEMES.map(t => {
        const active = t.name === value;
        return (
          <button
            key={t.name} type="button"
            onClick={() => onChange(t.name)}
            style={{
              cursor: "pointer",
              border: active ? "1.5px solid #111" : "1px solid rgba(0,0,0,0.18)",
              background: t.swatch[0],
              padding: 10, borderRadius: 8,
              display: "flex", alignItems: "center", gap: 12, outline: "none",
            }}
            aria-pressed={active}
          >
            <span style={{ display: "flex", gap: 3 }}>
              <span style={{ width: 22, height: 28, background: t.swatch[0], border: "1px solid rgba(0,0,0,0.15)", borderRadius: 2 }}></span>
              <span style={{ width: 10, height: 28, background: t.swatch[1], borderRadius: 2 }}></span>
              <span style={{ width: 10, height: 28, background: t.swatch[2], borderRadius: 2 }}></span>
            </span>
            <span style={{
              fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase",
              color: t.swatch[2], fontWeight: 500, flex: 1, textAlign: "left",
            }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── App ─────────────────────────────────────────────── */
function App() {
  const [tw, setTw] = useTweaks(TWEAK_DEFAULTS);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [bagOpen, setBagOpen] = React.useState(false);
  useReveal();

  React.useEffect(() => {
    document.documentElement.dataset.theme = tw.theme;
  }, [tw.theme]);

  return (
    <>
      <Announce />
      <Nav
        name={tw.shopName}
        tagline={tw.shopTagline}
        onSearch={() => setSearchOpen(true)}
        onBag={() => setBagOpen(true)}
      />
      <Hero />
      <BrandStrip />
      <TheEdit />
      <NewArrivals />
      <SaleSection />
      <LogoWall />
      <Journal />
      <Newsletter />
      <Footer name={tw.shopName} tagline={tw.shopTagline} />

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <BagDrawer    open={bagOpen}    onClose={() => setBagOpen(false)} />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Theme">
          <ThemePicker value={tw.theme} onChange={v => setTw("theme", v)} />
        </TweakSection>
        <TweakSection label="Shop">
          <TweakText   label="Name"    value={tw.shopName}    onChange={v => setTw("shopName", v)} />
          <TweakText   label="Tagline" value={tw.shopTagline} onChange={v => setTw("shopTagline", v)} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
