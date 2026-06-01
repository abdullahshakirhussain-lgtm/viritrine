// Brand catalogue & product edit. A mix of international houses + Ceylon.

const BRANDS = {
  vera:    { name: "VERA & CO.",    font: "Italiana, serif",          case: "upper", accent: "#6B1E3F", tagline: "PARIS",                loc: "Paris",     cat: "Perfume · Skin" },
  saint:   { name: "Saint Léon",    font: "Cormorant Garamond, serif", case: "title", accent: "#6B1E3F", tagline: "LYON · 1981",          loc: "Lyon",      cat: "Skin · Body" },
  harlow:  { name: "HARLOW + GREY", font: "Manrope, sans-serif",      case: "upper", accent: "#1A1410", tagline: "NEW YORK",             loc: "Brooklyn",  cat: "Skin · Makeup" },
  lune:    { name: "Lune",          font: "Cormorant Garamond, serif", case: "title", accent: "#1F4538", tagline: "GREEN BEAUTY",         loc: "Provence",  cat: "Botanical Skin" },
  noire:   { name: "NOIRE",         font: "Italiana, serif",          case: "upper", accent: "#18120E", tagline: "MILANO",               loc: "Milano",    cat: "Perfume" },
  korper:  { name: "KÖRPER",        font: "Manrope, sans-serif",      case: "upper", accent: "#5C5A52", tagline: "ZÜRICH · 2008",        loc: "Zürich",    cat: "Body Care" },
  vesper:  { name: "Vesper",        font: "Cormorant Garamond, serif", case: "title", accent: "#7A4A3A", tagline: "LONDON",               loc: "London",    cat: "Perfume · Hair" },
  oak:     { name: "OAK & ASH",     font: "Italiana, serif",          case: "upper", accent: "#6B4423", tagline: "KYOTO",                loc: "Kyoto",     cat: "Bath · Botanical" },
  florent: { name: "Florent",       font: "Cormorant Garamond, serif", case: "title", accent: "#9E2D4F", tagline: "PARIS · 1962",         loc: "Paris",     cat: "Makeup" },
  hane:    { name: "HANE",          font: "Italiana, serif",          case: "upper", accent: "#7A4A3A", tagline: "TOKYO",                loc: "Tokyo",     cat: "Clean Beauty" },
  ayana:   { name: "AYANA",         font: "Italiana, serif",          case: "upper", accent: "#1F4538", tagline: "CEYLON · 2017",        loc: "Colombo",   cat: "Tea-infused Skin" },
  serendib:{ name: "Serendib",      font: "Cormorant Garamond, serif", case: "title", accent: "#A47F38", tagline: "CEYLON SPICE",         loc: "Galle",     cat: "Body · Aromatic" },
  berg:    { name: "Berg & Søn",    font: "Cormorant Garamond, serif", case: "title", accent: "#3D4A52", tagline: "OSLO · 1971",          loc: "Oslo",      cat: "Body · Heritage" },
};

const EDIT = [
  { id: "ve-02", brand: "vera",     tag: "New",        name: "Cardamom", italic: "No. 7",  cat: "Perfume · 100ml",  price: "LKR 72,000", variant: "flacon",     liquid: "#6B1E3F", liquidTop: "#C49AAE" },
  { id: "ay-01", brand: "ayana",    tag: "Ceylon",     name: "Tea",      italic: "Glow",   cat: "Day Cream · 50ml", price: "LKR 24,500", variant: "jar",        liquid: "#1F4538", liquidTop: "#9BB7A7" },
  { id: "sl-01", brand: "saint",    tag: "Bestseller", name: "Gold Oil", italic: "Day",    cat: "Skin · 30ml",      price: "LKR 48,000", variant: "dropper",    liquid: "#C49453", liquidTop: "#F0DBA3" },
  { id: "no-01", brand: "noire",    tag: "Pick",       name: "Velvet",   italic: "Black",  cat: "Perfume · 75ml",   price: "LKR 86,000", variant: "flacon",     liquid: "#1A1410", liquidTop: "#5A4A3D" },
  { id: "hg-01", brand: "harlow",   tag: "New",        name: "Clay",     italic: "Pure",   cat: "Mask · 75ml",      price: "LKR 19,500", variant: "tube",       liquid: "#C9B89A", liquidTop: "#E8DBC1" },
  { id: "se-01", brand: "serendib", tag: "Ceylon",     name: "Cinnamon", italic: "Bath",   cat: "Body Oil · 200ml", price: "LKR 21,000", variant: "tall",       liquid: "#6B3E22", liquidTop: "#D8A876" },
  { id: "fl-01", brand: "florent",  tag: "Iconic",     name: "Red",      italic: "No. 12", cat: "Lip · Compact",    price: "LKR 16,500", variant: "compact",    liquid: "#7A1B2F", liquidTop: "#A23148" },
  { id: "be-01", brand: "berg",     tag: "Heritage",   name: "North",    italic: "Oil",    cat: "Body · 200ml",     price: "LKR 28,000", variant: "tall",       liquid: "#4A2C1A", liquidTop: "#A3724F" },
];

const BRAND_LIST = ["vera","ayana","saint","harlow","lune","noire","korper","vesper","oak","serendib","florent","hane","berg"];

window.BRANDS = BRANDS;
window.EDIT = EDIT;
window.BRAND_LIST = BRAND_LIST;

// On every page that loads data.jsx, refresh the global brand map from the API
// so admin-added brands (or deletions) are reflected wherever code does BRANDS[key].
// Synchronous static values above remain as a safe fallback during the brief
// boot window before the fetch resolves.
(function syncBrandsFromApi() {
  if (!window.api) return;
  window.api.get("/api/brands").then(rows => {
    if (!Array.isArray(rows)) return;
    const map = {};
    const list = [];
    rows.forEach(b => {
      map[b.key] = {
        name: b.name, font: b.font, case: b.case, accent: b.accent,
        tagline: b.tagline, loc: b.loc, cat: b.cat, image: b.image || null,
      };
      list.push(b.key);
    });
    window.BRANDS = map;
    window.BRAND_LIST = list;
    window.dispatchEvent(new CustomEvent("brands:loaded", { detail: { count: list.length } }));
  }).catch(() => {});
})();

// Render either an uploaded image (when product.image is set) or the generated SVG bottle.
window.ProductVisual = function ProductVisual({ image, variant, brand, product, liquid, liquidTop, alt, fit = "contain" }) {
  if (image) {
    return (
      <img src={image} alt={alt || (product && product.name) || ""}
           style={{ width: "100%", height: "100%", objectFit: fit, position: "relative", zIndex: 1 }} />
    );
  }
  return <Bottle variant={variant} brand={brand} product={product} liquid={liquid} liquidTop={liquidTop} />;
};

