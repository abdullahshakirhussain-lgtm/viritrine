// Restore persisted theme before any paint so the page boots in the right palette.
(function () {
  try {
    var saved = JSON.parse(localStorage.getItem('vt_tweaks') || 'null');
    if (saved && saved.theme) document.documentElement.dataset.theme = saved.theme;
  } catch (e) {}
})();

// Tiny fetch helper. Always sends cookies.
const api = {
  async req(path, { method = "GET", body, signal } = {}) {
    const res = await fetch(path, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      const err = new Error((data && (data.error || data.message)) || res.statusText);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },
  get(p)             { return this.req(p); },
  post(p, body)      { return this.req(p, { method: "POST", body }); },
  patch(p, body)     { return this.req(p, { method: "PATCH", body }); },
  del(p)             { return this.req(p, { method: "DELETE" }); },
};
window.api = api;

window.fmtLKR = (n) => "LKR " + Number(n || 0).toLocaleString("en-US");

// Fire-and-forget analytics for client-only events (begin_checkout,
// whatsapp_click). Server-backed events (product_view, search, add_to_cart,
// purchase) are logged automatically by the API — don't double-fire them here.
// Never throws and never blocks: uses sendBeacon when available so it survives
// navigation (e.g. clicking a wa.me link that leaves the page).
window.track = (type, data = {}) => {
  try {
    const payload = JSON.stringify({ type, ...data });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics/event", new Blob([payload], { type: "application/json" }));
    } else {
      fetch("/api/analytics/event", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: payload, keepalive: true,
      }).catch(() => {});
    }
  } catch (e) { /* analytics must never break the page */ }
};

// ── Tap ripple (interaction layer; styles in src/interactions.css) ──────────
// Delegated + idempotent so loading api.jsx on every page wires it everywhere.
// pointerdown covers mouse and touch, so it also gives mobile its tap feedback.
(function () {
  if (window.__vitRipple) return; window.__vitRipple = true;
  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var SEL = ".btn-solid,.btn-ghost,.opt,[data-ripple]";
  document.addEventListener("pointerdown", function (e) {
    if (reduce || !e.target.closest) return;
    var t = e.target.closest(SEL);
    if (!t || t.disabled) return;
    var cs = getComputedStyle(t);
    if (cs.position === "static") t.style.position = "relative";
    if (cs.overflow !== "hidden") t.style.overflow = "hidden";
    var r = t.getBoundingClientRect();
    var size = Math.max(r.width, r.height);
    var s = document.createElement("span");
    s.className = "vit-rip";
    s.style.width = s.style.height = size + "px";
    s.style.left = (e.clientX - r.left - size / 2) + "px";
    s.style.top = (e.clientY - r.top - size / 2) + "px";
    t.appendChild(s);
    setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 600);
  }, { passive: true });
})();

// ── Liquid-glass segmented puck (single-select .opts-seg rows) ──────────────
// Positions a frosted puck over the active card; React updates .active, we
// measure on the next frames. Falls back to per-card frost on stacked mobile.
(function () {
  if (window.__vitSeg) return; window.__vitSeg = true;
  function place(seg) {
    var p = seg.__puck;
    if (!p) { p = document.createElement("div"); p.className = "opt-puck"; seg.insertBefore(p, seg.firstChild); seg.__puck = p; }
    var a = seg.querySelector(".opt.active");
    if (!a) { p.style.opacity = "0"; return; }
    p.style.opacity = "1";
    p.style.setProperty("--px", (a.offsetLeft - (seg.clientLeft || 0)) + "px");
    p.style.setProperty("--pw", a.offsetWidth + "px");
  }
  function all() { var segs = document.querySelectorAll(".opts-seg"); for (var i = 0; i < segs.length; i++) place(segs[i]); }
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest(".opts-seg")) requestAnimationFrame(function () { requestAnimationFrame(all); });
  }, { passive: true });
  window.addEventListener("resize", all);
  [0, 150, 400, 900, 1500].forEach(function (t) { setTimeout(all, t); }); // catch React's async mount
})();
