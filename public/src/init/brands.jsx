/* Dedicated /brands page — A–Z logo wall with search. Uses the shared PageShell
   (nav + footer) and the /api/brands feed (now includes a per-brand product count
   and logo image). Brands with no active products are hidden. */
function BrandsIndex() {
  const [brands, setBrands] = React.useState(null);
  const [q, setQ] = React.useState("");
  React.useEffect(() => { window.api.get("/api/brands").then(setBrands).catch(() => setBrands([])); }, []);

  const stocked = (brands || []).filter(b => (b.count || 0) > 0);

  const groups = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = stocked.filter(b => !s || b.name.toLowerCase().includes(s));
    const g = {};
    for (const b of list.sort((a, b) => a.name.localeCompare(b.name))) {
      let L = (b.name[0] || "#").toUpperCase();
      if (!/[A-Z]/.test(L)) L = "#";
      (g[L] = g[L] || []).push(b);
    }
    return Object.keys(g).sort().map(k => [k, g[k]]);
  }, [brands, q]);

  return (
    <PageShell>
      <div className="page-wrap">
        <div className="page-head">
          <div className="eyebrow"><span>{stocked.length ? stocked.length + " brands, one shop" : "Every brand, one shop"}</span></div>
          <h1>All <em>brands</em></h1>
          <p>The brands you know — skincare, K-beauty, makeup and more — authentic and delivered across Sri Lanka.</p>
        </div>

        <input className="input brands-search" type="search" placeholder="Search brands…" value={q}
               onChange={e => setQ(e.target.value)} aria-label="Search brands" />

        {brands === null ? <p style={{ marginTop: 24 }}>Loading…</p> :
         groups.length === 0 ? <p style={{ marginTop: 24 }}>No brands match “{q}”.</p> :
         groups.map(([L, list]) => (
           <section key={L} className="brands-group">
             <h2 className="brands-letter">{L}</h2>
             <div className="brands-grid">
               {list.map(b => (
                 <a key={b.key} className="brand-logo-cell" href={"/brand/" + b.key} title={b.name + " · " + b.count + " product" + (b.count === 1 ? "" : "s")}>
                   {b.image
                     ? <img src={b.image} alt={b.name} loading="lazy" />
                     : <span className="brand-logo-name">{b.name}</span>}
                   <span className="brand-logo-count">{b.count}</span>
                 </a>
               ))}
             </div>
           </section>
         ))}
      </div>
    </PageShell>
  );
}

mountPage(BrandsIndex);
