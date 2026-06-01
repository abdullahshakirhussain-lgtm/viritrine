// Extended product catalog for the Shop page (30 products).
// Categories: skincare · makeup · fragrance · body
// Concerns: brightening · anti-aging · hydration · sensitive · oily · dry
//
// Each product:
//   { id, brand, name, italic, category, sub, concerns: [],
//     price, sale?, off?, size, variant, liquid, liquidTop,
//     copy, notes: [], isNew?, isCeylon? (auto), isBestseller? }

const PRODUCTS = [
  // ─── Skincare (10) ────────────────────────────────────────────
  { id: "ay-01", brand: "ayana",    name: "Tea",       italic: "Glow",      category: "skincare", sub: "moisturizer", concerns: ["brightening","hydration"], price: 24500, size: "50 ML", variant: "jar",        liquid: "#1F4538", liquidTop: "#9BB7A7", copy: "Ceylon green tea, gotu kola and saffron pressed into a featherweight day cream.", notes: ["Green Tea","Gotu Kola","Saffron"], isBestseller: true },
  { id: "sl-01", brand: "saint",    name: "Gold",      italic: "Oil",       category: "skincare", sub: "serum",       concerns: ["dry","brightening"],       price: 48000, size: "30 ML", variant: "dropper",    liquid: "#C49453", liquidTop: "#F0DBA3", copy: "Forty-two botanical actives in a weightless oil — for skin that reads as lit from within.", notes: ["Argan","Rosehip","Squalane"], isBestseller: true },
  { id: "hg-01", brand: "harlow",   name: "Clay",      italic: "Pure",      category: "skincare", sub: "mask",        concerns: ["oily","sensitive"],        price: 19500, sale: 13650, off: 30, size: "75 ML", variant: "tube",       liquid: "#C9B89A", liquidTop: "#E8DBC1", copy: "Kaolin & bentonite mask that draws without stripping — five minutes, twice a week.", notes: ["Kaolin","Bentonite","Aloe"] },
  { id: "lu-01", brand: "lune",     name: "Verte",     italic: "Cream",     category: "skincare", sub: "moisturizer", concerns: ["sensitive","hydration"],   price: 22000, size: "50 ML", variant: "jar",        liquid: "#4F6A4F", liquidTop: "#9BB7A7", copy: "A green-tinted cream of cica, centella and Provençal botanicals. Calms in minutes.", notes: ["Centella","Cica","Calendula"] },
  { id: "ko-01", brand: "korper",   name: "Foam",      italic: "Mineral",   category: "skincare", sub: "cleanser",    concerns: ["oily"],                    price: 16000, size: "150 ML",variant: "tube",       liquid: "#5C5A52", liquidTop: "#A8B6BA", copy: "Swiss spring water + amino-acid cleanser. Leaves no tightness.", notes: ["Mineral Water","Amino Acids"] },
  { id: "ay-02", brand: "ayana",    name: "Saffron",   italic: "Drops",     category: "skincare", sub: "serum",       concerns: ["brightening"],             price: 32000, size: "30 ML", variant: "dropper",    liquid: "#A47F38", liquidTop: "#E8C9BD", copy: "Ceylon saffron + niacinamide — even tone, three weeks.", notes: ["Saffron","Niacinamide","Liquorice"], isNew: true },
  { id: "ha-01", brand: "hane",     name: "Rice",      italic: "Wash",      category: "skincare", sub: "cleanser",    concerns: ["dry","sensitive"],         price: 14500, size: "150 ML",variant: "tube",       liquid: "#EDE5D2", liquidTop: "#F8F2E2", copy: "Fermented rice milk cleanser. Gentle enough for morning daily use.", notes: ["Rice Bran","Sake Kasu","Glycerin"] },
  { id: "sl-02", brand: "saint",    name: "Night",     italic: "Repair",    category: "skincare", sub: "moisturizer", concerns: ["anti-aging"],              price: 54000, size: "50 ML", variant: "jar",        liquid: "#6B1E3F", liquidTop: "#A35E6F", copy: "Retinal + peptide night cream. Visible smoothing in twelve nights.", notes: ["Retinal","Peptides","Bakuchiol"] },
  { id: "oa-01", brand: "oak",      name: "Cypress",   italic: "SPF",       category: "skincare", sub: "spf",         concerns: ["sensitive"],               price: 18500, size: "50 ML", variant: "tube",       liquid: "#4F6A4F", liquidTop: "#8FA8A0", copy: "Mineral SPF 50 in a lightweight Japanese formulation. No white cast.", notes: ["Zinc Oxide","Cypress","Niacinamide"], isNew: true },
  { id: "ve-01", brand: "vera",     name: "Rose",      italic: "Tonic",     category: "skincare", sub: "toner",       concerns: ["hydration"],               price: 14800, size: "200 ML",variant: "flacon",     liquid: "#A35E6F", liquidTop: "#E5BFAA", copy: "Damask rose hydrosol toner. Misted or pressed in.", notes: ["Damask Rose","Glycerin","HA"] },

  // ─── Makeup (6) ───────────────────────────────────────────────
  { id: "fl-01", brand: "florent",  name: "Red",       italic: "No. 12",    category: "makeup",  sub: "lip",       concerns: [], price: 16500, size: "3.5 G", variant: "compact", liquid: "#7A1B2F", liquidTop: "#A23148", copy: "Florent's house red — matte velvet, theatre curtain.", notes: ["Carnauba","Pigment","Beeswax"], isBestseller: true },
  { id: "fl-02", brand: "florent",  name: "Bronze",    italic: "No. 04",    category: "makeup",  sub: "lip",       concerns: [], price: 14800, size: "3.5 G", variant: "compact", liquid: "#6B4423", liquidTop: "#A88762", copy: "A warm bronze nude, the lipstick everyone borrows.", notes: ["Carnauba","Pigment","Vitamin E"] },
  { id: "hg-02", brand: "harlow",   name: "Smoke",     italic: "No. 01",    category: "makeup",  sub: "eye",       concerns: [], price: 18000, size: "8 G",   variant: "compact", liquid: "#1A1410", liquidTop: "#5A4A3D", copy: "Six greys & charcoals — the only eye palette you need.", notes: ["Mica","Silica","Pigment"] },
  { id: "fl-03", brand: "florent",  name: "Glow",      italic: "Stick",     category: "makeup",  sub: "face",      concerns: [], price: 19500, size: "9 G",   variant: "tall",    liquid: "#F0DBA3", liquidTop: "#FFFFFF", copy: "Cream highlighter in a brass twist — cheekbones, on demand.", notes: ["Mica","Pearl","Shea"], isNew: true },
  { id: "fl-04", brand: "florent",  name: "Plum",      italic: "No. 08",    category: "makeup",  sub: "lip",       concerns: [], price: 16500, size: "3.5 G", variant: "compact", liquid: "#5A1430", liquidTop: "#7A4A52", copy: "An after-dark plum, deep as midnight.", notes: ["Carnauba","Pigment","Beeswax"] },
  { id: "hg-03", brand: "harlow",   name: "Cheek",     italic: "Velvet",    category: "makeup",  sub: "face",      concerns: [], price: 15800, size: "6 G",   variant: "compact", liquid: "#E5BFAA", liquidTop: "#F2D5C5", copy: "Cream blush, lit-from-within, in five flesh tones.", notes: ["Squalane","Mica","Pigment"] },

  // ─── Fragrance (6) ────────────────────────────────────────────
  { id: "no-01", brand: "noire",    name: "Velvet",    italic: "Black",     category: "fragrance", sub: "perfume", concerns: [], price: 86000, size: "75 ML", variant: "flacon",     liquid: "#1A1410", liquidTop: "#5A4A3D", copy: "Black iris, soft leather, and a whisper of incense. Seven notes.", notes: ["Iris","Leather","Incense"], isBestseller: true },
  { id: "ve-02", brand: "vera",     name: "Cardamom",  italic: "No. 7",     category: "fragrance", sub: "perfume", concerns: [], price: 72000, size: "100 ML",variant: "flacon",     liquid: "#6B1E3F", liquidTop: "#C49AAE", copy: "Indian cardamom, Calabrian bergamot, dry cedar.", notes: ["Cardamom","Bergamot","Cedar"], isNew: true },
  { id: "oa-02", brand: "oak",      name: "Cedar",     italic: "Eau",       category: "fragrance", sub: "perfume", concerns: [], price: 64000, size: "75 ML", variant: "apothecary", liquid: "#4A3826", liquidTop: "#A88A6D", copy: "Kyoto cedar, hinoki, faint smoke.", notes: ["Cedar","Hinoki","Smoke"] },
  { id: "vp-01", brand: "vesper",   name: "Day",       italic: "Mist",      category: "fragrance", sub: "mist",    concerns: [], price: 18000, size: "100 ML",variant: "tall",       liquid: "#7A4A3A", liquidTop: "#C49A86", copy: "A fine mist of bergamot and tea — for refreshes through the day.", notes: ["Bergamot","White Tea","Cypress"] },
  { id: "ve-03", brand: "vera",     name: "Bois",      italic: "Candle",    category: "fragrance", sub: "candle",  concerns: [], price: 22000, size: "240 G", variant: "jar",        liquid: "#4A2C1A", liquidTop: "#A3724F", copy: "Hand-poured coconut wax candle, 48-hour burn.", notes: ["Cedar","Vetiver","Tonka"] },
  { id: "no-02", brand: "noire",    name: "Smoke",     italic: "Eau",       category: "fragrance", sub: "perfume", concerns: [], price: 78000, size: "75 ML", variant: "flacon",     liquid: "#2A1A18", liquidTop: "#7A5A4D", copy: "Birch tar, papyrus, vetiver. Quiet, but unforgettable.", notes: ["Birch","Papyrus","Vetiver"] },

  // ─── Body & Hair (8) ──────────────────────────────────────────
  { id: "be-01", brand: "berg",     name: "North",     italic: "Oil",       category: "body", sub: "oil",   concerns: ["dry"], price: 28000, sale: 16800, off: 40, size: "200 ML",variant: "tall",       liquid: "#4A2C1A", liquidTop: "#A3724F", copy: "Cold-pressed Nordic seed oils — for skin after the long winter.", notes: ["Lingonberry","Sea Buckthorn","Hempseed"] },
  { id: "se-01", brand: "serendib", name: "Cinnamon",  italic: "Bath",      category: "body", sub: "oil",   concerns: [],      price: 21000, sale: 14700, off: 30, size: "200 ML",variant: "tall",       liquid: "#6B3E22", liquidTop: "#D8A876", copy: "Ceylon cinnamon and ginger oil — warming bath after the rain.", notes: ["Cinnamon","Ginger","Almond"] },
  { id: "oa-03", brand: "oak",      name: "Cedar",     italic: "Bath",      category: "body", sub: "wash",  concerns: [],      price: 12800, sale: 8900, off: 30, size: "250 ML",variant: "apothecary", liquid: "#4A3826", liquidTop: "#A88A6D", copy: "Smoky cedar bath gel from Kyoto.", notes: ["Cedar","Hinoki","Glycerin"] },
  { id: "vp-02", brand: "vesper",   name: "Hair",      italic: "Tonic",     category: "body", sub: "hair",  concerns: [],      price: 14200, sale: 10650, off: 25, size: "100 ML",variant: "dropper",    liquid: "#7A4A3A", liquidTop: "#C49A86", copy: "Rosemary + caffeine tonic — applied at roots, twice a week.", notes: ["Rosemary","Caffeine","Saw Palmetto"] },
  { id: "ko-02", brand: "korper",   name: "Mineral",   italic: "Lotion",    category: "body", sub: "lotion",concerns: ["dry","sensitive"], price: 16000, size: "200 ML",variant: "tube",       liquid: "#5C5A52", liquidTop: "#A8B6BA", copy: "Body lotion that absorbs in seconds, no residue.", notes: ["Mineral Water","Glycerin","Allantoin"] },
  { id: "be-02", brand: "berg",     name: "Hand",      italic: "Cream",     category: "body", sub: "hand",  concerns: ["dry"], price: 8500, size: "50 ML",  variant: "tube",       liquid: "#3D4A52", liquidTop: "#A3B4BC", copy: "A small heritage tube. For the hands of those who wash often.", notes: ["Shea","Beeswax","Almond"] },
  { id: "se-02", brand: "serendib", name: "Ginger",    italic: "Mist",      category: "body", sub: "hair",  concerns: [],      price: 12500, size: "100 ML",variant: "tall",       liquid: "#A47F38", liquidTop: "#E8C9BD", copy: "Detangling hair mist with Ceylon ginger and curry leaf.", notes: ["Ginger","Curry Leaf","Argan"], isNew: true },
  { id: "ay-03", brand: "ayana",    name: "Coconut",   italic: "Oil",       category: "body", sub: "oil",   concerns: ["dry"], price: 14000, size: "250 ML",variant: "tall",       liquid: "#A88A6D", liquidTop: "#F0DBA3", copy: "Single-origin Sri Lankan virgin coconut oil. Body, hair, kitchen.", notes: ["Virgin Coconut Oil"] },
];

const CATEGORIES = [
  { key: "skincare",  label: "Skincare",  italic: "& Treatment" },
  { key: "makeup",    label: "Makeup",    italic: "& Color" },
  { key: "fragrance", label: "Fragrance", italic: "& Scent" },
  { key: "body",      label: "Body",      italic: "& Hair" },
];

const CONCERNS = [
  { key: "brightening", label: "Brightening" },
  { key: "anti-aging",  label: "Anti-aging" },
  { key: "hydration",   label: "Hydration" },
  { key: "sensitive",   label: "Sensitive" },
  { key: "oily",        label: "Oily / Acne" },
  { key: "dry",         label: "Dry / Dehydrated" },
];

const SORTS = [
  { key: "featured",     label: "Featured" },
  { key: "new",          label: "Newest" },
  { key: "price-asc",    label: "Price ↑" },
  { key: "price-desc",   label: "Price ↓" },
  { key: "bestselling",  label: "Bestselling" },
  { key: "off-desc",     label: "% Off" },
];

window.PRODUCTS  = PRODUCTS;
window.CATEGORIES = CATEGORIES;
window.CONCERNS  = CONCERNS;
window.SORTS     = SORTS;
