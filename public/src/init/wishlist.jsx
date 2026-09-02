function WishlistPage() {
  const [items, setItems] = React.useState(null);

  React.useEffect(() => {
    window.api.get("/api/wishlist")
      .then(setItems)
      .catch(e => {
        if (e.status === 401) {
          window.location.href = "login.html?next=" + encodeURIComponent("/wishlist.html");
        } else {
          setItems([]);
        }
      });
  }, []);

  const removeItem = async (id) => {
    await window.api.del("/api/wishlist/" + id);
    setItems(items.filter(i => i.id !== id));
    window.dispatchEvent(new CustomEvent("wishlist:changed"));
  };

  const addToBag = async (id) => {
    await window.api.post("/api/cart/items", { product_id: id, qty: 1 });
    window.dispatchEvent(new CustomEvent("cart:changed"));
    window.flash("Added to bag");
  };

  return (
    <PageShell>
      <div className="page-wrap">
        <div className="page-head">
          <div className="eyebrow"><span>Saved for later</span></div>
          <h1>Your <em>Wishlist</em></h1>
          <p>{items === null ? "Loading…" : `${items.length} saved piece${items.length === 1 ? "" : "s"}`}</p>
        </div>

        {items === null ? (
          <div className="wish-grid">
            {[0,1,2,3].map(i => (
              <div className="sk sk-tile" key={i}>
                <div className="sk-line long"></div>
                <div className="sk-line short"></div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <div className="glyph">
              <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span className="eyebrow">Saved for later</span>
            <h2>Nothing saved <em>yet.</em></h2>
            <p>Tap the heart on any piece — we'll keep it here for you, and quietly note when it goes on sale.</p>
            <div className="actions">
              <a className="btn-solid" href="Shop.html">Browse the shop ⟶</a>
              <a className="btn-ghost"  href="Shop.html#new=1">New arrivals</a>
            </div>
            <div className="ornament"><span className="line"></span><span>Sign in to keep your wishlist forever</span><span className="line"></span></div>
          </div>
        ) : (
          <div className="wish-grid">
            {items.map(p => {
              const b = (BRANDS && BRANDS[p.brand]) || { name: p.brandName };
              const now = p.sale || p.price;
              return (
                <article className="tile" key={p.id}>
                  <button className="tile-wish on" onClick={() => removeItem(p.id)} aria-label="Remove">
                    <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" strokeLinejoin="round"/></svg>
                  </button>
                  <a href={"/product/" + p.id} style={{color:"inherit",textDecoration:"none"}}>
                    <div className="tile-stage" data-monogram={(b.name || "")[0]} style={{"--brand-accent": b.accent}}>
                      <ProductVisual image={p.image} variant={p.variant} brand={b} product={{name: p.italic}} liquid={p.liquid} liquidTop={p.liquidTop}/>
                    </div>
                    <div className="tile-info">
                      <div className="tile-brand">{b.name}</div>
                      <h3 className="tile-name">{p.name} <em>{p.italic}</em></h3>
                    </div>
                  </a>
                  <div className="tile-row">
                    <div className="tile-prices">
                      <span className="tile-now">{window.fmtLKR(now)}</span>
                      {p.sale && <span className="tile-was">{window.fmtLKR(p.price)}</span>}
                    </div>
                    <button className="tile-add" onClick={() => addToBag(p.id)} aria-label="Add to bag">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}

mountPage(WishlistPage);
