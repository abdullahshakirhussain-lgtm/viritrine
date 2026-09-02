function ConfirmPage() {
  const params = new URLSearchParams(window.location.search);
  const number = params.get("number");
  const email  = params.get("email") || "";
  const [data, setData] = React.useState(null);
  const [err, setErr]   = React.useState("");

  React.useEffect(() => {
    if (!number) return;
    window.api.get("/api/orders/by-number/" + encodeURIComponent(number) + (email ? ("?email=" + encodeURIComponent(email)) : ""))
      .then(setData)
      .catch(e => setErr(e.message || "Couldn't find this order"));
  }, [number, email]);

  return (
    <PageShell>
      <div className="confirm-wrap">
        <div className="glyph">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <h1>Thank <em>you</em>.</h1>
        <p>Your order has been received. A confirmation has been sent to {email || "your email"}.</p>

        {err && <div className="auth-error" style={{margin:"20px 0"}}>{err}</div>}

        {data && (
          <div className="confirm-card">
            <div className="row"><span>Order number</span><b>{data.order.number}</b></div>
            <div className="row"><span>Status</span><b>{data.order.status.replace("_", " ")}</b></div>
            <div className="row"><span>Delivery</span><b>{data.order.delivery === "express" ? "Express · Colombo" : "Island Standard"}</b></div>
            <div className="row"><span>Payment</span><b>{({card:"Card", cod:"Cash on Delivery", koko:"KOKO"})[data.order.payment]}</b></div>
            <div className="row"><span>Subtotal</span><span>{window.fmtLKR(data.order.subtotal)}</span></div>
            <div className="row"><span>Shipping</span><span>{data.order.shipping === 0 ? "Free" : window.fmtLKR(data.order.shipping)}</span></div>
            <div className="row" style={{fontFamily:"var(--font-display)",fontSize:22,paddingTop:12}}>
              <span>Total</span><b>{window.fmtLKR(data.order.total)}</b>
            </div>

            <div style={{marginTop:18,borderTop:"1px solid var(--line)",paddingTop:14}}>
              <div style={{fontSize:11,letterSpacing:"0.22em",textTransform:"uppercase",color:"var(--ink-2)",marginBottom:8}}>Items</div>
              {data.items.map(it => (
                <div key={it.id} className="row">
                  <span>{it.name} {it.italic} · ×{it.qty}</span>
                  <span>{window.fmtLKR(it.line_total)}</span>
                </div>
              ))}
            </div>
            <div style={{marginTop:18,fontSize:13,color:"var(--ink-2)"}}>
              Shipping to <b>{data.order.full_name}</b><br/>
              {data.order.line1}{data.order.line2 ? ", " + data.order.line2 : ""}, {data.order.city} {data.order.postcode || ""}
            </div>
            {data.order.is_gift ? (
              <div style={{marginTop:18,padding:"14px 16px",border:"1px solid var(--line)",background:"var(--bg-2)"}}>
                <div style={{fontSize:11,letterSpacing:"0.22em",textTransform:"uppercase",color:"var(--ink-2)",marginBottom:6}}>
                  ✦ Wrapped as a gift{data.order.gift_recipient ? " for " + data.order.gift_recipient : ""}
                </div>
                {data.order.gift_message && <div style={{fontStyle:"italic",fontSize:14,color:"var(--ink-2)",lineHeight:1.5}}>“{data.order.gift_message}”</div>}
                {!!data.order.gift_hide_prices && <div style={{fontSize:12,color:"var(--ink-3)",marginTop:8}}>A price-free gift receipt will go in the box.</div>}
              </div>
            ) : null}
          </div>
        )}

        <div style={{marginTop:30,display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
          <a className="btn-solid" href="Shop.html">Continue shopping</a>
          <a className="btn-ghost"  href={"track.html?number=" + encodeURIComponent(number || "")}>Track this order</a>
        </div>
      </div>
    </PageShell>
  );
}

mountPage(ConfirmPage);
