function ContactPage() {
  const [form, setForm] = React.useState({ name: "", email: "", subject: "", message: "" });
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [err, setErr]   = React.useState("");
  const [faqs, setFaqs] = React.useState([]);
  const [locs, setLocs] = React.useState([]);
  const [settings, setSettings] = React.useState({});
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  React.useEffect(() => {
    window.api.get("/api/auth/me").then(r => {
      if (r.user) setForm(f => ({ ...f, email: r.user.email, name: [r.user.first_name, r.user.last_name].filter(Boolean).join(" ") || f.name }));
    });
    window.api.get("/api/faqs").then(setFaqs).catch(() => {});
    window.api.get("/api/locations").then(setLocs).catch(() => {});
    window.api.get("/api/settings").then(setSettings).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { await window.api.post("/api/contact", form); setSent(true); setForm({ name: "", email: "", subject: "", message: "" }); }
    catch (ex) { setErr(ex.message || "Couldn't send"); }
    finally { setBusy(false); }
  };

  return (
    <PageShell>
      <div className="page-wrap">
        <div className="page-head">
          <div className="eyebrow"><span>Get in touch</span></div>
          <h1>Contact &amp; <em>Help</em></h1>
          <p>Whether it's a question about an order, a brand you'd love us to stock, or a gift idea — we'd love to hear.</p>
        </div>

        <div className="contact-grid">
          <div>
            {sent ? (
              <div className="confirm-card" style={{textAlign:"center"}}>
                <div className="glyph" style={{margin:"0 auto 12px"}}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <h3 style={{fontFamily:"var(--font-display)",fontSize:28,margin:0}}>Thank you.</h3>
                <p style={{color:"var(--ink-2)",marginTop:8}}>We'll reply within one business day.</p>
                <button className="btn-ghost" onClick={() => setSent(false)} style={{marginTop:14}}>Send another message</button>
              </div>
            ) : (
              <form onSubmit={submit} className="checkout-section" style={{padding:0,border:0}}>
                <h3 style={{marginTop:0}}>Send us a note</h3>
                {err && <div className="auth-error">{err}</div>}
                <div className="grid-2">
                  <div className="field"><label>Name</label>
                    <input className="input" required value={form.name} onChange={e => set("name", e.target.value)} />
                  </div>
                  <div className="field"><label>Email</label>
                    <input className="input" type="email" required value={form.email} onChange={e => set("email", e.target.value)} />
                  </div>
                </div>
                <div className="field" style={{margin:"14px 0"}}>
                  <label>Subject</label>
                  <input className="input" value={form.subject} onChange={e => set("subject", e.target.value)} placeholder="e.g. Order #VTR-…" />
                </div>
                <div className="field" style={{marginBottom:14}}>
                  <label>Message</label>
                  <textarea required value={form.message} onChange={e => set("message", e.target.value)} placeholder="How can we help?"></textarea>
                </div>
                <button className="btn-solid" disabled={busy}>{busy ? "Sending…" : <>Send <span>⟶</span></>}</button>
              </form>
            )}

            <div id="faq" className="faq" style={{marginTop:40}}>
              <h3 style={{fontFamily:"var(--font-display)",fontSize:28,margin:"0 0 14px"}}>FAQ</h3>
              {faqs.length === 0
                ? <p style={{color:"var(--ink-3)"}}>No FAQs published yet.</p>
                : faqs.map((f) => (
                  <details key={f.id}>
                    <summary>{f.question}</summary>
                    <p>{f.answer}</p>
                  </details>
                ))}
            </div>
          </div>

          <aside className="contact-info" id="locations">
            {locs.length === 0 ? (
              <>
                <h3 style={{marginTop:0}}>Visit</h3>
                <p style={{color:"var(--ink-3)"}}>No locations listed yet.</p>
              </>
            ) : locs.map((l, i) => (
              <div key={l.id} style={{marginBottom: i < locs.length - 1 ? 18 : 0}}>
                <h3 style={{marginTop: i === 0 ? 0 : 24}}>{l.name}</h3>
                {l.address && <p>{l.address.split("\n").map((line, j) => <React.Fragment key={j}>{line}{j < l.address.split("\n").length - 1 && <br/>}</React.Fragment>)}</p>}
                {l.hours   && <p style={{whiteSpace:"pre-line"}}><b>Hours</b><br/>{l.hours}</p>}
                {l.phone   && <p><a href={"tel:" + l.phone.replace(/\s/g, "")} style={{color:"var(--wine)",borderBottom:"1px solid currentColor"}}>{l.phone}</a></p>}
              </div>
            ))}

            <h3 id="delivery">Delivery</h3>
            <p>Free across Sri Lanka on orders over {window.fmtLKR(settings["shipping.free_over_lkr"] || 25000)}. Standard 2–4 business days; express Colombo next-day.</p>

            <h3 id="returns">Returns</h3>
            <p>14 days, unopened. Email <a href={"mailto:" + (settings["site.email"] || "hello@vitrine.lk")} style={{color:"var(--wine)",borderBottom:"1px solid currentColor"}}>{settings["site.email"] || "hello@vitrine.lk"}</a>.</p>

            <h3 id="gifting">Gift Wrapping</h3>
            <p>Every order arrives hand-wrapped. Add a note at checkout — we'll handwrite it in.</p>
          </aside>
        </div>
      </div>
    </PageShell>
  );
}

mountPage(ContactPage);
