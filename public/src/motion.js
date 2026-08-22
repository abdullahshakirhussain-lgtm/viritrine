/* ============================================================================
   VITRINE — motion & feel (Cabinet surfaces). Self-contained ES module, loaded
   like bottle.js. Everything here is progressive enhancement:
     • Without JS, or under prefers-reduced-motion, nothing hides or animates —
       the `.vit-motion` class (added below) is what arms the CSS, so content is
       always visible if this file never runs.
     • Resilient to React's in-browser Babel mount: a MutationObserver feeds new
       [data-reveal] nodes to the IntersectionObserver as they appear.
   Effects: scroll-reveal, a first-load entrance curtain (once/session), a custom
   gallery cursor, and subtle hero parallax.
   ========================================================================== */
(function () {
  "use strict";
  var root = document.documentElement;
  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var finePointer = false;
  try { finePointer = window.matchMedia("(pointer: fine)").matches; } catch (e) {}

  // Under reduced motion we arm nothing — [data-reveal] stays visible, no cursor,
  // no entrance. This is the accessible, safe default.
  if (reduce) return;

  root.classList.add("vit-motion");

  /* ── scroll reveal ─────────────────────────────────────────────────────── */
  // A position check (getBoundingClientRect on scroll/resize) is the primary
  // driver — it needs no compositing, so it's robust everywhere. An
  // IntersectionObserver, when supported, is a nice accelerator on top.
  var pending = [];         // armed nodes not yet revealed
  var io = null;
  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) reveal(en.target); });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
  }
  function reveal(node) {
    if (!node || node.__vitIn) return;
    node.__vitIn = true;
    node.classList.add("in");
    if (io) io.unobserve(node);
    var k = pending.indexOf(node);
    if (k > -1) pending.splice(k, 1);
  }
  function armReveal(node) {
    if (!node || node.__vitReveal) return;
    node.__vitReveal = true;
    pending.push(node);
    if (io) io.observe(node);
  }
  function scan(scope) {
    var els = (scope || document).querySelectorAll("[data-reveal]");
    for (var i = 0; i < els.length; i++) armReveal(els[i]);
  }
  var checkQueued = false;
  function check() {
    checkQueued = false;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    for (var i = pending.length - 1; i >= 0; i--) {
      var r = pending[i].getBoundingClientRect();
      if (r.top < vh * 0.92 && r.bottom > 0) reveal(pending[i]);
    }
  }
  function queueCheck() { if (!checkQueued) { checkQueued = true; setTimeout(check, 80); } }
  window.addEventListener("scroll", queueCheck, { passive: true });
  window.addEventListener("resize", queueCheck, { passive: true });

  scan(document);
  check(); // reveal whatever is already in view on load
  // React (Babel-in-browser) mounts after this module runs, so watch for nodes.
  if ("MutationObserver" in window) {
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (n.hasAttribute && n.hasAttribute("data-reveal")) armReveal(n);
          if (n.querySelectorAll) scan(n);
        }
      }
      queueCheck();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { mo.disconnect(); }, 8000);
  }
  // A few settle passes catch late-mounting content without needing scroll.
  [400, 1000, 2000].forEach(function (t) { setTimeout(check, t); });

  /* ── entrance curtain (homepage, once per session) ─────────────────────── */
  function entrance() {
    if (!document.body.hasAttribute("data-vit-entrance")) return;
    try { if (sessionStorage.getItem("vit_entered")) return; } catch (e) {}
    try { sessionStorage.setItem("vit_entered", "1"); } catch (e) {}

    var c = document.createElement("div");
    c.className = "vit-curtain";
    c.innerHTML = '<span class="vit-curtain-word">VITRINE</span>';
    document.body.appendChild(c);
    root.classList.add("vit-locked"); // freeze scroll during the reveal
    // force reflow then play
    // eslint-disable-next-line no-unused-expressions
    c.offsetHeight;
    requestAnimationFrame(function () { c.classList.add("play"); });
    var done = function () {
      root.classList.remove("vit-locked");
      if (c.parentNode) c.parentNode.removeChild(c);
    };
    c.addEventListener("animationend", function (e) {
      if (e.animationName === "vitCurtainLift") done();
    });
    setTimeout(done, 2200); // hard failsafe
    // let a click skip it
    c.addEventListener("click", function () { c.classList.add("play"); });
  }
  entrance();

  /* ── custom cursor (fine pointer only) ─────────────────────────────────── */
  if (finePointer && document.body.hasAttribute("data-vit-cursor")) {
    var dot = document.createElement("div");
    dot.className = "vit-cursor";
    document.body.appendChild(dot);
    var x = window.innerWidth / 2, y = window.innerHeight / 2, tx = x, ty = y, raf;
    function loop() {
      x += (tx - x) * 0.18; y += (ty - y) * 0.18;
      dot.style.transform = "translate(" + x + "px," + y + "px) translate(-50%,-50%)";
      raf = requestAnimationFrame(loop);
    }
    window.addEventListener("mousemove", function (e) {
      tx = e.clientX; ty = e.clientY;
      if (!dot.classList.contains("on")) dot.classList.add("on");
    }, { passive: true });
    window.addEventListener("mouseout", function (e) {
      if (!e.relatedTarget) dot.classList.remove("on");
    });
    var interactive = "a,button,[data-cursor],input,select,textarea,label";
    document.addEventListener("mouseover", function (e) {
      if (e.target.closest && e.target.closest(interactive)) dot.classList.add("grow");
    });
    document.addEventListener("mouseout", function (e) {
      if (e.target.closest && e.target.closest(interactive)) dot.classList.remove("grow");
    });
    loop();
  }

  /* ── hero parallax (glass case + bottle drift) ─────────────────────────── */
  var caseEl = null;
  function findCase() { caseEl = document.querySelector('[data-vit-case="hero"]'); return caseEl; }
  var px = 0, py = 0, tpx = 0, tpy = 0, prafPending = false;
  function applyParallax() {
    prafPending = false;
    if (!caseEl && !findCase()) return;
    px += (tpx - px) * 0.08; py += (tpy - py) * 0.08;
    caseEl.style.transform = "translate3d(" + px.toFixed(2) + "px," + py.toFixed(2) + "px,0) scale(1.03)";
    if (Math.abs(tpx - px) > 0.2 || Math.abs(tpy - py) > 0.2) schedule();
  }
  function schedule() { if (!prafPending) { prafPending = true; requestAnimationFrame(applyParallax); } }
  if (finePointer) {
    window.addEventListener("mousemove", function (e) {
      var cx = (e.clientX / window.innerWidth - 0.5);
      var cy = (e.clientY / window.innerHeight - 0.5);
      tpx = cx * 22; tpy = cy * 14; schedule();
    }, { passive: true });
  }
})();
