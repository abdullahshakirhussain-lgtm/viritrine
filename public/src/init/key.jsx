function KeyPage() {
  const [settings, setSettings] = React.useState({});
  const [m, setM] = React.useState(null);        // membership status (null until known)
  const [signedIn, setSignedIn] = React.useState(null);
  const [code, setCode] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const loadStatus = () => window.api.get("/api/membership").then(r => { setM(r); setSignedIn(true); }).catch(() => setSignedIn(false));
  React.useEffect(() => {
    window.api.get("/api/settings").then(setSettings).catch(() => {});
    loadStatus();
  }, []);

  const threshold = Number(settings["membership.premium_threshold_lkr"]) || 250000;
  const discount  = Number(settings["membership.premium_discount_pct"]);
  const isPremium = m && m.tier === "premium";

  const redeem = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await window.api.post("/api/membership/redeem", { code }); setCode(""); loadStatus(); }
    catch (ex) { setErr(ex.message || "Couldn't redeem that code"); }
    finally { setBusy(false); }
  };

  const tierCard = (title, tag, lines, dark) => (
    <div style={{ flex: "1 1 320px", padding: "30px 28px", background: dark ? "var(--ink)" : "var(--paper)", color: dark ? "var(--paper)" : "var(--ink)", border: "1px solid " + (dark ? "var(--ink)" : "var(--line-2)") }}>
      <div style={{ fontSize: 10.5, letterSpacing: "0.24em", textTransform: "uppercase", color: dark ? "var(--gold)" : "var(--ink-3)" }}>{tag}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: "8px 0 20px" }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: "flex", gap: 12, fontSize: 14, lineHeight: 1.5, color: dark ? "rgba(255,255,255,0.85)" : "var(--ink-2)" }}>
            <span style={{ color: dark ? "var(--gold)" : "var(--wine)" }}>✦</span><span>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <PageShell>
      <div className="page-wrap">
        <div className="page-head">
          <div className="eyebrow"><span>Membership · By invitation</span></div>
          <h1>The <em>Key</em>.</h1>
          <p>Every account is a member. A rare few hold the Key — our standing invitation to the people who keep the shelf turning.</p>
        </div>

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 40 }}>
          {tierCard("Membership", "Every account", [
            "Track orders and returns",
            "Save a wishlist across devices",
            "The monthly letter — new arrivals & shop events",
          ], false)}
          {tierCard("The Key", "Premium · by invitation", [
            "Free delivery on every order",
            discount ? discount + "% off, always" : "A standing member's discount",
            "First refusal on new arrivals before the shelf",
            "The back room by appointment — testers, full sizes, no rush",
          ], true)}
        </div>

        <div style={{ padding: "24px 26px", background: "var(--bg-2)", border: "1px solid var(--line)", marginBottom: 36 }}>
          <div style={{ fontSize: 10.5, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 8 }}>How the Key is offered</div>
          <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 14, lineHeight: 1.7, maxWidth: "60ch" }}>
            The Key is invitation-only. Once your lifetime spend passes {window.fmtLKR(threshold)}, you become eligible — and we send an invitation with a code to redeem here. It isn't for sale.
          </p>
        </div>

        {/* status / redeem */}
        {isPremium ? (
          <div style={{ padding: "22px 24px", background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)" }}>
            <div style={{ fontSize: 10.5, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--gold)" }}>You hold the Key</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 26, marginTop: 4 }}>Welcome to <em style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--gold)" }}>the back room</em>.</div>
            <a href="backroom.html" style={{ display: "inline-block", marginTop: 16, fontFamily: "var(--font-mono, monospace)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--paper)", borderBottom: "1px solid var(--gold)", paddingBottom: 3 }}>Book an appointment →</a>
          </div>
        ) : signedIn === false ? (
          <div style={{ textAlign: "center", padding: "10px 0 30px" }}>
            <a className="btn-solid" href={"login.html?next=" + encodeURIComponent("/key.html")}>Sign in to redeem an invitation ⟶</a>
          </div>
        ) : (
          <form onSubmit={redeem} style={{ maxWidth: 460, margin: "0 auto", textAlign: "center" }}>
            <label className="eyebrow" style={{ display: "block", marginBottom: 12 }}>Have an invitation?</label>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <input className="input" value={code} onChange={e => setCode(e.target.value)} placeholder="KEY-XXXXXXXX" style={{ flex: "1 1 240px", maxWidth: 320, textAlign: "center", letterSpacing: "0.1em" }} />
              <button className="btn-solid" disabled={busy || !code}>{busy ? "Redeeming…" : "Redeem the Key"}</button>
            </div>
            {err && <div style={{ color: "var(--wine)", fontSize: 12, marginTop: 10 }}>{err}</div>}
            {m && <div style={{ color: "var(--ink-3)", fontSize: 12, marginTop: 14 }}>Your lifetime spend: {window.fmtLKR(m.lifetime_spend)} · {m.eligible ? "eligible" : window.fmtLKR(Math.max(0, threshold - m.lifetime_spend)) + " to eligibility"}</div>}
          </form>
        )}
      </div>
    </PageShell>
  );
}
mountPage(KeyPage);
