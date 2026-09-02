function LoginPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const next = new URLSearchParams(window.location.search).get("next") || "account.html";

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await window.api.post("/api/auth/login", { email, password });
      window.location.href = next;
    } catch (ex) {
      setErr(ex.message || "Couldn't sign in");
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <div className="auth-wrap">
        <div className="eyebrow"><span>Member · Since 1998</span></div>
        <h1>Welcome <em>back</em>.</h1>
        <p className="sub">Sign in to access your orders, wishlist, and saved addresses.</p>
        <div className="auth-card">
          <form onSubmit={submit}>
            {err && <div className="auth-error">{err}</div>}
            <div className="field"><label>Email</label>
              <input className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoFocus />
            </div>
            <div className="field"><label>Password</label>
              <input className="input" type="password" required value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <button className="btn-solid" disabled={busy}>{busy ? "Signing in…" : <>Sign In <span>⟶</span></>}</button>
          </form>
          <div className="alt">
            New here? <a href={"signup.html?next=" + encodeURIComponent(next)}>Create an account</a>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

mountPage(LoginPage);
