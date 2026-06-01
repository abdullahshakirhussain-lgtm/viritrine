const bcrypt = require("bcryptjs");
const db = require("./db");

const BRANDS = [
  { key: "vera",     name: "VERA & CO.",    font: "Italiana, serif",           case_: "upper", accent: "#6B1E3F", tagline: "PARIS",          loc: "Paris",    cat: "Perfume · Skin" },
  { key: "saint",    name: "Saint Léon",    font: "Cormorant Garamond, serif", case_: "title", accent: "#6B1E3F", tagline: "LYON · 1981",    loc: "Lyon",     cat: "Skin · Body" },
  { key: "harlow",   name: "HARLOW + GREY", font: "Manrope, sans-serif",       case_: "upper", accent: "#1A1410", tagline: "NEW YORK",       loc: "Brooklyn", cat: "Skin · Makeup" },
  { key: "lune",     name: "Lune",          font: "Cormorant Garamond, serif", case_: "title", accent: "#1F4538", tagline: "GREEN BEAUTY",   loc: "Provence", cat: "Botanical Skin" },
  { key: "noire",    name: "NOIRE",         font: "Italiana, serif",           case_: "upper", accent: "#18120E", tagline: "MILANO",         loc: "Milano",   cat: "Perfume" },
  { key: "korper",   name: "KÖRPER",        font: "Manrope, sans-serif",       case_: "upper", accent: "#5C5A52", tagline: "ZÜRICH · 2008",  loc: "Zürich",   cat: "Body Care" },
  { key: "vesper",   name: "Vesper",        font: "Cormorant Garamond, serif", case_: "title", accent: "#7A4A3A", tagline: "LONDON",         loc: "London",   cat: "Perfume · Hair" },
  { key: "oak",      name: "OAK & ASH",     font: "Italiana, serif",           case_: "upper", accent: "#6B4423", tagline: "KYOTO",          loc: "Kyoto",    cat: "Bath · Botanical" },
  { key: "florent",  name: "Florent",       font: "Cormorant Garamond, serif", case_: "title", accent: "#9E2D4F", tagline: "PARIS · 1962",   loc: "Paris",    cat: "Makeup" },
  { key: "hane",     name: "HANE",          font: "Italiana, serif",           case_: "upper", accent: "#7A4A3A", tagline: "TOKYO",          loc: "Tokyo",    cat: "Clean Beauty" },
  { key: "ayana",    name: "AYANA",         font: "Italiana, serif",           case_: "upper", accent: "#1F4538", tagline: "CEYLON · 2017",  loc: "Colombo",  cat: "Tea-infused Skin" },
  { key: "serendib", name: "Serendib",      font: "Cormorant Garamond, serif", case_: "title", accent: "#A47F38", tagline: "CEYLON SPICE",   loc: "Galle",    cat: "Body · Aromatic" },
  { key: "berg",     name: "Berg & Søn",    font: "Cormorant Garamond, serif", case_: "title", accent: "#3D4A52", tagline: "OSLO · 1971",    loc: "Oslo",     cat: "Body · Heritage" },
];

