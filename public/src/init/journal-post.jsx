// Minimal-but-sufficient Markdown renderer: headings, paragraphs, bold, italic,
// links, blockquotes, lists. Good enough for editorial copy without pulling
// in a 50KB library. Escapes HTML in source.
function md(src) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|\W)\*(?!\s)([^*\n]+?)\*(\W|$)/g, "$1<em>$2</em>$3")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const blocks = src.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return blocks.map(b => {
    b = b.trim();
    if (!b) return "";
    if (b.startsWith("### ")) return "<h3>" + inline(b.slice(4)) + "</h3>";
    if (b.startsWith("## "))  return "<h2>" + inline(b.slice(3)) + "</h2>";
    if (b.startsWith("> "))   return "<blockquote>" + inline(b.replace(/^>\s?/gm, "")) + "</blockquote>";
    if (/^[-*]\s/.test(b))    return "<ul>" + b.split("\n").map(l => "<li>" + inline(l.replace(/^[-*]\s/, "")) + "</li>").join("") + "</ul>";
    if (/^\d+\.\s/.test(b))   return "<ol>" + b.split("\n").map(l => "<li>" + inline(l.replace(/^\d+\.\s/, "")) + "</li>").join("") + "</ol>";
    return "<p>" + inline(b).replace(/\n/g, "<br/>") + "</p>";
  }).join("\n");
}

function JournalPost() {
  // Slug may come from /journal/:slug pretty URL or ?slug= query
  const pathMatch = window.location.pathname.match(/^\/journal\/([^/?#]+)/i);
  const slug = pathMatch ? decodeURIComponent(pathMatch[1]) : new URLSearchParams(window.location.search).get("slug");
  const [data, setData] = React.useState(null);
  const [err, setErr]   = React.useState(null);

  React.useEffect(() => {
    if (!slug) { setErr("No story selected."); return; }
    window.api.get("/api/journal/" + encodeURIComponent(slug))
      .then(d => {
        setData(d);
        const p = d.post;
        document.title = (p.meta_title || (p.title + (p.italic ? " " + p.italic : "")) + " — VITRINE");
        const setMeta = (sel, val) => { const n = document.querySelector(sel); if (n && val) n.setAttribute("content", val); };
        const desc = p.meta_desc || p.excerpt || "";
        setMeta('meta[name="description"]', desc);
        setMeta('#vt-og-title', p.meta_title || p.title);
        setMeta('#vt-og-desc',  desc);
        setMeta('#vt-og-image', p.cover_image ? (window.location.origin + p.cover_image) : "");
      })
      .catch(e => setErr(e.message || "Story not found"));
  }, [slug]);

  if (err) {
    return (
      <PageShell>
        <div className="page-wrap">
          <div className="empty-state">
            <div className="glyph"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 17h.01" strokeLinecap="round"/></svg></div>
            <span className="eyebrow">Story not found</span>
            <h2>That story has <em>wandered off.</em></h2>
            <p>{err}</p>
            <div className="actions"><a className="btn-solid" href="journal.html">All stories ⟶</a></div>
          </div>
        </div>
      </PageShell>
    );
  }

  if (!data) return <PageShell><div className="page-wrap"><div className="cart-empty"><h3>Loading…</h3></div></div></PageShell>;

  const { post, related } = data;
  const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <PageShell>
      <article className="post-wrap">
        <div className="post-meta">
          <a href="journal.html" style={{color:"inherit"}}>Journal</a>
          {post.tag && <><span className="sep">·</span>{post.tag}</>}
          <span className="sep">·</span>{fmtDate(post.published_at)}
        </div>
        <h1 className="post-title">{post.title} <em>{post.italic}</em></h1>
        {post.excerpt && <p style={{fontFamily:"var(--font-serif)",fontStyle:"italic",fontSize:21,color:"var(--ink-2)",margin:"0 0 28px",lineHeight:1.5}}>{post.excerpt}</p>}

        <div className="post-cover">
          {post.cover_image
            ? <img src={post.cover_image} alt="" />
            : <div className="glyph">{post.glyph || (post.title || "?")[0]}</div>}
        </div>

        <div className="post-body" dangerouslySetInnerHTML={{ __html: md(post.body || "") }}></div>

        <div className="post-foot">
          <a href="journal.html" className="btn-ghost">⟵ All stories</a>
        </div>

        {related?.length > 0 && (
          <div style={{marginTop:60}}>
            <h3 style={{fontFamily:"var(--font-display)",fontSize:28,margin:"0 0 20px"}}>More <em>stories</em></h3>
            <div className="journal-index">
              {related.map(r => (
                <a key={r.slug} className="journal-card" href={"journal-post.html?slug=" + encodeURIComponent(r.slug)}>
                  <div className="cover">
                    {r.tag && <span className="tag">{r.tag}</span>}
                    {r.cover_image ? <img src={r.cover_image} alt="" /> : <div className="glyph">{r.glyph || (r.title || "?")[0]}</div>}
                  </div>
                  <div className="body">
                    <h3>{r.title} <em>{r.italic}</em></h3>
                    <p>{r.excerpt}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </article>
    </PageShell>
  );
}

mountPage(JournalPost);
