// admin-shell.jsx — sidebar nav + auth guard + mount helper for admin pages.

function AdminShell({ active, title, eyebrow, actions, children }) {
  const signOut = async () => {
    try { await window.api.post("/api/auth/logout"); } catch {}
    window.location.href = "/";
  };
  const link = (href, label, key) => (
    <a key={key} href={href} className={active === key ? "on" : ""}>{label}</a>
  );
  return (
    <div className="admin-wrap">
      <aside className="admin-side">
        <div className="admin-brand">VITRINE<small>Admin · Colombo</small></div>
        <nav className="admin-nav">
          {link("admin.html",              "Dashboard",     "dashboard")}
          <div className="sect">Catalogue</div>
          {link("admin-products.html",     "Products",      "products")}
          {link("admin-brands.html",       "Brands",        "brands")}
          {link("admin-categories.html",   "Categories",    "categories")}
          <div className="sect">Storefront</div>
          {link("admin-hero.html",         "Hero slides",   "hero")}
          {link("admin-announcements.html","Announcements", "announcements")}
          {link("admin-journal.html",      "Journal",       "journal")}
          {link("admin-faqs.html",         "FAQs",          "faqs")}
          {link("admin-locations.html",    "Locations",     "locations")}
          <div className="sect">Shop</div>
          {link("admin-orders.html",       "Orders",        "orders")}
          {link("admin-messages.html",     "Messages",      "messages")}
          {link("admin-newsletter.html",   "Newsletter",    "newsletter")}
          <div className="sect">Settings</div>
          {link("admin-settings.html",     "Site settings", "settings")}
          <a href="/" target="_blank">View site ↗</a>
          <button onClick={signOut}>Sign out ⟶</button>
        </nav>
      </aside>
      <main className="admin-main">
        <header className="admin-head">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h1>{title}</h1>
          </div>
          {actions && <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{actions}</div>}
        </header>
        {children}
      </main>
    </div>
  );
}
window.AdminShell = AdminShell;

window.mountAdmin = async function mountAdmin(Component) {
  try {
    const me = await window.api.get("/api/auth/me");
    if (!me.user) { window.location.href = "login.html?next=" + encodeURIComponent(window.location.pathname); return; }
    if (!me.user.is_admin) {
      document.body.innerHTML = '<div style="padding:80px;text-align:center;font-family:serif"><h1>Not authorised</h1><p>This area is for shop admins only.</p><a href="/">⟵ Back to shop</a></div>';
      return;
    }
  } catch {
    window.location.href = "login.html?next=" + encodeURIComponent(window.location.pathname);
    return;
  }
  ReactDOM.createRoot(document.getElementById("root")).render(<Component />);
};

window.adminFmtDate = (ts) => new Date(ts * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
window.adminFmtMoney = (n) => "LKR " + Number(n || 0).toLocaleString("en-US");

// ── Bulk-selection hook ─────────────────────────────────────────
// Tracks which rows are selected by id. Pair with a "select all" checkbox
// in the header and per-row checkboxes; render <BulkBar> when count > 0.
window.useBulkSelection = function useBulkSelection(rows, idKey = "id") {
  const [selected, setSelected] = React.useState(() => new Set());
  // Drop ids that disappeared (e.g. after a delete) so the checkbox state stays clean.
  React.useEffect(() => {
    if (!rows) return;
    const ids = new Set(rows.map(r => r[idKey]));
    setSelected(prev => {
      const next = new Set();
      for (const id of prev) if (ids.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);
  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(prev => {
    if (!rows) return prev;
    if (prev.size === rows.length) return new Set();
    return new Set(rows.map(r => r[idKey]));
  });
  const clear = () => setSelected(new Set());
  const allSelected = !!rows && rows.length > 0 && selected.size === rows.length;
  const some = selected.size > 0 && selected.size < (rows?.length || 0);
  return { selected, toggle, toggleAll, clear, allSelected, some, count: selected.size };
};

// Floating sticky bar shown at the bottom when bulk selections exist.
window.BulkBar = function BulkBar({ count, onClear, children }) {
  if (!count) return null;
  return (
    <div className="bulk-bar">
      <div className="bulk-bar-inner">
        <div className="bulk-bar-count"><b>{count}</b> selected</div>
        <div className="bulk-bar-actions">{children}</div>
        <button type="button" className="bulk-bar-clear" onClick={onClear}>Clear</button>
      </div>
    </div>
  );
};

// Tiny header checkbox that respects "some" (indeterminate) state.
window.BulkCheckHeader = function BulkCheckHeader({ allSelected, some, onToggleAll }) {
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current) ref.current.indeterminate = !!some && !allSelected; }, [some, allSelected]);
  return <input ref={ref} type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label="Select all" />;
};

// Run a list of async ops sequentially, collecting per-id outcomes.
window.adminBulkRun = async function adminBulkRun(ids, fn) {
  const ok = []; const failed = [];
  for (const id of ids) {
    try { await fn(id); ok.push(id); }
    catch (e) { failed.push({ id, error: e.message || "Failed", data: e.data }); }
  }
  return { ok, failed };
};

// Confirm helper (minimal)
window.adminConfirm = (msg) => window.confirm(msg);

// File upload helper
window.adminUpload = async function (kind, id, file) {
  const form = new FormData();
  form.append("image", file);
  const res = await fetch(`/api/admin/upload/${kind}/${encodeURIComponent(id)}`, {
    method: "POST", credentials: "include", body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data;
};
