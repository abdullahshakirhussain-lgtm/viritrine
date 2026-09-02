const STATUS_FLOW = ["pending", "awaiting_payment", "paid", "shipped", "delivered"];

function TrackPage() {
  const params = new URLSearchParams(window.location.search);
  const [num, setNum] = React.useState(params.get("number") || "");
  const [email, setEmail] = React.useState(params.get("email") || "");
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const lookup = async (n, e) => {
    setErr(""); setBusy(true);
    try {
      const url = "/api/track?number=" + encodeURIComponent(n) + (e ? ("&email=" + encodeURIComponent(e)) : "");
      const r = await window.api.get(url);
      setData(r);
    } catch (ex) {
      setErr(ex.message || "Order not found");
      setData(null);
    } finally { setBusy(false); }
  };

  React.useEffect(() => {
    if (num) lookup(num, email);
  }, []);

  const submit = (e) => { e.preventDefault(); lookup(num, email); };

  const stepIndex = data ? Math.max(0, STATUS_FLOW.indexOf(data.order.status)) : 0;

  return (
    <PageShell>
      <div className="page-wrap">
        <div className="page-head">
          <div className="eyebrow"><span>Order tracking</span></div>
          <h1>Track <em>Order</em></h1>
          <p>Enter your order number and the email used at checkout to view its status.</p>
        </div>

        <div style={{maxWidth: 560, margin: "0 auto 36px"}}>
          <form onSubmit={submit} className="auth-card">
            {err && <div className="auth-error">{err}</div>}
            <div className="field" style={{marginBottom:14}}>
              <label>Order number</label>
              <input className="input" required value={num} onChange={e => setNum(e.target.value)} placeholder="VTR-260526-1234" />
            </div>
            <div className="field" style={{marginBottom:14}}>
              <label>Email used at checkout</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="(required if you weren't signed in)" />
            </div>
            <button className="btn-solid" disabled={busy}>{busy ? "Looking up…" : <>Track Order <span>⟶</span></>}</button>
          </form>
        </div>

        {data && (
          <div className="confirm-card" style={{maxWidth:720,margin:"0 auto",textAlign:"left"}}>
            <div className="row"><span>Order</span><b>{data.order.number}</b></div>
            <div className="row"><span>Placed</span><b>{new Date(data.order.created_at * 1000).toLocaleString()}</b></div>
            <div className="row"><span>Delivery</span><b>{data.order.delivery === "express" ? "Express · Colombo" : "Island Standard"}</b></div>
            <div className="row"><span>Payment</span><b>{({card:"Card", cod:"Cash on Delivery", koko:"KOKO"})[data.order.payment]}</b></div>

            <div style={{marginTop:18}}>
              <div style={{fontSize:11,letterSpacing:"0.22em",textTransform:"uppercase",color:"var(--ink-2)",marginBottom:10}}>Progress</div>
              <div style={{display:"grid",gridTemplateColumns:`repeat(${STATUS_FLOW.length},1fr)`,gap:8}}>
                {STATUS_FLOW.map((s, i) => (
                  <div key={s} style={{
                    padding:"10px 8px",
                    border:"1px solid var(--line)",
                    background: i <= stepIndex ? "var(--wine)" : "transparent",
                    color:    i <= stepIndex ? "var(--paper)" : "var(--ink-3)",
                    fontSize:10.5,letterSpacing:"0.16em",textTransform:"uppercase",textAlign:"center"
                  }}>{s.replace("_"," ")}</div>
                ))}
              </div>
            </div>

            <div style={{marginTop:22,borderTop:"1px solid var(--line)",paddingTop:14}}>
              <div style={{fontSize:11,letterSpacing:"0.22em",textTransform:"uppercase",color:"var(--ink-2)",marginBottom:8}}>Items</div>
              {data.items.map(it => (
                <div key={it.id} className="row"><span>{it.name} {it.italic} · ×{it.qty}</span><span>{window.fmtLKR(it.line_total)}</span></div>
              ))}
              <div className="row" style={{fontFamily:"var(--font-display)",fontSize:20,paddingTop:10}}>
                <span>Total</span><b>{window.fmtLKR(data.order.total)}</b>
              </div>
            </div>

            <div style={{marginTop:18,fontSize:13,color:"var(--ink-2)"}}>
              Order for <b>{data.order.first_name}</b>{data.order.phone_masked ? <> · {data.order.phone_masked}</> : null}<br/>
              For your privacy, full delivery details aren't shown here — <a href="account.html">sign in</a> to view them.
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}

mountPage(TrackPage);