const PRODUCTS = [
  { id:"ay-01", brand:"ayana",    name:"Tea",       italic:"Glow",     category:"skincare",  sub:"moisturizer", concerns:["brightening","hydration"], price:24500,                size:"50 ML",  variant:"jar",        liquid:"#1F4538", liquidTop:"#9BB7A7", copy:"Ceylon green tea, gotu kola and saffron pressed into a featherweight day cream.", notes:["Green Tea","Gotu Kola","Saffron"],       isBestseller:true },
  { id:"sl-01", brand:"saint",    name:"Gold",      italic:"Oil",      category:"skincare",  sub:"serum",       concerns:["dry","brightening"],       price:48000,                size:"30 ML",  variant:"dropper",    liquid:"#C49453", liquidTop:"#F0DBA3", copy:"Forty-two botanical actives in a weightless oil — for skin that reads as lit from within.", notes:["Argan","Rosehip","Squalane"], isBestseller:true },
  { id:"hg-01", brand:"harlow",   name:"Clay",      italic:"Pure",     category:"skincare",  sub:"mask",        concerns:["oily","sensitive"],        price:19500, sale:13650, off:30, size:"75 ML",  variant:"tube",       liquid:"#C9B89A", liquidTop:"#E8DBC1", copy:"Kaolin & bentonite mask that draws without stripping — five minutes, twice a week.", notes:["Kaolin","Bentonite","Aloe"] },
  { id:"lu-01", brand:"lune",     name:"Verte",     italic:"Cream",    category:"skincare",  sub:"moisturizer", concerns:["sensitive","hydration"],   price:22000,                size:"50 ML",  variant:"jar",        liquid:"#4F6A4F", liquidTop:"#9BB7A7", copy:"A green-tinted cream of cica, centella and Provençal botanicals. Calms in minutes.", notes:["Centella","Cica","Calendula"] },
  { id:"ko-01", brand:"korper",   name:"Foam",      italic:"Mineral",  category:"skincare",  sub:"cleanser",    concerns:["oily"],                    price:16000,                size:"150 ML", variant:"tube",       liquid:"#5C5A52", liquidTop:"#A8B6BA", copy:"Swiss spring water + amino-acid cleanser. Leaves no tightness.", notes:["Mineral Water","Amino Acids"] },
  { id:"ay-02", brand:"ayana",    name:"Saffron",   italic:"Drops",    category:"skincare",  sub:"serum",       concerns:["brightening"],             price:32000,                size:"30 ML",  variant:"dropper",    liquid:"#A47F38", liquidTop:"#E8C9BD", copy:"Ceylon saffron + niacinamide — even tone, three weeks.", notes:["Saffron","Niacinamide","Liquorice"], isNew:true },
  { id:"ha-01", brand:"hane",     name:"Rice",      italic:"Wash",     category:"skincare",  sub:"cleanser",    concerns:["dry","sensitive"],         price:14500,                size:"150 ML", variant:"tube",       liquid:"#EDE5D2", liquidTop:"#F8F2E2", copy:"Fermented rice milk cleanser. Gentle enough for morning daily use.", notes:["Rice Bran","Sake Kasu","Glycerin"] },
  { id:"sl-02", brand:"saint",    name:"Night",     italic:"Repair",   category:"skincare",  sub:"moisturizer", concerns:["anti-aging"],              price:54000,                size:"50 ML",  variant:"jar",        liquid:"#6B1E3F", liquidTop:"#A35E6F", copy:"Retinal + peptide night cream. Visible smoothing in twelve nights.", notes:["Retinal","Peptides","Bakuchiol"] },
  { id:"oa-01", brand:"oak",      name:"Cypress",   italic:"SPF",      category:"skincare",  sub:"spf",         concerns:["sensitive"],               price:18500,                size:"50 ML",  variant:"tube",       liquid:"#4F6A4F", liquidTop:"#8FA8A0", copy:"Mineral SPF 50 in a lightweight Japanese formulation. No white cast.", notes:["Zinc Oxide","Cypress","Niacinamide"], isNew:true },
  { id:"ve-01", brand:"vera",     name:"Rose",      italic:"Tonic",    category:"skincare",  sub:"toner",       concerns:["hydration"],               price:14800,                size:"200 ML", variant:"flacon",     liquid:"#A35E6F", liquidTop:"#E5BFAA", copy:"Damask rose hydrosol toner. Misted or pressed in.", notes:["Damask Rose","Glycerin","HA"] },
  { id:"fl-01", brand:"florent",  name:"Red",       italic:"No. 12",   category:"makeup",    sub:"lip",         concerns:[],                          price:16500,                size:"3.5 G",  variant:"compact",    liquid:"#7A1B2F", liquidTop:"#A23148", copy:"Florent's house red — matte velvet, theatre curtain.", notes:["Carnauba","Pigment","Beeswax"], isBestseller:true },
  { id:"fl-02", brand:"florent",  name:"Bronze",    italic:"No. 04",   category:"makeup",    sub:"lip",         concerns:[],                          price:14800,                size:"3.5 G",  variant:"compact",    liquid:"#6B4423", liquidTop:"#A88762", copy:"A warm bronze nude, the lipstick everyone borrows.", notes:["Carnauba","Pigment","Vitamin E"] },
  { id:"hg-02", brand:"harlow",   name:"Smoke",     italic:"No. 01",   category:"makeup",    sub:"eye",         concerns:[],                          price:18000,                size:"8 G",    variant:"compact",    liquid:"#1A1410", liquidTop:"#5A4A3D", copy:"Six greys & charcoals — the only eye palette you need.", notes:["Mica","Silica","Pigment"] },
  { id:"fl-03", brand:"florent",  name:"Glow",      italic:"Stick",    category:"makeup",    sub:"face",        concerns:[],                          price:19500,                size:"9 G",    variant:"tall",       liquid:"#F0DBA3", liquidTop:"#FFFFFF", copy:"Cream highlighter in a brass twist — cheekbones, on demand.", notes:["Mica","Pearl","Shea"], isNew:true },
  { id:"fl-04", brand:"florent",  name:"Plum",      italic:"No. 08",   category:"makeup",    sub:"lip",         concerns:[],                          price:16500,                size:"3.5 G",  variant:"compact",    liquid:"#5A1430", liquidTop:"#7A4A52", copy:"An after-dark plum, deep as midnight.", notes:["Carnauba","Pigment","Beeswax"] },
  { id:"hg-03", brand:"harlow",   name:"Cheek",     italic:"Velvet",   category:"makeup",    sub:"face",        concerns:[],                          price:15800,                size:"6 G",    variant:"compact",    liquid:"#E5BFAA", liquidTop:"#F2D5C5", copy:"Cream blush, lit-from-within, in five flesh tones.", notes:["Squalane","Mica","Pigment"] },
  { id:"no-01", brand:"noire",    name:"Velvet",    italic:"Black",    category:"fragrance", sub:"perfume",     concerns:[],                          price:86000,                size:"75 ML",  variant:"flacon",     liquid:"#1A1410", liquidTop:"#5A4A3D", copy:"Black iris, soft leather, and a whisper of incense. Seven notes.", notes:["Iris","Leather","Incense"], isBestseller:true },
  { id:"ve-02", brand:"vera",     name:"Cardamom",  italic:"No. 7",    category:"fragrance", sub:"perfume",     concerns:[],                          price:72000,                size:"100 ML", variant:"flacon",     liquid:"#6B1E3F", liquidTop:"#C49AAE", copy:"Indian cardamom, Calabrian bergamot, dry cedar.", notes:["Cardamom","Bergamot","Cedar"], isNew:true },
  { id:"oa-02", brand:"oak",      name:"Cedar",     italic:"Eau",      category:"fragrance", sub:"perfume",     concerns:[],                          price:64000,                size:"75 ML",  variant:"apothecary", liquid:"#4A3826", liquidTop:"#A88A6D", copy:"Kyoto cedar, hinoki, faint smoke.", notes:["Cedar","Hinoki","Smoke"] },
  { id:"vp-01", brand:"vesper",   name:"Day",       italic:"Mist",     category:"fragrance", sub:"mist",        concerns:[],                          price:18000,                size:"100 ML", variant:"tall",       liquid:"#7A4A3A", liquidTop:"#C49A86", copy:"A fine mist of bergamot and tea — for refreshes through the day.", notes:["Bergamot","White Tea","Cypress"] },
  { id:"ve-03", brand:"vera",     name:"Bois",      italic:"Candle",   category:"fragrance", sub:"candle",      concerns:[],                          price:22000,                size:"240 G",  variant:"jar",        liquid:"#4A2C1A", liquidTop:"#A3724F", copy:"Hand-poured coconut wax candle, 48-hour burn.", notes:["Cedar","Vetiver","Tonka"] },
  { id:"no-02", brand:"noire",    name:"Smoke",     italic:"Eau",      category:"fragrance", sub:"perfume",     concerns:[],                          price:78000,                size:"75 ML",  variant:"flacon",     liquid:"#2A1A18", liquidTop:"#7A5A4D", copy:"Birch tar, papyrus, vetiver. Quiet, but unforgettable.", notes:["Birch","Papyrus","Vetiver"] },
  { id:"be-01", brand:"berg",     name:"North",     italic:"Oil",      category:"body",      sub:"oil",         concerns:["dry"],                     price:28000, sale:16800, off:40, size:"200 ML", variant:"tall",       liquid:"#4A2C1A", liquidTop:"#A3724F", copy:"Cold-pressed Nordic seed oils — for skin after the long winter.", notes:["Lingonberry","Sea Buckthorn","Hempseed"] },
  { id:"se-01", brand:"serendib", name:"Cinnamon",  italic:"Bath",     category:"body",      sub:"oil",         concerns:[],                          price:21000, sale:14700, off:30, size:"200 ML", variant:"tall",       liquid:"#6B3E22", liquidTop:"#D8A876", copy:"Ceylon cinnamon and ginger oil — warming bath after the rain.", notes:["Cinnamon","Ginger","Almond"] },
  { id:"oa-03", brand:"oak",      name:"Cedar",     italic:"Bath",     category:"body",      sub:"wash",        concerns:[],                          price:12800, sale:8900,  off:30, size:"250 ML", variant:"apothecary", liquid:"#4A3826", liquidTop:"#A88A6D", copy:"Smoky cedar bath gel from Kyoto.", notes:["Cedar","Hinoki","Glycerin"] },
  { id:"vp-02", brand:"vesper",   name:"Hair",      italic:"Tonic",    category:"body",      sub:"hair",        concerns:[],                          price:14200, sale:10650, off:25, size:"100 ML", variant:"dropper",    liquid:"#7A4A3A", liquidTop:"#C49A86", copy:"Rosemary + caffeine tonic — applied at roots, twice a week.", notes:["Rosemary","Caffeine","Saw Palmetto"] },
  { id:"ko-02", brand:"korper",   name:"Mineral",   italic:"Lotion",   category:"body",      sub:"lotion",      concerns:["dry","sensitive"],         price:16000,                size:"200 ML", variant:"tube",       liquid:"#5C5A52", liquidTop:"#A8B6BA", copy:"Body lotion that absorbs in seconds, no residue.", notes:["Mineral Water","Glycerin","Allantoin"] },
  { id:"be-02", brand:"berg",     name:"Hand",      italic:"Cream",    category:"body",      sub:"hand",        concerns:["dry"],                     price:8500,                 size:"50 ML",  variant:"tube",       liquid:"#3D4A52", liquidTop:"#A3B4BC", copy:"A small heritage tube. For the hands of those who wash often.", notes:["Shea","Beeswax","Almond"] },
  { id:"se-02", brand:"serendib", name:"Ginger",    italic:"Mist",     category:"body",      sub:"hair",        concerns:[],                          price:12500,                size:"100 ML", variant:"tall",       liquid:"#A47F38", liquidTop:"#E8C9BD", copy:"Detangling hair mist with Ceylon ginger and curry leaf.", notes:["Ginger","Curry Leaf","Argan"], isNew:true },
  { id:"ay-03", brand:"ayana",    name:"Coconut",   italic:"Oil",      category:"body",      sub:"oil",         concerns:["dry"],                     price:14000,                size:"250 ML", variant:"tall",       liquid:"#A88A6D", liquidTop:"#F0DBA3", copy:"Single-origin Sri Lankan virgin coconut oil. Body, hair, kitchen.", notes:["Virgin Coconut Oil"] },
];

