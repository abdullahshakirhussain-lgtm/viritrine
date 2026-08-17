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
