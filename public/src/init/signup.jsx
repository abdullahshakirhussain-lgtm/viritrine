const next = new URLSearchParams(window.location.search).get("next") || "account.html";

// ── Email sign-up (original flow) ──────────────────────────────────────────
function EmailSignup() {
  const [form, setForm] = React.useState({ first_name: "", last_name: "", email: "", phone: "", password: "" });
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await window.api.post("/api/auth/signup", form);
      window.location.href = next;
    } catch (ex) {
      setErr(ex.message || "Couldn't create account");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      {err && <div className="auth-error">{err}</div>}
      <div className="field"><label>First name</label>
        <input className="input" required value={form.first_name} onChange={e => set("first_name", e.target.value)} />
      </div>
      <div className="field"><label>Last name</label>
        <input className="input" value={form.last_name} onChange={e => set("last_name", e.target.value)} />
      </div>
      <div className="field"><label>Email</label>
        <input className="input" type="email" required value={form.email} onChange={e => set("email", e.target.value)} />
      </div>
      <div className="field"><label>Phone</label>
        <input className="input" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+94 7…" />
      </div>
      <div className="field"><label>Password</label>
        <input className="input" type="password" required minLength="6" value={form.password} onChange={e => set("password", e.target.value)} />
      </div>
      <button className="btn-solid" disabled={busy}>{busy ? "Creating…" : <>Create Account <span>⟶</span></>}</button>
    </form>
  );
}

// ── Phone-OTP sign-up (3 steps: phone → code → name + password) ─────────────
function PhoneSignup() {
  const [step, setStep] = React.useState(1);              // 1 phone · 2 code · 3 details
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [details, setDetails] = React.useState({ first_name: "", last_name: "", password: "" });
  const [err, setErr] = React.useState("");
  const [note, setNote] = React.useState("");             // dev-code hint / resend confirmation
  const [busy, setBusy] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);      // seconds until resend allowed
  const setD = (k, v) => setDetails(d => ({ ...d, [k]: v }));

  // Tick down the resend cooldown once a code has been sent.
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const requestCode = async (e) => {
    if (e) e.preventDefault();
    setErr(""); setNote(""); setBusy(true);
    try {
      const r = await window.api.post("/api/auth/otp/request", { phone });
      setStep(2); setCooldown(60);
      if (r.devCode) setNote("Dev mode — your code is " + r.devCode);
    } catch (ex) { setErr(ex.message || "Couldn't send code"); }
    finally { setBusy(false); }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await window.api.post("/api/auth/otp/verify", { phone, code });
      setStep(3);
    } catch (ex) { setErr(ex.message || "Couldn't verify code"); }
    finally { setBusy(false); }
  };

  const complete = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await window.api.post("/api/auth/otp/complete", { phone, ...details });
      window.location.href = next;
    } catch (ex) { setErr(ex.message || "Couldn't create account"); setBusy(false); }
  };

  return (
    <div>
      {err && <div className="auth-error">{err}</div>}
      {note && <div className="auth-error" style={{ background: "rgba(90,20,48,.08)", color: "var(--ink)" }}>{note}</div>}

      {step === 1 && (
        <form onSubmit={requestCode}>
          <div className="field"><label>Mobile number</label>
            <input className="input" required autoFocus value={phone}
                   onChange={e => setPhone(e.target.value)} placeholder="07X XXX XXXX" inputMode="tel" />
          </div>
          <button className="btn-solid" disabled={busy}>{busy ? "Sending…" : <>Send code <span>⟶</span></>}</button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={verifyCode}>
          <p className="sub" style={{ marginTop: 0 }}>We sent a 6-digit code to <strong>{phone}</strong>.</p>
          <div className="field"><label>Verification code</label>
            <input className="input" required autoFocus value={code}
                   onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                   placeholder="6-digit code" inputMode="numeric" maxLength="6" />
          </div>
          <button className="btn-solid" disabled={busy || code.length !== 6}>{busy ? "Checking…" : <>Verify <span>⟶</span></>}</button>
          <div className="alt">
            {cooldown > 0
              ? <span>Resend code in {cooldown}s</span>
              : <a href="#" onClick={e => { e.preventDefault(); requestCode(); }}>Resend code</a>}
            {" · "}
            <a href="#" onClick={e => { e.preventDefault(); setErr(""); setStep(1); }}>Change number</a>
          </div>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={complete}>
          <p className="sub" style={{ marginTop: 0 }}>Phone verified ✓ — just a couple more details.</p>
          <div className="field"><label>First name</label>
            <input className="input" required autoFocus value={details.first_name} onChange={e => setD("first_name", e.target.value)} />
          </div>
          <div className="field"><label>Last name</label>
            <input className="input" value={details.last_name} onChange={e => setD("last_name", e.target.value)} />
          </div>
          <div className="field"><label>Password</label>
            <input className="input" type="password" required minLength="6" value={details.password} onChange={e => setD("password", e.target.value)} />
          </div>
          <button className="btn-solid" disabled={busy}>{busy ? "Creating…" : <>Create Account <span>⟶</span></>}</button>
        </form>
      )}
    </div>
  );
}

function SignupPage() {
  const [method, setMethod] = React.useState("phone");   // 'phone' | 'email'

  return (
    <PageShell>
      <div className="auth-wrap">
        <div className="eyebrow"><span>New · 30-second sign up</span></div>
        <h1>Create an <em>account</em>.</h1>
        <p className="sub">Track orders, save your wishlist, and check out faster next time.</p>
        <div className="auth-card">
          <div className="seg" style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            <button type="button" className={method === "phone" ? "btn-solid" : "btn-ghost"}
                    style={{ flex: 1 }} onClick={() => setMethod("phone")}>Phone</button>
            <button type="button" className={method === "email" ? "btn-solid" : "btn-ghost"}
                    style={{ flex: 1 }} onClick={() => setMethod("email")}>Email</button>
          </div>
          {method === "phone" ? <PhoneSignup /> : <EmailSignup />}
          <div className="alt">
            Already have an account? <a href={"login.html?next=" + encodeURIComponent(next)}>Sign in</a>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

mountPage(SignupPage);