const insertBrand = db.prepare(`
  INSERT INTO brands (key,name,font,case_,accent,tagline,loc,cat,sort)
  VALUES (@key,@name,@font,@case_,@accent,@tagline,@loc,@cat,@sort)
  ON CONFLICT(key) DO UPDATE SET
    name=excluded.name, font=excluded.font, case_=excluded.case_,
    accent=excluded.accent, tagline=excluded.tagline, loc=excluded.loc,
    cat=excluded.cat, sort=excluded.sort
`);

const insertProduct = db.prepare(`
  INSERT INTO products
    (id,brand_key,name,italic,category,sub,size,variant,liquid,liquid_top,copy,price,sale_price,off_pct,is_new,is_bestseller,stock)
  VALUES
    (@id,@brand_key,@name,@italic,@category,@sub,@size,@variant,@liquid,@liquid_top,@copy,@price,@sale_price,@off_pct,@is_new,@is_bestseller,@stock)
  ON CONFLICT(id) DO UPDATE SET
    brand_key=excluded.brand_key, name=excluded.name, italic=excluded.italic,
    category=excluded.category, sub=excluded.sub, size=excluded.size,
    variant=excluded.variant, liquid=excluded.liquid, liquid_top=excluded.liquid_top,
    copy=excluded.copy, price=excluded.price, sale_price=excluded.sale_price,
    off_pct=excluded.off_pct, is_new=excluded.is_new, is_bestseller=excluded.is_bestseller
`);

