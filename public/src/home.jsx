/* VITRINE homepage — "The Cabinet" (Claude Design), re-implemented in the repo's
   React and wired to the real APIs (settings, hero-slides, editorial, new-arrivals,
   sale, brands, journal, cart) + the membership page. Self-contained (own header /
   footer / bag drawer). The hero is a full-bleed cinematic clip reel (HeroStage);
   clips + posters are attached per hero-slide in the admin. */

const V = {
  paper: "#FFFFFF", ink: "#101010", wine: "#5A1430", glass: "#EEF2F1",
  rule: "#DCDCD6", ruleSoft: "#EFEFEA", muted: "#6E6E68", porcelain: "#F3F5F4",
  display: "Archivo, system-ui, sans-serif", body: "Newsreader, Georgia, serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
};
const PAD = "var(--vit-pad)";
const NAV_LINKS = [["SHOP", "/Shop.html"], ["NEW IN", "/Shop.html#new=1"], ["SALE", "/Shop.html#sale=1"], ["BRANDS", "/brands"], ["STORIES", "#journal"]];
const SKIN_BROWSE = [
  ["oily", "Oily", "Balance, oil-control & clarity"],
  ["dry", "Dry", "Rich moisture & barrier repair"],
  ["combination", "Combination", "Balance where you need it"],
  ["normal", "Normal", "Maintain & protect"],
  ["sensitive", "Sensitive", "Calm, gentle & fragrance-free"],
];
const money = (n) => (window.fmtLKR ? window.fmtLKR(n) : "LKR " + Number(n || 0).toLocaleString("en-US"));

const HERO_FALLBACK = [
  { eyebrow: "AUTHENTIC SKINCARE", title: "Delivered islandwide", dek: "The brands you trust — genuine, at your door across Sri Lanka.", cta: "Shop skincare", href: "/Shop.html#cat=skincare", objectLine: "300+ products · islandwide delivery", objectPrice: "", id: null },
  { eyebrow: "THE BRANDS YOU KNOW", title: "All in one place", dek: "CeraVe, The Ordinary, Cetaphil, Anua and more — one checkout.", cta: "Shop all brands", href: "/Shop.html", objectLine: "", objectPrice: "", id: null },
  { eyebrow: "NEW IN THIS WEEK", title: "Freshly restocked", dek: "K-beauty, skincare and the everyday essentials you reorder — added weekly.", cta: "Shop new", href: "/Shop.html#new=1", objectLine: "", objectPrice: "", id: null },
];

function money0(n){ return money(n); }

function Tile({ p, onAdd, h }) {
  return (
    <article style={{ flex: "0 0 auto" }}>
      <div className="vit-tile" style={{ position: "relative", overflow: "hidden", background: "linear-gradient(102deg,#FAFBFB," + V.porcelain + " 52%,#F7F9F8)", border: "1px solid #E4E9E8", borderBottom: "1px solid " + V.rule, height: h, display: "flex", alignItems: "flex-end", justifyContent: "center", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.92), inset 0 -40px 52px -40px rgba(16,16,16,0.12)" }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: "15%", height: 1, background: "rgba(16,16,16,0.11)" }}></div>
        <div style={{ width: "40%", height: "64%", marginBottom: "15%", background: "linear-gradient(96deg,#FFFFFF,#E7ECEB 58%,#F6F8F7)", border: "1px solid #E1E6E5", borderBottom: "none" }}></div>
        {p.image && <img src={p.image} alt={[p.name, p.italic, p.brandName && "— " + p.brandName].filter(Boolean).join(" ")} loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />}
        <div className="vit-glint" style={{ position: "absolute", top: "-30%", bottom: "-30%", left: "-60%", width: "70%", opacity: 0, transform: "translateX(-40%)", background: "linear-gradient(100deg,transparent 20%,rgba(255,255,255,0.86) 50%,transparent 80%)", pointerEvents: "none" }}></div>
      </div>
      <div style={{ borderTop: "1px solid " + V.ink }}></div>
      <h3 style={{ fontFamily: V.display, fontWeight: 600, fontSize: "clamp(15px,1.4vw,19px)", lineHeight: 1.1, letterSpacing: "-0.015em", margin: "16px 0 5px" }}><a href={"/product/" + p.id}>{p.name}</a></h3>
      <div style={{ fontFamily: V.body, fontWeight: 300, fontStyle: "italic", fontSize: 14, color: "#4A4A43" }}>{p.brandName}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 14, gap: 12 }}>
        <span style={{ fontFamily: V.mono, fontSize: 11, letterSpacing: "0.04em" }}>{money(p.sale || p.price)}</span>
        <button className="vit-add" onClick={() => onAdd(p)} style={{ fontFamily: V.mono, fontSize: 10, letterSpacing: "0.12em", background: "none", border: "none", borderBottom: "1px solid " + V.rule, padding: "0 0 2px", cursor: "pointer", color: V.muted }}>ADD</button>
      </div>
    </article>
  );
}

// Device flags read once: reduced-motion or Save-Data → poster only, no autoplay.
function useMediaFlags() {
  return React.useState(() => {
    let reduced = false, saveData = false;
    try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
    try { saveData = !!(navigator.connection && navigator.connection.saveData); } catch (e) {}
    return { reduced, saveData };
  })[0];
}

// The inert "glass case" gradient — the visual when a slide has no clip or poster.
function CaseGradient() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(116deg,#1E1E1C,#2C2C28 46%,#171716)" }}>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "rgba(255,255,255,0.05)" }}></div>
      <div style={{ position: "absolute", top: "-20%", bottom: "-20%", left: "-30%", right: "-30%", background: "linear-gradient(104deg,transparent 40%,rgba(255,255,255,0.10) 48%,rgba(255,255,255,0.03) 54%,transparent 60%)", animation: "vitGlint 11s cubic-bezier(0.5,0,0.5,1) infinite" }}></div>
    </div>
  );
}

