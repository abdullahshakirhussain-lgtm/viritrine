/* VITRINE homepage — "The Cabinet" (Claude Design), re-implemented in the repo's
   React and wired to the real APIs (settings, hero-slides, editorial, new-arrivals,
   sale, brands, journal, cart) + the membership page. Self-contained (own header /
   footer / bag drawer). The 3D hero bottle comes from src/bottle.js (self-mounts). */

const V = {
  paper: "#FFFFFF", ink: "#101010", wine: "#5A1430", glass: "#EEF2F1",
  rule: "#DCDCD6", ruleSoft: "#EFEFEA", muted: "#6E6E68", porcelain: "#F3F5F4",
  display: "Archivo, system-ui, sans-serif", body: "Newsreader, Georgia, serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
};
const PAD = "var(--vit-pad)";
const money = (n) => (window.fmtLKR ? window.fmtLKR(n) : "LKR " + Number(n || 0).toLocaleString("en-US"));

const HERO_FALLBACK = [
  { eyebrow: "THIRTEEN BRANDS, ONE SHOP", title: "Kept under glass", dek: "Thirteen houses — pressed in Kandy, blended in Grasse, milled in Kyoto. Every brand here, we've tried.", cta: "Shop", objectLine: "Ceylon Verbena Pressed Oil, 30ml — Kandy", objectPrice: "LKR 12,400", id: null },
  { eyebrow: "JUST LANDED", title: "Twelve weeks late", dek: "The Kyoto shipment cleared customs on Tuesday. Six pieces, no restock date, first come.", cta: "See what landed", objectLine: "Shiro Rice Polish, 50g — Kyoto", objectPrice: "LKR 9,800", id: null },
  { eyebrow: "MADE IN SRI LANKA", title: "Grown here first", dek: "Four of our brands are made within two hundred kilometres of the shop.", cta: "Shop local", objectLine: "Cinnamon Gardens Hair Oil, 100ml — Colombo", objectPrice: "LKR 7,600", id: null },
];

function money0(n){ return money(n); }