const clearConcerns = db.prepare("DELETE FROM product_concerns WHERE product_id=?");
const insertConcern = db.prepare("INSERT INTO product_concerns (product_id, concern) VALUES (?, ?)");
const clearNotes    = db.prepare("DELETE FROM product_notes WHERE product_id=?");
const insertNote    = db.prepare("INSERT INTO product_notes (product_id, note, sort) VALUES (?, ?, ?)");

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

const insertCategory = db.prepare(`
  INSERT INTO categories (key,label,italic,sort) VALUES (?,?,?,?)
  ON CONFLICT(key) DO UPDATE SET label=excluded.label, italic=excluded.italic, sort=excluded.sort
`);
const insertConcernRow = db.prepare(`
  INSERT INTO concerns (key,label,sort) VALUES (?,?,?)
  ON CONFLICT(key) DO UPDATE SET label=excluded.label, sort=excluded.sort
`);

const DEFAULT_SETTINGS = {
  "site.name":             "VITRINE",
  "site.tagline":          "Beauty, Hand-Picked",
  "site.founded":          "1998",
  "site.address_line1":    "33 Galle Face Terrace",
  "site.address_line2":    "Colombo 03",
  "site.phone":            "+94 11 555 1998",
  "site.email":            "hello@vitrine.lk",
  "site.instagram":        "https://instagram.com/vitrine.lk",
  "site.pinterest":        "https://pinterest.com/vitrine.lk",
  "site.whatsapp":         "https://wa.me/94115551998",
  "site.footer_blurb":     "A Colombo beauty shop carrying the brands we love — from Ceylon to Kyoto, Lyon to Brooklyn. Hand-picked, hand-wrapped, delivered across the island.",
  "newsletter.heading":    "The Monthly Letter.",
  "newsletter.heading_em": "Monthly",
  "newsletter.body":       "One email a month — early access to new arrivals, shop events at Galle Face, and the occasional ingredient story. Never more.",
  "shipping.std_lkr":      850,
  "shipping.express_lkr":  1500,
  "shipping.free_over_lkr":25000,
  "shipping.cod_fee_lkr":  200,
  "seo.description":       "A Colombo multi-brand beauty boutique — Ceylon brands, Lyon perfumers, Brooklyn skincare. Hand-picked, hand-wrapped, delivered across Sri Lanka.",
  "seo.og_image":          "",
  "seo.twitter":           "",
  "seo.allow_indexing":    true,
  "checkout.samples": [
    "AYANA — Tea Glow sachet",
    "Saint Léon — Gold Oil mini",
    "Florent — Red No. 12 swatch",
    "NOIRE — Velvet Black spritz",
    "Lune — Verte Cream sachet",
    "Vesper — Day Mist mini",
  ],
};

