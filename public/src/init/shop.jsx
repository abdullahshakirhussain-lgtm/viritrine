// Shared bits from homepage App.jsx — small inline pieces (Announce, BrandStrip, Footer).
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
        {items.map((t, i) => (<span key={i}><span>{t}</span><span className="dot"></span></span>))}
      </div>
    </div>
  );
}
function BrandStrip() {
  const names = BRAND_LIST.map(k => BRANDS[k]);
  const dup = [...names, ...names, ...names];
  return (
    <div className="brand-strip" aria-hidden="true">
      <div className="brand-track">
        {dup.map((b, i) => {
          const cls = b.font.startsWith("Cormorant") ? "it" : b.font.startsWith("Manrope") ? "sn" : "";
          return (<span key={i}><span className={cls}>{b.name}</span><span className="sep"></span></span>);
        })}
      </div>
    </div>
  );
}
function Footer({ name, tagline }) {
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <div className="mark">{name}<small>{tagline} &middot; Colombo &middot; Since 1998</small></div>
          <p>A Colombo beauty shop carrying the brands we love — from Ceylon to Kyoto, Lyon to Brooklyn. Hand-picked, hand-wrapped, delivered across the island.</p>
        </div>
        <div className="footer-col"><h5>Shop</h5><a href="Shop.html">Shop All</a><a href="Shop.html#cat=skincare">Skincare</a><a href="Shop.html#cat=makeup">Makeup</a><a href="Shop.html#cat=fragrance">Fragrance</a><a href="Shop.html#cat=body">Body &amp; Hair</a></div>
        <div className="footer-col"><h5>Brands</h5><a href="Shop.html">All Brands</a><a href="Shop.html#new=1">New Arrivals</a><a href="Shop.html#ceylon=1">Ceylon Brands</a><a href="Shop.html#sale=1">Sale</a></div>
        <div className="footer-col"><h5>Help</h5><a href="#">Contact</a><a href="#">Delivery</a><a href="#">Returns</a><a href="#">Gift Wrapping</a><a href="#">FAQ</a></div>
        <div className="footer-col"><h5>Visit</h5><a href="#">33 Galle Face Terrace<br/>Colombo 03</a><a href="#">Pop-up &middot; Galle Fort</a><a href="#">+94 11 555 1998</a><a href="#">hello@vitrine.lk</a></div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 {name} &middot; Made in Sri Lanka</span>
        <div className="socials"><a href="#">Instagram</a><a href="#">Pinterest</a><a href="#">WhatsApp</a></div>
      </div>
    </footer>
  );
}
window.Announce = Announce; window.BrandStrip = BrandStrip; window.Footer = Footer;