function Tile({ p, onAdd, h }) {
  return (
    <article style={{ flex: "0 0 auto" }}>
      <div className="vit-tile" style={{ position: "relative", overflow: "hidden", background: "linear-gradient(102deg,#FAFBFB," + V.porcelain + " 52%,#F7F9F8)", border: "1px solid #E4E9E8", borderBottom: "1px solid " + V.rule, height: h, display: "flex", alignItems: "flex-end", justifyContent: "center", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.92), inset 0 -40px 52px -40px rgba(16,16,16,0.12)" }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: "15%", height: 1, background: "rgba(16,16,16,0.11)" }}></div>
        <div style={{ width: "40%", height: "64%", marginBottom: "15%", background: "linear-gradient(96deg,#FFFFFF,#E7ECEB 58%,#F6F8F7)", border: "1px solid #E1E6E5", borderBottom: "none" }}></div>
        {p.image && <img src={p.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />}
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
        title: p.name, dek: p.copy, cta: "Shop",
        objectLine: [p.name, p.size, p.brandLoc].filter(Boolean).join(" · "),
        objectPrice: money(p.sale || p.price), id: p.id,
      })));
    }).catch(() => setSlides(HERO_FALLBACK));
    window.api.get("/api/editorial").then(r => setShelf(r || [])).catch(() => {});
    window.api.get("/api/products/new-arrivals?limit=8").then(r => setArrivals(r || [])).catch(() => {});
    window.api.get("/api/products?sale=1&sort=off-desc&limit=8").then(r => setSale(r || [])).catch(() => {});
    window.api.get("/api/brands").then(r => setBrands(r || [])).catch(() => {});
    window.api.get("/api/journal?limit=3").then(r => setJournal(r || [])).catch(() => {});
    loadBag();
    const onCart = () => loadBag();
    window.addEventListener("cart:changed", onCart);
    return () => window.removeEventListener("cart:changed", onCart);
  }, []);

  React.useEffect(() => {
    if (!slides || slides.length < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % slides.length), 6000);
    return () => clearInterval(t);
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
    <div style={{ borderTop: "1px solid " + V.ink, paddingTop: 10, display: "flex", flexWrap: "wrap", gap: "8px 28px", alignItems: "baseline", justifyContent: "space-between" }}>
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
        <nav style={{ display: "flex", flexWrap: "wrap", gap: "clamp(14px,2.2vw,34px)", fontFamily: V.mono, fontSize: 11, letterSpacing: "0.12em" }}>
          <a className="vit-navlink" href="#shelf">SHOP</a>
          <a className="vit-navlink" href="#arrivals">NEW IN</a>
          <a className="vit-navlink" href="#sale">SALE</a>
          <a className="vit-navlink" href="#maisons">BRANDS</a>
          <a className="vit-navlink" href="#journal">STORIES</a>
        </nav>
        <button className="vit-bag" onClick={() => setBagOpen(true)} style={{ fontFamily: V.mono, fontSize: 11, letterSpacing: "0.12em", background: "none", border: "none", borderBottom: "1px solid " + V.ink, padding: "0 0 2px", cursor: "pointer", color: V.ink }}>BAG ({String(bag.count || 0).padStart(2, "0")})</button>
      </header>

      {/* hero */}
      <section style={{ position: "relative", borderBottom: "1px solid " + V.ink, padding: "clamp(28px,4vw,56px) " + PAD + " 0" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "clamp(24px,4vw,56px)" }}>
          <div style={{ flex: "1 1 460px", minWidth: "min(100%,340px)", paddingBottom: "clamp(28px,4vw,54px)" }}>
            <div style={{ fontFamily: V.mono, fontSize: 11, letterSpacing: "0.16em", color: V.wine, marginBottom: "clamp(18px,3vw,34px)" }}>{slide.eyebrow}</div>
            <h1 style={{ fontFamily: V.display, fontWeight: 700, fontSize: "clamp(52px,9.2vw,138px)", lineHeight: 0.83, letterSpacing: "-0.042em", margin: 0, textTransform: "uppercase" }}>{slide.title}</h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(20px,3vw,48px)", marginTop: "clamp(22px,3vw,40px)", alignItems: "flex-end" }}>
              <p style={{ fontFamily: V.body, fontWeight: 300, fontSize: "clamp(16px,1.5vw,21px)", lineHeight: 1.42, margin: 0, maxWidth: "34ch", color: "#33332E" }}>{slide.dek}</p>
              <a href={slide.id ? "/product/" + slide.id : "#shelf"} style={{ fontFamily: V.mono, fontSize: 11, letterSpacing: "0.14em", borderBottom: "1px solid " + V.ink, paddingBottom: 4, whiteSpace: "nowrap" }}>{slide.cta} →</a>
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: "clamp(26px,4vw,46px)", alignItems: "center" }}>
              {slides.map((s, i) => (
                <button key={i} onClick={() => setIdx(i)} style={{ fontFamily: V.mono, fontSize: 10, letterSpacing: "0.1em", background: "none", border: "none", cursor: "pointer", padding: 0, color: i === idx ? V.ink : V.muted, borderBottom: "1px solid " + (i === idx ? V.ink : "transparent") }}>{String(i + 1).padStart(2, "0")}</button>
              ))}
            </div>
          </div>

          <div style={{ flex: "1 1 380px", minWidth: "min(100%,300px)", position: "relative", height: "clamp(340px,46vw,580px)" }}>
            <div data-vit-case="hero" style={{ position: "absolute", inset: 0, overflow: "hidden", border: "1px solid " + V.rule, borderBottom: "none", background: "linear-gradient(116deg,rgba(255,255,255,0.96),rgba(238,242,241,0.92) 46%,rgba(252,253,253,0.98))", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -70px 90px -70px rgba(16,16,16,0.14)" }}>
              <div style={{ position: "absolute", left: 0, right: 0, top: 34, height: 1, background: "rgba(16,16,16,0.07)" }}></div>
              <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "rgba(16,16,16,0.05)" }}></div>
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "16%", background: "linear-gradient(180deg,rgba(16,16,16,0.055),rgba(16,16,16,0.015))", borderTop: "1px solid rgba(16,16,16,0.13)" }}></div>
              <div style={{ position: "absolute", top: "-20%", bottom: "-20%", left: "-30%", right: "-30%", background: "linear-gradient(104deg,transparent 36%,rgba(255,255,255,0.9) 46%,rgba(255,255,255,0.2) 53%,transparent 62%)", animation: "vitGlint 11s cubic-bezier(0.5,0,0.5,1) infinite", pointerEvents: "none" }}></div>
            </div>
            <canvas id="vit-bottle-canvas" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}></canvas>
            <div id="vit-bottle-fallback" style={{ position: "absolute", inset: 0, opacity: 0, transition: "opacity 0.4s", display: "flex", alignItems: "flex-end", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{ width: "46%", height: "82%", background: "linear-gradient(104deg,#F7F8F8,#E4E9E8 48%,#F4F6F5)", border: "1px solid " + V.rule, borderBottom: "none" }}></div>
            </div>
          </div>
        </div>
        <div style={{ position: "absolute", left: PAD, bottom: -1, height: 1, width: "clamp(60px,12vw,180px)", background: V.wine }}></div>
      </section>

      {/* object line */}
      <div style={{ padding: "12px " + PAD + " 0", display: "flex", flexWrap: "wrap", gap: "6px 40px", justifyContent: "space-between", fontFamily: V.mono, fontSize: 10, letterSpacing: "0.12em", color: V.muted }}>
        <span style={{ color: V.ink }}>{slide.objectLine}</span><span>{slide.objectPrice}</span>
      </div>

      {/* shelf */}
      <section id="shelf" style={{ padding: "clamp(84px,11vw,168px) 0 clamp(28px,4vw,46px)" }}>
        <div style={{ padding: "0 " + PAD }}>{sectionHead("Shop", (shelf.length || 0) + " on the shelf")}</div>
        <div style={{ overflowX: "auto", padding: "clamp(30px,4vw,54px) " + PAD + " 4px", display: "flex", gap: "clamp(18px,2.4vw,34px)", alignItems: "flex-end" }}>
          {shelf.map((p, i) => <div key={p.id} style={{ width: "clamp(200px,22vw,264px)", flex: "0 0 auto" }}><Tile p={p} onAdd={addToBag} h={"clamp(220px,26vw," + (240 + (i % 3) * 20) + "px)"} /></div>)}
          <div style={{ flex: "0 0 auto", width: "clamp(160px,18vw,220px)", alignSelf: "flex-end", paddingBottom: 24 }}>
            <p style={{ fontFamily: V.body, fontWeight: 300, fontSize: 16, lineHeight: 1.45, color: V.muted, margin: "0 0 14px" }}>Every brand here, we've tried.</p>
            <a href="#maisons" style={{ fontFamily: V.mono, fontSize: 10, letterSpacing: "0.13em", borderBottom: "1px solid " + V.ink, paddingBottom: 3 }}>SEE ALL BRANDS →</a>
          </div>
        </div>
      </section>

      {/* free-delivery progress */}
      <section style={{ margin: "clamp(18px,3vw,40px) " + PAD + " 0", background: V.glass, padding: "clamp(26px,3.6vw,46px) clamp(20px,3vw,44px)", display: "flex", flexWrap: "wrap", gap: "clamp(24px,4vw,64px)", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ flex: "1 1 300px" }}>
          <div style={{ fontFamily: V.mono, fontSize: 10, letterSpacing: "0.16em", color: V.wine, marginBottom: 12 }}>ISLANDWIDE DELIVERY</div>
          <h3 style={{ fontFamily: V.display, fontWeight: 700, fontSize: "clamp(20px,2.4vw,32px)", letterSpacing: "-0.02em", margin: "0 0 10px", textTransform: "uppercase" }}>Free over {money(freeOver)}</h3>
          <p style={{ fontFamily: V.body, fontWeight: 300, fontSize: 16, lineHeight: 1.45, margin: 0, maxWidth: "44ch", color: "#33332E" }}>Everything on the shelf is opened and tested here before it ships. Delivery is free once your bag passes the line.</p>
        </div>
        <div style={{ flex: "1 1 280px", maxWidth: 420 }}>
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
            {arrivals.map((p, i) => <div key={p.id} style={{ marginTop: (i % 2) ? "clamp(20px,3vw,40px)" : 0 }}><Tile p={p} onAdd={addToBag} h="clamp(230px,24vw,320px)" /></div>)}
          </div>
        </section>
      )}

      {/* last chance (sale ledger) */}
      {sale.length > 0 && (
        <section id="sale" style={{ padding: "clamp(84px,11vw,168px) " + PAD + " 0" }}>
          {sectionHead("Last chance", sale.length + " pieces, no restock")}
          <div style={{ marginTop: "clamp(26px,3vw,40px)" }}>
            {sale.map((p) => (
              <div key={p.id} className="vit-row" style={{ display: "grid", gridTemplateColumns: "minmax(140px,2.2fr) minmax(90px,1.2fr) minmax(74px,0.9fr) minmax(84px,0.9fr) 64px", gap: "4px clamp(10px,1.6vw,26px)", alignItems: "center", borderBottom: "1px solid " + V.ruleSoft, padding: "clamp(16px,1.8vw,22px) 0", fontFamily: V.mono, fontSize: 11 }}>
                <a href={"/product/" + p.id} style={{ fontFamily: V.display, fontWeight: 600, fontSize: "clamp(14px,1.5vw,19px)", letterSpacing: "-0.015em" }}>{p.name}</a>
                <span style={{ fontFamily: V.body, fontWeight: 300, fontStyle: "italic", fontSize: 14, color: "#4A4A43" }}>{p.brandName}</span>
                <span style={{ color: V.muted, textDecoration: "line-through" }}>{money(p.price)}</span>
                <span style={{ display: "flex", flexDirection: "column", gap: 3 }}><span style={{ color: V.wine }}>{money(p.sale)}</span><span style={{ fontSize: 9, letterSpacing: "0.1em", color: V.muted }}>−{p.off}%</span></span>
                <button className="vit-add" onClick={() => addToBag(p)} style={{ fontFamily: V.mono, fontSize: 10, letterSpacing: "0.1em", background: "none", border: "none", borderBottom: "1px solid " + V.rule, padding: "0 0 2px", cursor: "pointer", color: V.muted, justifySelf: "end" }}>ADD</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* brands */}
      {brands.length > 0 && (
        <section id="maisons" style={{ padding: "clamp(84px,11vw,168px) " + PAD + " 0" }}>
          {sectionHead("The brands", brands.length + " houses")}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", borderLeft: "1px solid " + V.ruleSoft, marginTop: "clamp(28px,3vw,44px)" }}>
            {brands.map((b, i) => (
              <a key={b.key} href={"/brand/" + b.key} className="vit-brandcell" onMouseEnter={() => setAb(i)} onFocus={() => setAb(i)} style={{ borderRight: "1px solid " + V.ruleSoft, borderBottom: "1px solid " + V.ruleSoft, padding: "clamp(16px,2vw,26px) clamp(12px,1.6vw,20px)", minHeight: "clamp(120px,12vw,158px)", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 18 }}>
                <span style={{ fontFamily: V.display, fontWeight: 600, fontSize: "clamp(16px,1.8vw,23px)", lineHeight: 1.02, letterSpacing: "-0.022em" }}>{b.name}</span>
                <span style={{ fontFamily: V.mono, fontSize: 10, letterSpacing: "0.12em", color: V.muted }}>{(b.loc || "").toUpperCase()}</span>
              </a>
            ))}
          </div>
          <div style={{ borderBottom: "1px solid " + V.ink, padding: "16px 0 clamp(18px,2vw,26px)", display: "flex", flexWrap: "wrap", gap: "10px 32px", alignItems: "baseline" }}>
            <span style={{ fontFamily: V.mono, fontSize: 10, letterSpacing: "0.14em", color: V.wine, whiteSpace: "nowrap" }}>{(activeBrand.loc || "").toUpperCase()}</span>
            <p style={{ fontFamily: V.body, fontWeight: 300, fontSize: "clamp(15px,1.5vw,19px)", lineHeight: 1.4, margin: 0, maxWidth: "62ch", color: "#33332E" }}>{activeBrand.tagline || (activeBrand.name ? activeBrand.name + (activeBrand.cat ? " — " + activeBrand.cat : "") + "." : "")}</p>
          </div>
        </section>
      )}

      {/* stories */}
      {journal.length > 0 && (
        <section id="journal" style={{ padding: "clamp(84px,11vw,168px) " + PAD + " 0" }}>
          {sectionHead("Stories", null, <a href="journal.html" style={{ fontFamily: V.mono, fontSize: 10, letterSpacing: "0.13em", borderBottom: "1px solid " + V.ink, paddingBottom: 3 }}>ALL STORIES →</a>)}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(24px,3vw,48px)", marginTop: "clamp(30px,4vw,52px)" }}>
            {journal.map((j, i) => (
              <a key={j.id} href={"/journal/" + j.slug} style={{ flex: "1 1 280px", minWidth: "min(100%,260px)", display: "block" }}>
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
          <div style={{ flex: "1 1 320px" }}>
            <h2 style={{ fontFamily: V.display, fontWeight: 700, fontSize: "clamp(24px,3.4vw,46px)", lineHeight: 0.94, letterSpacing: "-0.028em", margin: 0, textTransform: "uppercase" }}>The Key</h2>
            <p style={{ fontFamily: V.body, fontWeight: 300, fontSize: "clamp(16px,1.6vw,20px)", lineHeight: 1.45, margin: "clamp(18px,2vw,28px) 0 0", maxWidth: "40ch", color: "#D8D8D2" }}>Our standing invitation to the regulars — offered, not sold. Free delivery, a member's discount, and first look at everything before the shelf.</p>
            <a href="key.html" style={{ display: "inline-block", fontFamily: V.mono, fontSize: 11, letterSpacing: "0.14em", color: "#FFFFFF", borderBottom: "1px solid #FFFFFF", paddingBottom: 4, marginTop: "clamp(22px,3vw,36px)" }}>ABOUT MEMBERSHIP →</a>
          </div>
          <div style={{ flex: "1 1 280px", maxWidth: 460 }}>
            {["Free delivery on every order", "A standing member's discount", "First refusal on new arrivals", "The back room by appointment"].map((t, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "34px 1fr", gap: 16, borderTop: "1px solid #33332E", padding: "clamp(13px,1.6vw,18px) 0" }}>
                <span style={{ fontFamily: V.mono, fontSize: 9, letterSpacing: "0.1em", color: "#7A756F", paddingTop: 3 }}>{String(i + 1).padStart(2, "0")}</span>
                <span style={{ fontFamily: V.body, fontWeight: 300, fontSize: "clamp(15px,1.5vw,18px)", lineHeight: 1.35, color: "#F0F0EA" }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* newsletter */}
      <section style={{ padding: "clamp(84px,11vw,168px) " + PAD + " clamp(56px,7vw,96px)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(24px,4vw,72px)", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ flex: "1 1 340px" }}>
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
        <div style={{ height: "clamp(56px,9vw,128px)", overflow: "hidden", marginTop: "clamp(14px,2vw,26px)" }}>
          <div style={{ fontFamily: V.display, fontWeight: 800, fontSize: "clamp(88px,21vw,300px)", lineHeight: 0.72, letterSpacing: "-0.045em", color: V.ink }}>VITRINE</div>
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
