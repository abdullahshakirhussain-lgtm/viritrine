// page-shell.jsx — common React glue for the standalone secondary pages.
// Provides:
//   - <PageShell>: wraps page contents with Announce + Nav + Footer + persistent
//     Tweaks panel (theme + shopName + tagline + side marks). Same picker on
//     every page, settings persist via localStorage.
//   - mountPage(Component): bootstraps catalog chrome then renders.
//   - flash(msg): bottom toast for success/error feedback.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "cabinet",
  "showSideMarks": true,
  "shopName": "VITRINE",
  "shopTagline": "Beauty, Hand-Picked"
}/*EDITMODE-END*/;

const THEMES = [
  { name: "cabinet",  label: "Cabinet",  swatch: ["#FFFFFF", "#5A1430", "#101010"] },
  { name: "ceylon",   label: "Ceylon",   swatch: ["#EFE6D2", "#6B1E3F", "#1F4538"] },
  { name: "noir",     label: "Midnight", swatch: ["#0E0907", "#C9456B", "#D9BD86"] },
  { name: "bordeaux", label: "Bordeaux", swatch: ["#2A0E1A", "#E0708C", "#F4E8DD"] },
];

function ThemePicker({ value, onChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, padding: "6px 0 4px" }}>
      {THEMES.map(t => {
        const active = t.name === value;
        return (
          <button
            key={t.name} type="button"
            onClick={() => onChange(t.name)}
            style={{
              cursor: "pointer",
              border: active ? "1.5px solid #111" : "1px solid rgba(0,0,0,0.18)",
              background: t.swatch[0],
              padding: 10, borderRadius: 8,
              display: "flex", alignItems: "center", gap: 12, outline: "none",
            }}
            aria-pressed={active}
          >
            <span style={{ display: "flex", gap: 3 }}>
              <span style={{ width: 22, height: 28, background: t.swatch[0], border: "1px solid rgba(0,0,0,0.15)", borderRadius: 2 }}></span>
              <span style={{ width: 10, height: 28, background: t.swatch[1], borderRadius: 2 }}></span>
              <span style={{ width: 10, height: 28, background: t.swatch[2], borderRadius: 2 }}></span>
            </span>
            <span style={{
              fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase",
              color: t.swatch[2], fontWeight: 500, flex: 1, textAlign: "left",
            }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
window.ThemePicker = ThemePicker;
window.PAGE_THEMES = THEMES;
window.PAGE_TWEAK_DEFAULTS = TWEAK_DEFAULTS;

function PageShell({ children, panelTitle = "Tweaks" }) {
  const [tw, setTw] = useTweaks(TWEAK_DEFAULTS);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [bagOpen, setBagOpen]       = React.useState(false);

  React.useEffect(() => {
    document.documentElement.dataset.theme = tw.theme;
  }, [tw.theme]);

  // Cross-page reactive sync: if another tab changes tweaks, mirror locally.
  React.useEffect(() => {
    const onTweak = (e) => {
      if (!e.detail) return;
      // useTweaks already updated state when this page issued the event; this
      // listener only matters when the event came from elsewhere — harmless to
      // re-set the same values.
    };
    window.addEventListener("tweakchange", onTweak);
    return () => window.removeEventListener("tweakchange", onTweak);
  }, []);

  return (
    <>
      <Announce />
      <Nav name={tw.shopName} tagline={tw.shopTagline}
           onSearch={() => setSearchOpen(true)}
           onBag={() => setBagOpen(true)} />
      {children}
      <BrandStrip />
      <Footer name={tw.shopName} tagline={tw.shopTagline} />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <BagDrawer    open={bagOpen}    onClose={() => setBagOpen(false)} />

      <TweaksPanel title={panelTitle}>
        <TweakSection label="Theme">
          <ThemePicker value={tw.theme} onChange={v => setTw("theme", v)} />
        </TweakSection>
        <TweakSection label="Shop">
          <TweakText   label="Name"    value={tw.shopName}     onChange={v => setTw("shopName", v)} />
          <TweakText   label="Tagline" value={tw.shopTagline}  onChange={v => setTw("shopTagline", v)} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}
window.PageShell = PageShell;

window.mountPage = async function mountPage(Component) {
  await window.loadCatalogChrome();
  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(<Component />);
};

window.flash = function flash(msg, opts = {}) {
  let n = document.querySelector(".flash");
  if (!n) { n = document.createElement("div"); n.className = "flash"; document.body.appendChild(n); }
  n.textContent = msg;
  n.classList.toggle("err", !!opts.err);
  n.classList.add("show");
  clearTimeout(window.__flashT);
  window.__flashT = setTimeout(() => n.classList.remove("show"), 2400);
};