/* Full-bleed cinematic hero player. Double-buffered: two <video> layers cross-fade,
   and only the active clip + the preloaded next clip are ever loaded (never all 10).
   Each clip plays once; on `ended` (or a backstop timer for poster-only slides) it
   calls onEnded so the parent advances. Under reduced-motion / Save-Data it shows
   posters only and advances on a timer. */
function HeroStage({ slides, idx, onEnded }) {
  const n = slides.length;
  const { reduced, saveData } = useMediaFlags();
  const staticOnly = reduced || saveData;
  const refs = [React.useRef(null), React.useRef(null)];
  const [top, setTop] = React.useState(0);
  const [slot, setSlot] = React.useState(() => [idx, n > 1 ? (idx + 1) % n : idx]);

  // React to the parent's idx: show the requested slide (already buffered as "next"
  // when possible), and preload the new upcoming clip into the hidden buffer.
  React.useEffect(() => {
    setSlot(prev => {
      const upcoming = n > 1 ? (idx + 1) % n : idx;
      const b = prev.indexOf(idx);
      if (b !== -1) {                 // requested slide is the preloaded buffer
        setTop(b);
        const ns = [...prev]; ns[b ^ 1] = upcoming; return ns;
      }
      const other = top ^ 1;          // manual jump to an unbuffered slide
      const ns = [...prev]; ns[other] = idx; ns[top] = upcoming;
      setTop(other); return ns;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  // Play the top buffer from the start; pause the other.
  React.useEffect(() => {
    refs.forEach((r, b) => {
      const v = r.current; if (!v) return;
      if (b === top && !staticOnly) {
        try { v.currentTime = 0; } catch (e) {}
        const p = v.play(); if (p && p.catch) p.catch(() => {});
      } else { try { v.pause(); } catch (e) {} }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top, slot, staticOnly]);

  // Advance: rely on the clip's own `ended`, with a backstop timer that also drives
  // poster-only slides. Single-slide heroes loop and never advance.
  React.useEffect(() => {
    if (n <= 1) return;
    const s = slides[slot[top]] || {};
    const hasVideo = !!s.video && !staticOnly;
    const t = setTimeout(onEnded, hasVideo ? 12000 : 6000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top, slot, staticOnly]);

  return (
    <div data-vit-case="hero" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div data-vit-hero-zoom style={{ position: "absolute", inset: 0, willChange: "transform" }}>
        {[0, 1].map(b => {
          const s = slides[slot[b]] || {};
          const isTop = b === top;
          const useVideo = s.video && !staticOnly;
          return (
            <div key={b} style={{ position: "absolute", inset: 0, opacity: isTop ? 1 : 0, transition: "opacity 0.9s ease" }}>
              {useVideo
                ? <video ref={refs[b]} src={s.video} poster={s.poster || undefined} muted playsInline preload="auto" loop={n <= 1}
                    onEnded={() => { if (isTop && n > 1) onEnded(); }}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                : (s.poster
                    ? <img src={s.poster} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    : <CaseGradient />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Home() {
  const [settings, setSettings] = React.useState({});
  const [slides, setSlides] = React.useState(null);
  const [idx, setIdx] = React.useState(0);
  const [shelf, setShelf] = React.useState([]);
  const [arrivals, setArrivals] = React.useState([]);
  const [sale, setSale] = React.useState([]);
  const [brands, setBrands] = React.useState([]);
  const [journal, setJournal] = React.useState([]);
  const [ab, setAb] = React.useState(0);              // active brand index
  const [bag, setBag] = React.useState({ items: [], subtotal: 0, count: 0 });
  const [bagOpen, setBagOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const [email, setEmail] = React.useState("");
  const [subscribed, setSubscribed] = React.useState(false);
  const toastT = React.useRef(null);

  const loadBag = () => window.api.get("/api/cart").then(setBag).catch(() => {});

  React.useEffect(() => {
    window.api.get("/api/settings").then(setSettings).catch(() => {});
    window.api.get("/api/hero-slides").then(rows => {
      if (!rows || !rows.length) { setSlides(HERO_FALLBACK); return; }
      setSlides(rows.map(p => ({
        eyebrow: (p.customTag || (p.isNew ? "JUST LANDED" : "ON THE SHELF")).toUpperCase(),
        title: p.customTitle || p.name,
        dek: p.customDek || p.copy,
        cta: p.customCta || "Shop",
        href: p.customHref || (p.id ? "/product/" + p.id : "#shelf"),
        objectLine: p.id ? [p.name, p.size, p.brandLoc].filter(Boolean).join(" · ") : "",
        objectPrice: p.id ? money(p.sale || p.price) : "",
        video: p.customVideo || null,
        poster: p.customPoster || null,
        id: p.id,
      })));
    }).catch(() => setSlides(HERO_FALLBACK));
    window.api.get("/api/products?sort=bestselling&limit=30").then(r => setShelf(r || [])).catch(() => {});
    window.api.get("/api/products/new-arrivals?limit=8").then(r => setArrivals(r || [])).catch(() => {});
    window.api.get("/api/products?sale=1&sort=off-desc&limit=8").then(r => setSale(r || [])).catch(() => {});
    window.api.get("/api/brands").then(r => setBrands(r || [])).catch(() => {});
    window.api.get("/api/journal?limit=3").then(r => setJournal(r || [])).catch(() => {});
    loadBag();
    const onCart = () => loadBag();
    window.addEventListener("cart:changed", onCart);
    return () => window.removeEventListener("cart:changed", onCart);
  }, []);

  // Hero advancement is driven by HeroStage (a clip ends, or a poster-only slide's
  // timer fires) via onEnded → next slide. No standalone interval here.
  const advanceHero = React.useCallback(() => {
    setIdx(i => (slides && slides.length ? (i + 1) % slides.length : 0));
  }, [slides]);

  const addToBag = async (p) => {
    try {
      await window.api.post("/api/cart/items", { product_id: p.id, qty: 1 });
      window.dispatchEvent(new CustomEvent("cart:changed"));
      setToast({ name: p.name, brand: p.brandName });
      clearTimeout(toastT.current);
      toastT.current = setTimeout(() => setToast(null), 4200);
    } catch (e) {}
  };
  const stepLine = async (line, next) => {
    try {
      if (next <= 0) await window.api.del("/api/cart/items/" + line.lineId);
      else await window.api.patch("/api/cart/items/" + line.lineId, { qty: next });
      await loadBag(); window.dispatchEvent(new CustomEvent("cart:changed"));
    } catch {}
  };
  const subscribe = async (e) => {
    e.preventDefault(); if (!email) return;
    try { await window.api.post("/api/newsletter", { email }); setSubscribed(true); } catch {}
  };

  const freeOver = Number(settings["shipping.free_over_lkr"]) || 25000;
  const address = (settings["site.address_line2"] || "Colombo 06").toUpperCase();
  const deliveryNote = "ISLANDWIDE DELIVERY OVER " + money(freeOver);
  const subtotal = bag.subtotal || 0;
  const giftShort = Math.max(0, freeOver - subtotal);
  const giftPct = Math.min(100, Math.round((subtotal / freeOver) * 100)) + "%";

  if (!slides) return <div style={{ minHeight: "100vh", background: V.paper }} />;
  const slide = slides[idx % slides.length];
  const activeBrand = brands[ab] || {};
  const sectionHead = (title, meta, right) => (
    <div data-reveal style={{ borderTop: "1px solid " + V.ink, paddingTop: 10, display: "flex", flexWrap: "wrap", gap: "8px 28px", alignItems: "baseline", justifyContent: "space-between" }}>
      <h2 style={{ fontFamily: V.display, fontWeight: 700, fontSize: "clamp(24px,3.4vw,46px)", letterSpacing: "-0.025em", margin: 0, textTransform: "uppercase" }}>{title}</h2>
      {right || <span style={{ fontFamily: V.mono, fontSize: 10, letterSpacing: "0.12em", color: V.muted }}>{meta}</span>}
    </div>
  );

  return (
    <div className="vit-root" style={{ background: V.paper, fontFamily: V.body, overflowX: "hidden" }}>
      {/* top bar */}
      <div style={{ borderBottom: "1px solid " + V.rule, padding: "7px " + PAD, display: "flex", flexWrap: "wrap", gap: "8px 28px", alignItems: "center", justifyContent: "space-between", fontFamily: V.mono, fontSize: 10, letterSpacing: "0.13em", color: V.muted }}>
        <span>{deliveryNote}</span><span style={{ color: V.wine }}>{address}</span>
      </div>

      {/* header */}
      <header id="top" style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(255,255,255,0.94)", backdropFilter: "blur(8px)", borderBottom: "1px solid " + V.ink, padding: "14px " + PAD, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
        <a href="#top" style={{ fontFamily: V.display, fontWeight: 800, fontSize: "clamp(15px,1.7vw,20px)", letterSpacing: "0.01em", lineHeight: 1 }}>VITRINE</a>
        <nav className="vit-nav-desktop" style={{ display: "flex", flexWrap: "wrap", gap: "clamp(14px,2.2vw,34px)", fontFamily: V.mono, fontSize: 11, letterSpacing: "0.12em" }}>
          {NAV_LINKS.map(([t, href]) => <a key={href} className="vit-navlink" href={href}>{t}</a>)}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <button className="vit-bag" onClick={() => setBagOpen(true)} style={{ fontFamily: V.mono, fontSize: 11, letterSpacing: "0.12em", background: "none", border: "none", borderBottom: "1px solid " + V.ink, padding: "0 0 2px", cursor: "pointer", color: V.ink }}>BAG ({String(bag.count || 0).padStart(2, "0")})</button>
          <button className="vit-burger" aria-label="Menu" onClick={() => setMenuOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: V.ink }}>
            <span style={{ display: "block", width: 22, height: 1.5, background: V.ink, marginBottom: 5 }}></span>
            <span style={{ display: "block", width: 22, height: 1.5, background: V.ink }}></span>
          </button>
        </div>
      </header>

      {/* mobile menu */}
      {menuOpen && (
        <div className="vit-mobile-menu" onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60, background: V.paper, animation: "vitScrim 0.25s both", display: "flex", flexDirection: "column", padding: "18px " + PAD }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid " + V.ink, paddingBottom: 16 }}>
            <span style={{ fontFamily: V.display, fontWeight: 800, fontSize: 20 }}>VITRINE</span>
            <button aria-label="Close" onClick={() => setMenuOpen(false)} style={{ background: "none", border: "none", fontFamily: V.mono, fontSize: 12, letterSpacing: "0.14em", cursor: "pointer", color: V.ink }}>CLOSE ✕</button>
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: "clamp(24px,6vw,48px)" }}>
            {NAV_LINKS.map(([t, href], i) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)} style={{ fontFamily: V.display, fontWeight: 700, fontSize: "clamp(34px,10vw,54px)", letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 1.08, borderBottom: "1px solid " + V.ruleSoft, padding: "14px 0" }}>{t}</a>
            ))}
            <a href="key.html" onClick={() => setMenuOpen(false)} style={{ fontFamily: V.mono, fontSize: 12, letterSpacing: "0.16em", color: V.wine, marginTop: 24 }}>THE KEY →</a>
            <a href="account.html" onClick={() => setMenuOpen(false)} style={{ fontFamily: V.mono, fontSize: 12, letterSpacing: "0.16em", color: V.muted, marginTop: 12 }}>ACCOUNT →</a>
          </nav>
        </div>
      )}

      {/* hero — full-bleed cinematic clip reel */}
      <section data-vit-hero style={{ position: "relative", borderBottom: "1px solid " + V.ink, height: "clamp(560px,86vh,920px)", overflow: "hidden", background: V.ink }}>
        <HeroStage slides={slides} idx={idx} onEnded={advanceHero} />

        {/* legibility scrim — darkest at the foot where the copy sits */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(0deg,rgba(16,16,16,0.68) 0%,rgba(16,16,16,0.10) 44%,rgba(16,16,16,0.30) 100%)" }} data-vit-hero-scrim></div>

        {/* overlaid copy + numbered nav */}
        <div data-vit-hero-copy style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "0 " + PAD + " clamp(30px,4.5vw,68px)", display: "flex", flexWrap: "wrap", gap: "clamp(20px,3vw,44px)", alignItems: "flex-end", justifyContent: "space-between", willChange: "transform,opacity" }}>
          <div style={{ flex: "1 1 460px", maxWidth: 780 }}>
            <div style={{ fontFamily: V.mono, fontSize: 11, letterSpacing: "0.2em", color: "#E7C9D3", marginBottom: "clamp(12px,1.8vw,20px)" }}>{slide.eyebrow}</div>
            <h1 style={{ fontFamily: V.display, fontWeight: 700, fontSize: "clamp(46px,8vw,120px)", lineHeight: 0.85, letterSpacing: "-0.042em", margin: 0, textTransform: "uppercase", color: "#FBFBFA", textShadow: "0 2px 46px rgba(0,0,0,0.4)" }}>{slide.title}</h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(16px,2.4vw,40px)", marginTop: "clamp(16px,2.4vw,30px)", alignItems: "flex-end" }}>
              <p style={{ fontFamily: V.body, fontWeight: 300, fontSize: "clamp(15px,1.4vw,20px)", lineHeight: 1.42, margin: 0, maxWidth: "40ch", color: "rgba(255,255,255,0.85)" }}>{slide.dek}</p>
              <a href={slide.href || "#shelf"} style={{ fontFamily: V.mono, fontSize: 11, letterSpacing: "0.14em", borderBottom: "1px solid rgba(255,255,255,0.9)", paddingBottom: 4, whiteSpace: "nowrap", color: "#fff" }}>{slide.cta} →</a>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {slides.map((s, i) => (
              <button key={i} onClick={() => setIdx(i)} aria-label={"Go to slide " + (i + 1)} style={{ fontFamily: V.mono, fontSize: 11, letterSpacing: "0.1em", background: "none", border: "none", cursor: "pointer", padding: "10px 4px", minWidth: 30, minHeight: 44, color: i === idx ? "#fff" : "rgba(255,255,255,0.5)", borderBottom: "1px solid " + (i === idx ? "#fff" : "transparent") }}>{String(i + 1).padStart(2, "0")}</button>
            ))}
          </div>
        </div>
        <div style={{ position: "absolute", left: PAD, bottom: -1, height: 2, width: "clamp(60px,12vw,180px)", background: V.wine }}></div>
      </section>

      {/* object line */}
      <div style={{ padding: "12px " + PAD + " 0", display: "flex", flexWrap: "wrap", gap: "6px 40px", justifyContent: "space-between", fontFamily: V.mono, fontSize: 10, letterSpacing: "0.12em", color: V.muted }}>
        <span style={{ color: V.ink }}>{slide.objectLine}</span><span>{slide.objectPrice}</span>
      </div>

      {/* shelf */}
      <section id="shelf" style={{ padding: "clamp(84px,11vw,168px) 0 clamp(28px,4vw,46px)" }}>
        <div style={{ padding: "0 " + PAD }}>{sectionHead("Bestsellers", "What's moving this week")}</div>
        <div style={{ overflowX: "auto", padding: "clamp(30px,4vw,54px) " + PAD + " 4px", display: "flex", gap: "clamp(18px,2.4vw,34px)", alignItems: "flex-end" }}>
          {shelf.map((p, i) => <div key={p.id} data-reveal style={{ width: "clamp(200px,22vw,264px)", flex: "0 0 auto", "--d": (i * 55) + "ms" }}><Tile p={p} onAdd={addToBag} h={"clamp(220px,26vw," + (240 + (i % 3) * 20) + "px)"} /></div>)}
          <div style={{ flex: "0 0 auto", width: "clamp(160px,18vw,220px)", alignSelf: "flex-end", paddingBottom: 24 }}>
            <p style={{ fontFamily: V.body, fontWeight: 300, fontSize: 16, lineHeight: 1.45, color: V.muted, margin: "0 0 14px" }}>The brands you know, in one place.</p>
            <a href="/brands" style={{ fontFamily: V.mono, fontSize: 10, letterSpacing: "0.13em", borderBottom: "1px solid " + V.ink, paddingBottom: 3 }}>SEE ALL BRANDS →</a>
          </div>
        </div>
      </section>

      {/* free-delivery progress */}
      <section style={{ margin: "clamp(18px,3vw,40px) " + PAD + " 0", background: V.glass, padding: "clamp(26px,3.6vw,46px) clamp(20px,3vw,44px)", display: "flex", flexWrap: "wrap", gap: "clamp(24px,4vw,64px)", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div data-reveal style={{ flex: "1 1 300px" }}>
          <div style={{ fontFamily: V.mono, fontSize: 10, letterSpacing: "0.16em", color: V.wine, marginBottom: 12 }}>ISLANDWIDE DELIVERY</div>
          <h3 style={{ fontFamily: V.display, fontWeight: 700, fontSize: "clamp(20px,2.4vw,32px)", letterSpacing: "-0.02em", margin: "0 0 10px", textTransform: "uppercase" }}>Free over {money(freeOver)}</h3>
          <p style={{ fontFamily: V.body, fontWeight: 300, fontSize: 16, lineHeight: 1.45, margin: 0, maxWidth: "44ch", color: "#33332E" }}>Everything on the shelf is opened and tested here before it ships. Delivery is free once your bag passes the line.</p>
        </div>
        <div data-reveal style={{ "--d": "120ms", flex: "1 1 280px", maxWidth: 420 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: V.mono, fontSize: 10, letterSpacing: "0.1em", marginBottom: 8 }}>
            <span>{money(subtotal)}</span><span style={{ color: V.wine }}>{money(freeOver)}</span>
          </div>
          <div style={{ height: 3, background: "#DDE4E2", position: "relative" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: giftPct, background: V.wine, transition: "width 0.5s cubic-bezier(0.2,0.8,0.2,1)" }}></div>
          </div>
          <div style={{ fontFamily: V.mono, fontSize: 10, letterSpacing: "0.1em", color: V.muted, marginTop: 10 }}>{giftShort > 0 ? money(giftShort) + " TO FREE DELIVERY" : "FREE DELIVERY UNLOCKED"}</div>
        </div>
      </section>

      {/* new in */}
      {arrivals.length >= 2 && (
        <section id="arrivals" style={{ padding: "clamp(84px,11vw,168px) " + PAD + " 0" }}>
          {sectionHead("New in", arrivals.length + " just landed")}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "clamp(24px,3vw,44px) clamp(18px,2.4vw,34px)", marginTop: "clamp(34px,4vw,60px)" }}>
            {arrivals.map((p, i) => <div key={p.id} data-reveal style={{ marginTop: (i % 2) ? "clamp(20px,3vw,40px)" : 0, "--d": (i * 55) + "ms" }}><Tile p={p} onAdd={addToBag} h="clamp(230px,24vw,320px)" /></div>)}
          </div>
        </section>
      )}

      {/* on sale — deal cards */}
      {sale.length > 0 && (
        <section id="sale" style={{ padding: "clamp(84px,11vw,168px) 0 clamp(28px,4vw,46px)" }}>
          <div style={{ padding: "0 " + PAD }}>{sectionHead("On Sale", "Up to " + Math.max.apply(null, sale.map(p => p.off || 0)) + "% off")}</div>
          <div style={{ overflowX: "auto", padding: "clamp(30px,4vw,54px) " + PAD + " 4px", display: "flex", gap: "clamp(18px,2.4vw,34px)" }}>
            {sale.map((p, i) => (
              <a key={p.id} href={"/product/" + p.id} data-reveal style={{ "--d": (i * 55) + "ms", width: "clamp(210px,23vw,270px)", flex: "0 0 auto", display: "flex", flexDirection: "column" }}>
                <div style={{ position: "relative", height: "clamp(230px,25vw,300px)", background: V.porcelain, border: "1px solid " + V.rule, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {p.image ? <img src={p.image} alt={[p.name, p.brandName].filter(Boolean).join(" — ")} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 16 }} /> : null}
                  <span style={{ position: "absolute", top: 12, left: 12, background: V.wine, color: "#fff", fontFamily: V.mono, fontSize: 12, fontWeight: 500, letterSpacing: "0.04em", padding: "5px 9px" }}>−{p.off}%</span>
                </div>
                <div style={{ fontFamily: V.mono, fontSize: 10, letterSpacing: "0.14em", color: V.muted, margin: "14px 0 5px", textTransform: "uppercase" }}>{p.brandName}</div>
                <div style={{ fontFamily: V.display, fontWeight: 600, fontSize: "clamp(14px,1.4vw,17px)", lineHeight: 1.2, letterSpacing: "-0.015em" }}>{p.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
                  <span style={{ fontFamily: V.mono, fontSize: 13, color: V.wine }}>{money(p.sale)}</span>
                  <span style={{ fontFamily: V.mono, fontSize: 11, color: V.muted, textDecoration: "line-through" }}>{money(p.price)}</span>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* shop by skin type */}
      <section id="skin" style={{ padding: "clamp(84px,11vw,168px) " + PAD + " 0" }}>
        {sectionHead("Shop by skin type", "Matched to what your skin needs")}
        <div data-reveal style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "1px", marginTop: "clamp(30px,4vw,54px)", background: V.rule, border: "1px solid " + V.rule }}>
          {SKIN_BROWSE.map(([key, label, note], i) => (
            <a key={key} href={"/skin/" + key} data-ripple style={{ "--d": (i * 45) + "ms", position: "relative", background: V.paper, padding: "clamp(24px,3vw,38px) clamp(18px,2vw,26px)", display: "flex", flexDirection: "column", minHeight: "clamp(150px,16vw,196px)", transition: "background 0.3s" }}
              onMouseEnter={e => e.currentTarget.style.background = V.porcelain}
              onMouseLeave={e => e.currentTarget.style.background = V.paper}>
              <div style={{ fontFamily: V.mono, fontSize: 10, letterSpacing: "0.16em", color: V.wine }}>{String(i + 1).padStart(2, "0")}</div>
              <h3 style={{ fontFamily: V.display, fontWeight: 700, fontSize: "clamp(22px,2.6vw,32px)", letterSpacing: "-0.02em", margin: "auto 0 0", textTransform: "uppercase" }}>{label}</h3>
              <p style={{ fontFamily: V.body, fontWeight: 300, fontSize: 14, lineHeight: 1.4, color: V.muted, margin: "10px 0 0" }}>{note}</p>
              <span style={{ fontFamily: V.mono, fontSize: 10, letterSpacing: "0.13em", marginTop: 16, color: V.ink }}>SHOP →</span>
            </a>
          ))}
        </div>
      </section>

      {/* brands — top-brand logo strip (full A–Z lives at /brands) */}
      {brands.length > 0 && (
        <section id="maisons" style={{ padding: "clamp(84px,11vw,168px) " + PAD + " 0" }}>
          {sectionHead("The brands", brands.length + " and counting", <a href="/brands" style={{ fontFamily: V.mono, fontSize: 10, letterSpacing: "0.13em", borderBottom: "1px solid " + V.ink, paddingBottom: 3 }}>ALL BRANDS →</a>)}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(clamp(118px,14vw,160px),1fr))", gap: 1, marginTop: "clamp(28px,3vw,44px)", background: V.ruleSoft, border: "1px solid " + V.ruleSoft }}>
            {[...brands].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 18).map((b, i) => (
              <a key={b.key} href={"/brand/" + b.key} data-reveal title={b.name} style={{ "--d": (i * 35) + "ms", background: V.paper, minHeight: "clamp(92px,10vw,122px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "clamp(14px,2vw,22px)", transition: "background 0.25s" }}
                onMouseEnter={e => e.currentTarget.style.background = V.porcelain} onMouseLeave={e => e.currentTarget.style.background = V.paper}>
                {b.image
                  ? <img src={b.image} alt={b.name} loading="lazy" style={{ maxWidth: "100%", maxHeight: "clamp(38px,5vw,58px)", objectFit: "contain" }} />
                  : <span style={{ fontFamily: V.display, fontWeight: 600, fontSize: "clamp(13px,1.4vw,17px)", letterSpacing: "-0.01em", textAlign: "center", lineHeight: 1.12 }}>{b.name}</span>}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* stories */}
      {journal.length > 0 && (
        <section id="journal" style={{ padding: "clamp(84px,11vw,168px) " + PAD + " 0" }}>
          {sectionHead("Stories", null, <a href="journal.html" style={{ fontFamily: V.mono, fontSize: 10, letterSpacing: "0.13em", borderBottom: "1px solid " + V.ink, paddingBottom: 3 }}>ALL STORIES →</a>)}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(24px,3vw,48px)", marginTop: "clamp(30px,4vw,52px)" }}>
            {journal.map((j, i) => (
              <a key={j.id} href={"/journal/" + j.slug} data-reveal style={{ "--d": (i * 80) + "ms", flex: "1 1 280px", minWidth: "min(100%,260px)", display: "block" }}>
                <div style={{ position: "relative", background: "linear-gradient(112deg,#F6F7F7," + V.porcelain + " 60%,#FAFBFB)", height: "clamp(200px," + (240 + i * 10) + "px,280px)", borderTop: "1px solid " + V.ink }}>
                  {j.cover_image && <img src={j.cover_image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
                </div>
                <div style={{ fontFamily: V.mono, fontSize: 10, letterSpacing: "0.12em", color: V.muted, marginTop: 12 }}>{j.tag || "JOURNAL"}</div>
                <h3 style={{ fontFamily: V.display, fontWeight: 600, fontSize: "clamp(16px,1.5vw,21px)", lineHeight: 1.12, letterSpacing: "-0.02em", margin: "12px 0 8px", maxWidth: "26ch" }}>{j.title} {j.italic}</h3>
                <p style={{ fontFamily: V.body, fontWeight: 300, fontSize: 16, lineHeight: 1.45, margin: 0, maxWidth: "40ch", color: "#4A4A43" }}>{j.excerpt}</p>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* The Key — membership */}
      <section style={{ margin: "clamp(84px,11vw,168px) 0 0", background: V.ink, color: "#FFFFFF", padding: "clamp(48px,7vw,96px) " + PAD }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(28px,5vw,80px)", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div data-reveal style={{ flex: "1 1 320px" }}>
            <h2 style={{ fontFamily: V.display, fontWeight: 700, fontSize: "clamp(24px,3.4vw,46px)", lineHeight: 0.94, letterSpacing: "-0.028em", margin: 0, textTransform: "uppercase" }}>The Key</h2>
            <p style={{ fontFamily: V.body, fontWeight: 300, fontSize: "clamp(16px,1.6vw,20px)", lineHeight: 1.45, margin: "clamp(18px,2vw,28px) 0 0", maxWidth: "40ch", color: "#D8D8D2" }}>Our standing invitation to the regulars — offered, not sold. Free delivery, a member's discount, and first look at everything before the shelf.</p>
            <a href="key.html" style={{ display: "inline-block", fontFamily: V.mono, fontSize: 11, letterSpacing: "0.14em", color: "#FFFFFF", borderBottom: "1px solid #FFFFFF", paddingBottom: 4, marginTop: "clamp(22px,3vw,36px)" }}>ABOUT MEMBERSHIP →</a>
          </div>
          <div data-reveal style={{ "--d": "140ms", flex: "1 1 280px", maxWidth: 460 }}>
            {[["Free delivery on every order"], ["A standing member's discount"], ["First refusal on new arrivals"], ["The back room by appointment", "backroom.html"]].map(([t, href], i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "34px 1fr", gap: 16, borderTop: "1px solid #33332E", padding: "clamp(13px,1.6vw,18px) 0" }}>
                <span style={{ fontFamily: V.mono, fontSize: 9, letterSpacing: "0.1em", color: "#7A756F", paddingTop: 3 }}>{String(i + 1).padStart(2, "0")}</span>
                <span style={{ fontFamily: V.body, fontWeight: 300, fontSize: "clamp(15px,1.5vw,18px)", lineHeight: 1.35, color: "#F0F0EA" }}>
                  {href ? <a href={href} style={{ color: "#F0F0EA", borderBottom: "1px solid #555049" }}>{t} →</a> : t}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* newsletter */}
      <section style={{ padding: "clamp(84px,11vw,168px) " + PAD + " clamp(56px,7vw,96px)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(24px,4vw,72px)", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div data-reveal style={{ flex: "1 1 340px" }}>
            <h2 style={{ fontFamily: V.display, fontWeight: 700, fontSize: "clamp(24px,3.4vw,46px)", lineHeight: 0.94, letterSpacing: "-0.028em", margin: 0, textTransform: "uppercase" }}>One email,<br />every restock</h2>
          </div>
          <div style={{ flex: "1 1 320px", maxWidth: 480 }}>
            {subscribed && <div style={{ borderTop: "1px solid " + V.ink, paddingTop: 16, fontFamily: V.mono, fontSize: 11, letterSpacing: "0.1em", color: V.wine, animation: "vitRise 0.4s both" }}>YOU'RE ON THE LIST — THANK YOU</div>}
            <form onSubmit={subscribe} style={{ display: "flex", gap: 14, alignItems: "flex-end", borderBottom: "1px solid " + V.ink, paddingBottom: 8 }}>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@address" style={{ flex: 1, border: "none", outline: "none", background: "none", fontFamily: V.mono, fontSize: "clamp(13px,1.4vw,16px)", letterSpacing: "0.04em", color: V.ink, padding: "6px 0" }} />
              <button type="submit" style={{ fontFamily: V.mono, fontSize: 10, letterSpacing: "0.14em", background: "none", border: "none", padding: "0 0 4px", cursor: "pointer", color: V.ink, whiteSpace: "nowrap" }}>SIGN ME UP →</button>
            </form>
            <p style={{ fontFamily: V.body, fontWeight: 300, fontSize: 14, lineHeight: 1.45, color: V.muted, margin: "14px 0 0", maxWidth: "46ch" }}>Sent when something lands, not weekly.</p>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer style={{ borderTop: "1px solid " + V.ink, padding: "clamp(34px,4vw,58px) " + PAD + " 0", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: "clamp(26px,3vw,48px)" }}>
          <div>
            <div style={{ fontFamily: V.mono, fontSize: 9, letterSpacing: "0.14em", color: V.muted, marginBottom: 14 }}>THE SHOP</div>
            <div style={{ fontFamily: V.body, fontWeight: 300, fontSize: 15, lineHeight: 1.5, color: "#33332E", whiteSpace: "pre-line" }}>{settings["site.address_line1"] || "No. 14, Charles Place"}{"\n"}{settings["site.address_line2"] || "Colombo 06, Sri Lanka"}</div>
            {settings["site.phone"] && <div style={{ fontFamily: V.mono, fontSize: 11, marginTop: 12 }}>{settings["site.phone"]}</div>}
          </div>
          <div>
            <div style={{ fontFamily: V.mono, fontSize: 9, letterSpacing: "0.14em", color: V.muted, marginBottom: 14 }}>SHOP</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: V.mono, fontSize: 11, letterSpacing: "0.06em" }}>
              <a href="Shop.html#cat=skincare">Skincare</a><a href="Shop.html#cat=makeup">Makeup</a><a href="Shop.html#cat=fragrance">Fragrance</a><a href="Shop.html#sale=1">Sale</a>
            </div>
          </div>
          <div>
            <div style={{ fontFamily: V.mono, fontSize: 9, letterSpacing: "0.14em", color: V.muted, marginBottom: 14 }}>HOUSE</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: V.mono, fontSize: 11, letterSpacing: "0.06em" }}>
              <a href="#maisons">Brands</a><a href="journal.html">Stories</a><a href="key.html">The Key</a><a href="contact.html#returns">Returns</a>
            </div>
          </div>
          <div>
            <div style={{ fontFamily: V.mono, fontSize: 9, letterSpacing: "0.14em", color: V.muted, marginBottom: 14 }}>ELSEWHERE</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: V.mono, fontSize: 11, letterSpacing: "0.06em" }}>
              <a href="contact.html">Contact</a><a href="track.html">Track order</a><a href="account.html">Account</a>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 28px", justifyContent: "space-between", fontFamily: V.mono, fontSize: 9, letterSpacing: "0.12em", color: V.muted, marginTop: "clamp(30px,4vw,54px)", borderTop: "1px solid " + V.ruleSoft, paddingTop: 12 }}>
          <span>© {new Date().getFullYear()} VITRINE (PVT) LTD</span><span>OPENED AND TESTED IN COLOMBO</span>
        </div>
        {/* Giant wordmark. overflow:hidden guards horizontal bleed on narrow
            screens; line-height ~0.86 keeps the full caps visible (no fixed-height
            container, which used to guillotine the letters at wide viewports). */}
        <div style={{ overflow: "hidden", marginTop: "clamp(14px,2vw,26px)" }}>
          <div style={{ fontFamily: V.display, fontWeight: 800, fontSize: "clamp(88px,21vw,300px)", lineHeight: 0.86, letterSpacing: "-0.045em", color: V.ink }}>VITRINE</div>
        </div>
      </footer>

      {/* floating bag + toast */}
      <button onClick={() => setBagOpen(true)} className="vit-bagfab" style={{ position: "fixed", right: "clamp(14px,2vw,26px)", bottom: "clamp(14px,2vw,26px)", zIndex: 45, background: V.ink, color: "#FFFFFF", border: "none", cursor: "pointer", fontFamily: V.mono, fontSize: 10, letterSpacing: "0.12em", padding: "13px 17px", display: "flex", gap: 10, alignItems: "center" }}>
        <span>BAG</span><span style={{ color: "#C99AAF", fontVariantNumeric: "tabular-nums" }}>{String(bag.count || 0).padStart(2, "0")}</span>
      </button>
      {toast && (
        <div style={{ position: "fixed", right: "clamp(14px,2vw,26px)", bottom: "calc(clamp(14px,2vw,26px) + 58px)", zIndex: 46, width: "min(330px,86vw)", background: V.paper, border: "1px solid " + V.ink, padding: "15px 17px 14px", animation: "vitToast 0.5s cubic-bezier(0.2,0.8,0.2,1) both", boxShadow: "0 22px 44px -26px rgba(16,16,16,0.45)" }}>
          <div style={{ fontFamily: V.mono, fontSize: 9, letterSpacing: "0.16em", color: V.wine }}>IN THE BAG</div>
          <div style={{ fontFamily: V.display, fontWeight: 600, fontSize: 15, lineHeight: 1.14, letterSpacing: "-0.015em", margin: "9px 0 3px" }}>{toast.name}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, marginTop: 10 }}>
            <span style={{ fontFamily: V.body, fontWeight: 300, fontStyle: "italic", fontSize: 13, color: "#4A4A43" }}>{toast.brand}</span>
            <button className="vit-add" onClick={() => setBagOpen(true)} style={{ fontFamily: V.mono, fontSize: 10, letterSpacing: "0.12em", background: "none", border: "none", borderBottom: "1px solid " + V.ink, padding: "0 0 2px", cursor: "pointer", color: V.ink }}>VIEW BAG →</button>
          </div>
        </div>
      )}

      {/* bag drawer */}
      {bagOpen && (
        <div>
          <div onClick={() => setBagOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(16,16,16,0.3)", zIndex: 55, animation: "vitScrim 0.3s both" }}></div>
          <aside style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(430px,94vw)", background: V.paper, borderLeft: "1px solid " + V.ink, zIndex: 60, display: "flex", flexDirection: "column", animation: "vitDrawer 0.36s cubic-bezier(0.2,0.8,0.2,1) both" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "20px clamp(18px,3vw,26px)", borderBottom: "1px solid " + V.ink }}>
              <span style={{ fontFamily: V.display, fontWeight: 700, fontSize: 18, letterSpacing: "-0.01em", textTransform: "uppercase" }}>Your bag</span>
              <button className="vit-add" onClick={() => setBagOpen(false)} style={{ fontFamily: V.mono, fontSize: 10, letterSpacing: "0.12em", background: "none", border: "none", cursor: "pointer", color: V.muted }}>CLOSE ×</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "0 clamp(18px,3vw,26px)" }}>
              {(!bag.items || bag.items.length === 0) && <p style={{ fontFamily: V.body, fontWeight: 300, fontSize: 16, lineHeight: 1.45, color: V.muted, margin: "28px 0 0" }}>Nothing yet. The shelf is through there.</p>}
              {(bag.items || []).map((i, n) => (
                <div key={i.lineId} style={{ display: "grid", gridTemplateColumns: "52px 1fr auto", gap: 14, alignItems: "start", borderBottom: "1px solid " + V.ruleSoft, padding: "18px 0", animation: "vitRise 0.5s cubic-bezier(0.2,0.8,0.2,1) both", animationDelay: (n * 60) + "ms" }}>
                  <div style={{ height: 62, background: "linear-gradient(102deg,#FAFBFB," + V.porcelain + " 55%,#F7F9F8)", position: "relative", overflow: "hidden" }}>
                    {i.product.image && <img src={i.product.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />}
                  </div>
                  <div>
                    <div style={{ fontFamily: V.display, fontWeight: 600, fontSize: 15, letterSpacing: "-0.015em", lineHeight: 1.12 }}>{i.product.name}</div>
                    <div style={{ fontFamily: V.body, fontWeight: 300, fontStyle: "italic", fontSize: 13, color: "#4A4A43", marginTop: 3 }}>{i.product.brandName}</div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8, fontFamily: V.mono, fontSize: 10, letterSpacing: "0.08em" }}>
                      <button className="vit-counter" onClick={() => stepLine(i, i.qty - 1)} style={{ background: "none", border: "1px solid " + V.rule, width: 22, height: 22, cursor: "pointer", color: V.ink }}>−</button>
                      <span>{i.qty}</span>
                      <button className="vit-counter" onClick={() => stepLine(i, i.qty + 1)} style={{ background: "none", border: "1px solid " + V.rule, width: 22, height: 22, cursor: "pointer", color: V.ink }}>+</button>
                    </div>
                  </div>
                  <div style={{ fontFamily: V.mono, fontSize: 11, textAlign: "right" }}>{money(i.lineTotal)}</div>
                </div>
              ))}
            </div>
            <div style={{ borderTop: "1px solid " + V.ink, padding: "clamp(16px,2.4vw,22px) clamp(18px,3vw,26px)" }}>
              <div style={{ height: 3, background: "#E4E4DE", position: "relative", marginBottom: 8 }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: giftPct, background: V.wine, transition: "width 0.6s cubic-bezier(0.2,0.8,0.2,1)" }}></div>
              </div>
              <div style={{ fontFamily: V.mono, fontSize: 10, letterSpacing: "0.08em", color: V.wine, marginBottom: 16 }}>{giftShort > 0 ? money(giftShort) + " TO FREE DELIVERY" : "FREE DELIVERY UNLOCKED"}</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: V.mono, fontSize: 11, letterSpacing: "0.06em", marginBottom: 16 }}>
                <span>SUBTOTAL</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{money(subtotal)}</span>
              </div>
              <a href="checkout.html" style={{ display: "block", textAlign: "center", background: V.ink, color: "#FFFFFF", padding: 15, fontFamily: V.mono, fontSize: 11, letterSpacing: "0.14em", cursor: "pointer" }}>TO THE COUNTER →</a>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Home />);