const DEFAULT_ANNOUNCEMENTS = [
  "Free delivery across Sri Lanka on orders over LKR 25,000",
  "Now stocking — AYANA Ceylon & Serendib",
  "Hand-wrapped gifting with every order",
  "Three free samples with every purchase",
  "Visit us — 33 Galle Face Terrace, Colombo 03",
];

const DEFAULT_HERO = [
  { product_id: "ay-01", custom_tag: "Pick of the week" },
  { product_id: "fl-01", custom_tag: "Iconic, since 1962" },
  { product_id: "sl-01", custom_tag: "Bestseller of the season" },
  { product_id: "no-01", custom_tag: "Arrived this month" },
];

const DEFAULT_EDITORIAL = [
  { id: "ve-02", tag: "New" },
  { id: "ay-01", tag: "Ceylon" },
  { id: "sl-01", tag: "Bestseller" },
  { id: "no-01", tag: "Pick" },
  { id: "hg-01", tag: "New" },
  { id: "se-01", tag: "Ceylon" },
  { id: "fl-01", tag: "Iconic" },
  { id: "be-01", tag: "Heritage" },
];

const DEFAULT_JOURNAL = [
  {
    slug: "morning-in-kandy",
    title: "A Morning in", italic: "Kandy",
    tag: "Ceylon", glyph: "K",
    excerpt: "Inside AYANA's small Ceylon workshop, where green tea is steeped slowly into skin.",
    meta_title: "Inside AYANA's Kandy Workshop — VITRINE",
    meta_desc: "How AYANA crafts its Ceylon green tea skincare in small batches, by hand, in the hills above Kandy.",
    body: `The road from Colombo climbs gently through tea country, and by the time you turn into AYANA's workshop in the hills above Kandy, the air carries the slow green smell of the morning's first steep.\n\nThis is where the Tea Glow cream begins. Ceylon green tea, picked the day before, is brought down still warm from the slope and laid out to dry on cloth in the open air. Gotu kola grows along the workshop wall. Saffron threads, brought up from Jaffna, are weighed by the gram.\n\nThe batch is small — never more than 200 jars — and is finished by hand before lunch.`,
  },
  {
    slug: "sixty-years-of-red",
    title: "Sixty Years of", italic: "Red",
    tag: "Brand", glyph: "F",
    excerpt: "Florent's house lipstick has stayed the same shade since 1962. Here's why.",
    meta_title: "Florent No. 12 — Sixty Years of the Same Red — VITRINE",
    meta_desc: "The story behind Florent's house red lipstick, unchanged in formula since 1962.",
    body: `Madame Florent picked the colour herself in 1962, holding the test tube up to the curtains of the Théâtre du Châtelet. It has not changed since.\n\nThe formula is small and old: carnauba wax for the matte, beeswax for the slip, pigment from a single mill in Grasse. Every tube is poured in Paris, in a workshop that hasn't moved.`,
  },
  {
    slug: "the-long-wait-of-citrus",
    title: "The Long Wait of", italic: "Citrus",
    tag: "Ingredient", glyph: "B",
    excerpt: "Why our bergamot arrives in January — and only in January.",
    meta_title: "The Bergamot Season — VITRINE Field Notes",
    meta_desc: "A short field note on Calabrian bergamot, the only citrus our perfumers wait for all year.",
    body: `Bergamot is harvested for a six-week window in winter on a narrow stretch of the Calabrian coast — and nowhere else. The fruit will not grow elsewhere with the same character.\n\nWhen it arrives, three of our perfumers' new editions begin at once. By March the bottles are filled. By April the harvest is over.`,
  },
];

