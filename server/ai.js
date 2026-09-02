// Provider-agnostic "read a product photo → draft product fields" helper.
//
// One public function, describeProductFromImage(), with a swappable backend
// chosen by AI_PROVIDER (openai | anthropic). Mirrors the shape of sms.js:
// unset key → aiConfigured=false and the caller returns a friendly 503, so the
// rest of the admin keeps working. Never throws provider internals at the route.
//
// Env:
//   AI_PROVIDER        openai (default) | anthropic | deepseek
//   OPENAI_API_KEY     + optional OPENAI_MODEL     (default gpt-5.6-luna)
//   ANTHROPIC_API_KEY  + optional ANTHROPIC_MODEL  (default claude-sonnet-5)
//   DEEPSEEK_API_KEY   + optional DEEPSEEK_MODEL   (default deepseek-chat)
// NOTE: DeepSeek is OpenAI-compatible but TEXT-ONLY (no vision), so it powers the
// copy rewriter but NOT the photo cataloguer (use openai/anthropic for photos).

const PROVIDER = (process.env.AI_PROVIDER || "openai").toLowerCase();
const OPENAI_MODEL    = process.env.OPENAI_MODEL    || "gpt-5.6-luna";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const DEEPSEEK_MODEL  = process.env.DEEPSEEK_MODEL  || "deepseek-chat";

const aiConfigured =
  PROVIDER === "anthropic" ? !!process.env.ANTHROPIC_API_KEY
  : PROVIDER === "deepseek" ? !!process.env.DEEPSEEK_API_KEY
  : !!process.env.OPENAI_API_KEY;

// An OpenAI-SDK client pointed at the right backend (DeepSeek is OpenAI-compatible
// via a custom baseURL). Returns { client, model }.
function openaiCompatClient() {
  const OpenAI = require("openai").OpenAI || require("openai");
  if (PROVIDER === "deepseek")
    return { client: new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" }), model: DEEPSEEK_MODEL };
  return { client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }), model: OPENAI_MODEL };
}

// The single JSON contract both backends return. Every field is required (empty
// string / empty array when unknown) so OpenAI strict structured outputs is happy.
const PRODUCT_PROPS = {
  name:        { type: "string", description: "Short product name, e.g. 'Tea'. No brand, no size." },
  italic:      { type: "string", description: "Short italic accent/suffix shown after the name, e.g. 'Glow'. May be empty." },
  size:        { type: "string", description: "Bottle/pack size exactly as printed, e.g. '50 ML'. Empty if not visible." },
  sub:         { type: "string", description: "Sub-type, e.g. 'serum', 'mask', 'lip'. May be empty." },
  category:    { type: "string", description: "MUST be one of the provided category keys, or '' if none fit." },
  concerns:    { type: "array", items: { type: "string" }, description: "Zero or more of the provided concern keys only." },
  copy:        { type: "string", description: "2-3 sentence editorial product description in a warm, premium boutique voice." },
  notes:       { type: "array", items: { type: "string" }, description: "Key ingredients/notes buyers ask about, if visible or well known. May be empty." },
  meta_title:  { type: "string", description: "SEO <title>, ~60 chars, includes product + brand." },
  meta_desc:   { type: "string", description: "SEO meta description, ~150 chars." },
  brand_guess: { type: "string", description: "Best guess of the brand key from the provided brand list, or '' if unsure." },
};
const PRODUCT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: PRODUCT_PROPS,
  required: Object.keys(PRODUCT_PROPS),
};

