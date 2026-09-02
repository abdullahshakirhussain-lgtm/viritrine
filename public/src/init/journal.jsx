function JournalIndex() {
  const [posts, setPosts] = React.useState(null);
  React.useEffect(() => { window.api.get("/api/journal?limit=100").then(setPosts).catch(() => setPosts([])); }, []);
  const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

  return (
    <PageShell>
      <div className="page-wrap">
        <div className="page-head">
          <div className="eyebrow"><span>Field notes, brand stories &amp; ingredients</span></div>
          <h1>The <em>Stories</em></h1>
          <p>Notes from the shop. Brand origins, ingredient journeys, and the small choices behind every piece on our shelf.</p>
        </div>

        {posts === null ? <p>Loading…</p> :
         posts.length === 0 ? (
           <div className="empty-state">
             <div className="glyph"><svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" strokeLinejoin="round"/><path d="M8 9h8M8 13h8M8 17h5"/></svg></div>
             <span className="eyebrow">Nothing here yet</span>
             <h2>The first <em>story</em> is on its way.</h2>
             <p>Check back soon — or sign up for the monthly letter to be the first to know.</p>
             <div className="actions"><a href="/" className="btn-solid">Back to shop ⟶</a></div>
           </div>
         ) : (
          <div className="journal-index">
            {posts.map(p => (
              <a key={p.id} className="journal-card" href={"/journal/" + encodeURIComponent(p.slug)}>
                <div className="cover">
                  {p.tag && <span className="tag">{p.tag}</span>}
                  {p.cover_image
                    ? <img src={p.cover_image} alt="" />
                    : <div className="glyph">{p.glyph || (p.title || "?")[0]}</div>}
                </div>
                <div className="body">
                  <div className="meta">{fmtDate(p.published_at)}</div>
                  <h3>{p.title} <em>{p.italic}</em></h3>
                  <p>{p.excerpt}</p>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

mountPage(JournalIndex);