const DEFAULT_FAQS = [
  { q: "Do you ship outside Sri Lanka?", a: "Not yet. We deliver island-wide across Sri Lanka, and offer in-store pickup at our Galle Face boutique." },
  { q: "How long does delivery take?", a: "Island Standard arrives in 2–4 business days. Express delivery within Colombo is next business day." },
  { q: "Can I return a product?", a: "Yes — unopened products can be returned within 14 days for a full refund or exchange. Email hello@vitrine.lk to start a return." },
  { q: "Do you wrap gifts?", a: "Every order is hand-wrapped — tick the box at checkout to add a handwritten note." },
  { q: "Are samples really free?", a: "Yes. Pick up to three samples at checkout, on every order, no minimum." },
  { q: "How do I track my order?", a: "Use the order number from your confirmation email at the Track Order page, or sign in to view all your orders." },
];

const DEFAULT_LOCATIONS = [
  { name: "Galle Face — Colombo", address: "33 Galle Face Terrace\nColombo 03", hours: "Mon–Sat · 10:00–19:00\nSun · 11:00–17:00", phone: "+94 11 555 1998" },
  { name: "Pop-up — Galle Fort",  address: "12 Pedlar Street\nGalle Fort",       hours: "Daily · 11:00–18:00\nUntil end of season",  phone: "+94 91 555 2271" },
];