// Build the grounding prompt from the shop's live taxonomy so the model classifies
// into REAL keys instead of inventing values.
function buildPrompt(taxonomy) {
  const list = (arr, kf = "key", lf = "label") =>
    (arr || []).map(x => `${x[kf]} (${x[lf] ?? ""})`).join(", ") || "(none)";
  return [
    "You are cataloguing a product for VITRINE, a Colombo multi-brand beauty boutique.",
    "Look at the product photo and fill in the fields. Read any text on the label/packaging.",
    "",
    `Allowed category keys: ${list(taxonomy.categories)}`,
    `Allowed concern keys: ${list(taxonomy.concerns)}`,
    `Known brands (key = name): ${(taxonomy.brands || []).map(b => `${b.key} = ${b.name}`).join(", ") || "(none)"}`,
    "",
    "Rules:",
    "- category MUST be one of the allowed category keys, or '' if none fit.",
    "- concerns may only contain allowed concern keys (or be empty).",
    "- brand_guess must be one of the known brand keys, or '' if you cannot tell.",
    "- Never invent a price. Write copy in a warm, premium, editorial voice.",
    "- If something isn't visible or known, use an empty string / empty array — do not guess wildly.",
  ].join("\n");
}

async function viaOpenAI({ base64, mimeType, taxonomy }) {
  const OpenAI = require("openai").OpenAI || require("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: buildPrompt(taxonomy) },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
      ],
    }],
    response_format: {
      type: "json_schema",
      json_schema: { name: "product_draft", strict: true, schema: PRODUCT_SCHEMA },
    },
  });
  return JSON.parse(res.choices[0].message.content);
}

async function viaAnthropic({ base64, mimeType, taxonomy }) {
  const Anthropic = require("@anthropic-ai/sdk").Anthropic || require("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1500,
    thinking: { type: "disabled" }, // fast, deterministic extraction — no reasoning needed
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
        { type: "text", text: buildPrompt(taxonomy) },
      ],
    }],
    output_config: { format: { type: "json_schema", schema: PRODUCT_SCHEMA } },
  });
  const textBlock = (res.content || []).find(b => b.type === "text");
  return JSON.parse(textBlock.text);
}

// Returns the drafted product fields, or throws a plain Error the route turns into
// a friendly message. Callers must check aiConfigured first.
async function describeProductFromImage(args) {
  if (PROVIDER === "anthropic") return viaAnthropic(args);
  if (PROVIDER === "deepseek") throw new Error("DeepSeek has no vision — use openai/anthropic for photo cataloguing.");
  return viaOpenAI(args);
}

// ── Copy rewrite (TEXT only — works on openai/deepseek/anthropic) ───────────
// Turns a product's known facts (and optionally the borrowed source copy, used
// for facts only) into ORIGINAL boutique copy + SEO title/description. This is
// how imported drafts shed the competitors' verbatim (duplicate) text.
function buildRewritePrompt(p) {
  return [
    "You write original product copy for VITRINE, a Colombo (Sri Lanka) multi-brand beauty boutique.",
    "Write a fresh description in YOUR OWN words — never copy the source text. Voice: warm, precise, premium editorial. 2–3 sentences, ~40–60 words. No prices, no invented claims, no medical/therapeutic promises.",
    "Also write an SEO title (~60 chars, front-loaded with the product + brand) and a meta description (~150 chars). Audience: shoppers in Sri Lanka.",
    "",
    `Product: ${p.name || ""}${p.italic ? " " + p.italic : ""}`,
    `Brand: ${p.brand || "(unbranded)"}`,
    `Category: ${p.category || "skincare"}`,
    p.size ? `Size: ${p.size}` : "",
    p.source ? `Source text (FACTS ONLY — reword completely, do not reuse phrasing): ${String(p.source).slice(0, 700)}` : "",
    "",
    'Return ONLY JSON: {"copy":"...","meta_title":"...","meta_desc":"..."}',
  ].filter(Boolean).join("\n");
}

async function rewriteProductCopy(p) {
  if (PROVIDER === "anthropic") {
    const Anthropic = require("@anthropic-ai/sdk").Anthropic || require("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: ANTHROPIC_MODEL, max_tokens: 700,
      messages: [{ role: "user", content: buildRewritePrompt(p) + "\n\nRespond with the JSON object only." }],
    });
    const t = (res.content || []).find(b => b.type === "text")?.text || "{}";
    return JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
  }
  const { client, model } = openaiCompatClient();
  const res = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: buildRewritePrompt(p) }],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });
  return JSON.parse(res.choices[0].message.content);
}

module.exports = { describeProductFromImage, rewriteProductCopy, aiConfigured, AI_PROVIDER: PROVIDER };
