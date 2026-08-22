// Shared page chrome: Announce, BrandStrip, Footer. Nav is loaded from nav.jsx.

const ANNOUNCE = [
  "Free delivery across Sri Lanka on orders over LKR 25,000",
  "Now stocking — AYANA Ceylon & Serendib",
  "Hand-wrapped gifting with every order",
  "Three free samples with every purchase",
  "Visit us — 33 Galle Face Terrace, Colombo 03",
];

function Announce() {
  const items = [...ANNOUNCE, ...ANNOUNCE, ...ANNOUNCE];
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
          const cls = b.font?.startsWith("Cormorant") ? "it" : b.font?.startsWith("Manrope") ? "sn" : "";
          return (<span key={i}><span className={cls}>{b.name}</span><span className="sep"></span></span>);
        })}
      </div>
    </div>
  );
}

function Footer({ name = "VITRINE", tagline = "Beauty, Hand-Picked" }) {
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
    <footer className="footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <div className="mark">{name}<small>{tagline} &middot; {locs[0]?.name?.split("—")[1]?.trim() || "Colombo"} &middot; Since {founded}</small></div>
          <p>{blurb}</p>
        </div>
        <div className="footer-col"><h5>Shop</h5>
          <a href="Shop.html">Shop All</a>
          <a href="Shop.html#cat=skincare">Skincare</a>
          <a href="Shop.html#cat=makeup">Makeup</a>
          <a href="Shop.html#cat=fragrance">Fragrance</a>
          <a href="Shop.html#cat=body">Body &amp; Hair</a>
        </div>
        <div className="footer-col"><h5>Brands</h5>
          <a href="/#brands">All Brands</a>
          <a href="Shop.html#new=1">New Arrivals</a>
          <a href="Shop.html#ceylon=1">Ceylon Brands</a>
          <a href="Shop.html#sale=1">Sale</a>
        </div>
        <div className="footer-col"><h5>Help</h5>
          <a href="contact.html">Contact</a>
          <a href="contact.html#delivery">Delivery</a>
          <a href="contact.html#returns">Returns</a>
          <a href="contact.html#gifting">Gift Wrapping</a>
          <a href="contact.html#faq">FAQ</a>
          <a href="key.html">The Key</a>
        </div>
        <div className="footer-col"><h5>Visit</h5>
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

window.Announce    = Announce;
window.BrandStrip  = BrandStrip;
window.Footer      = Footer;

// ProductVisual is provided by data.jsx (so it loads on every page that uses Bottle).

// Bootstrapper: pages that don't have static data.jsx use this to populate BRANDS+BRAND_LIST
// from /api/brands. It blocks the React render until data is in place.
window.loadCatalogChrome = async function loadCatalogChrome() {
  if (window.BRANDS && window.BRAND_LIST) return;
  const brands = await window.api.get("/api/brands");
  const map = {};
  brands.forEach(b => {
    map[b.key] = { name: b.name, font: b.font, case: b.case, accent: b.accent, tagline: b.tagline, loc: b.loc, cat: b.cat };
  });
  window.BRANDS = map;
  window.BRAND_LIST = brands.map(b => b.key);
  window.EDIT = window.EDIT || [];
  window.SALE = window.SALE || [];
};