const insertSetting = db.prepare(`
  INSERT INTO settings (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO NOTHING
`);
const insertAnnouncement = db.prepare(`INSERT INTO announcements (text, sort) VALUES (?, ?)`);
const insertHero         = db.prepare(`INSERT INTO hero_slides (product_id, custom_tag, sort) VALUES (?, ?, ?)`);
const insertJournal      = db.prepare(`
  INSERT INTO journal_posts (slug,title,italic,tag,glyph,excerpt,body,meta_title,meta_desc,sort,published_at)
  VALUES (?,?,?,?,?,?,?,?,?,?, strftime('%s','now'))
  ON CONFLICT(slug) DO NOTHING
`);
const insertFaq          = db.prepare(`INSERT INTO faqs (question, answer, sort) VALUES (?, ?, ?)`);
const insertLoc          = db.prepare(`INSERT INTO shop_locations (name,address,hours,phone,sort) VALUES (?,?,?,?,?)`);
const setEditorialPick   = db.prepare(`UPDATE products SET editor_pick_sort=?, editor_tag=? WHERE id=?`);

const tx = db.transaction(() => {
  CATEGORIES.forEach((c, i) => insertCategory.run(c.key, c.label, c.italic, i));
  CONCERNS.forEach((c, i)   => insertConcernRow.run(c.key, c.label, i));
  BRANDS.forEach((b, i) => insertBrand.run({ ...b, sort: i }));

  // Settings
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    insertSetting.run(k, JSON.stringify(v));
  }

  // Only seed announcements/hero/journal/faqs/locations if empty
  if (db.prepare("SELECT COUNT(*) c FROM announcements").get().c === 0) {
    DEFAULT_ANNOUNCEMENTS.forEach((t, i) => insertAnnouncement.run(t, i));
  }
  if (db.prepare("SELECT COUNT(*) c FROM hero_slides").get().c === 0) {
    // Only insert hero slides for products that actually exist in this DB.
    const exists = db.prepare("SELECT 1 FROM products WHERE id=?");
    DEFAULT_HERO.forEach((h, i) => {
      if (exists.get(h.product_id)) insertHero.run(h.product_id, h.custom_tag, i);
    });
  }
  if (db.prepare("SELECT COUNT(*) c FROM journal_posts").get().c === 0) {
    DEFAULT_JOURNAL.forEach((j, i) => insertJournal.run(j.slug, j.title, j.italic, j.tag, j.glyph, j.excerpt, j.body, j.meta_title, j.meta_desc, i));
  }
  if (db.prepare("SELECT COUNT(*) c FROM faqs").get().c === 0) {
    DEFAULT_FAQS.forEach((f, i) => insertFaq.run(f.q, f.a, i));
  }
  if (db.prepare("SELECT COUNT(*) c FROM shop_locations").get().c === 0) {
    DEFAULT_LOCATIONS.forEach((l, i) => insertLoc.run(l.name, l.address, l.hours, l.phone, i));
  }

  // Editorial picks — set on existing products
  DEFAULT_EDITORIAL.forEach((p, i) => setEditorialPick.run(i, p.tag, p.id));
  PRODUCTS.forEach(p => {
    insertProduct.run({
      id: p.id, brand_key: p.brand, name: p.name, italic: p.italic,
      category: p.category, sub: p.sub, size: p.size, variant: p.variant,
      liquid: p.liquid, liquid_top: p.liquidTop, copy: p.copy,
      price: p.price, sale_price: p.sale || null, off_pct: p.off || null,
      is_new: p.isNew ? 1 : 0, is_bestseller: p.isBestseller ? 1 : 0,
      stock: 25,
    });
    clearConcerns.run(p.id);
    (p.concerns || []).forEach(c => insertConcern.run(p.id, c));
    clearNotes.run(p.id);
    (p.notes || []).forEach((n, i) => insertNote.run(p.id, n, i));
  });

  const adminEmail = process.env.ADMIN_EMAIL || "admin@vitrine.lk";
  const adminPass  = process.env.ADMIN_PASSWORD || "admin";
  const existing = db.prepare("SELECT id FROM users WHERE email=?").get(adminEmail);
  if (!existing) {
    db.prepare(`
      INSERT INTO users (email, password_hash, first_name, last_name, is_admin)
      VALUES (?, ?, 'Shop', 'Admin', 1)
    `).run(adminEmail, bcrypt.hashSync(adminPass, 10));
  }
});

tx();

const counts = {
  brands:   db.prepare("SELECT COUNT(*) c FROM brands").get().c,
  products: db.prepare("SELECT COUNT(*) c FROM products").get().c,
  users:    db.prepare("SELECT COUNT(*) c FROM users").get().c,
};
console.log("Seeded:", counts);
