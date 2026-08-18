// hero-gl.js — the "liquid chrome" WebGL centrepiece for the gallery homepage.
//
// Runs as its own ES module (Three.js from the import map). It only touches its
// own <canvas id="hero-gl-canvas">, so it coexists with the Babel/UMD React app.
// Everything is wrapped so a failure degrades to the CSS poster fallback and
// never throws into the page. Also wires the CSS-3D card tilt.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ── CSS-3D card tilt (delegated; works regardless of React render timing) ── */
(function cardTilt() {
  if (reduceMotion) return;
  const MAX = 6; // degrees
  const sel = '[data-skin="gallery"] .product, [data-skin="gallery"] .sale-card';
  document.addEventListener("pointermove", (e) => {
    const card = e.target.closest(sel);
    if (!card) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    card.style.setProperty("--ry", (px * MAX).toFixed(2) + "deg");
    card.style.setProperty("--rx", (-py * MAX).toFixed(2) + "deg");
  }, { passive: true });
  document.addEventListener("pointerout", (e) => {
    const card = e.target.closest(sel);
    if (!card) return;
    card.style.setProperty("--ry", "0deg");
    card.style.setProperty("--rx", "0deg");
  }, { passive: true });
})();

/* ── Wait for the React-rendered canvas, then boot the scene ──
   Babel compiles the JSX in-browser first, so the canvas can appear several
   seconds after load — use a MutationObserver (with a long safety timeout)
   rather than a short rAF budget. */
function whenCanvas(cb) {
  const found = () => document.getElementById("hero-gl-canvas");
  const el = found();
  if (el) return cb(el);
  let done = false;
  const finish = (node) => { if (done) return; done = true; obs.disconnect(); clearTimeout(timer); cb(node); };
  const obs = new MutationObserver(() => { const n = found(); if (n) finish(n); });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  const timer = setTimeout(() => { const n = found(); obs.disconnect(); if (n) finish(n); }, 20000);
}

function markFallback() {
  const stage = document.querySelector('[data-skin="gallery"] .gl-hero-stage');
  if (stage) stage.setAttribute("data-fallback", "1");
}

// Cheap WebGL capability probe.
function webglOK() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

whenCanvas(async (canvas) => {
  if (!webglOK()) return markFallback();
  let THREE, RoomEnvironment, MarchingCubes;
  try {
    THREE = await import("three");
    ({ RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js"));
    ({ MarchingCubes } = await import("three/addons/objects/MarchingCubes.js"));
  } catch (e) {
    console.warn("hero-gl: three failed to load", e);
    return markFallback();
  }

  try {
    const stage = canvas.parentElement;
    const isSmall = window.matchMedia("(max-width: 700px)").matches;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setClearColor(0x000000, 0); // transparent → white page shows through
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const DPR = Math.min(window.devicePixelRatio || 1, isSmall ? 1.5 : 2);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0, 3.1);

    // Procedural studio reflections — no external HDR asset needed.
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    // Studio lights for a wet, glossy highlight (env map handles fill/reflection).
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2.5, 3.5, 2.5); scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 1.3);
    rim.position.set(-3, 1, -2.5); scene.add(rim);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xdddde3, 0.5));

    // A glossy, product-tinted liquid droplet (a "drop of the product") — NOT metal.
    const targetTint = new THREE.Color("#6a1b3c");
    const applyTint = () => { if (window.__heroTint) { try { targetTint.set(window.__heroTint); } catch {} } };
    applyTint();
    const material = new THREE.MeshPhysicalMaterial({
      color: targetTint.clone(),
      metalness: 0.0, roughness: 0.12,
      clearcoat: 1.0, clearcoatRoughness: 0.08,
      sheen: 0.5, sheenColor: new THREE.Color(0xffffff),
      envMapIntensity: 1.25, ior: 1.45, specularIntensity: 1.0,
    });
    const resolution = isSmall ? 40 : 64;
    const blob = new MarchingCubes(resolution, material, true, false, 90000);
    blob.scale.set(1.4, 1.4, 1.4);
    blob.isolation = 60;
    scene.add(blob);

    // A cohesive, gently wobbling droplet (small orbit so the mass stays together
    // as one drop rather than a molecule of separate balls).
    function fillBlob(t) {
      blob.reset();
      const subtract = 12;
      blob.addBall(0.5, 0.5 + Math.sin(t * 0.9) * 0.03, 0.5, 0.95, subtract); // central mass
      const n = 3;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + t * 0.55;
        const rr = 0.11 + 0.03 * Math.sin(t * 1.1 + i);
        const x = 0.5 + Math.cos(a) * rr;
        const y = 0.5 + Math.sin(a) * rr;
        const z = 0.5 + Math.sin(t * 0.7 + i) * 0.06;
        blob.addBall(x, y, z, 0.55, subtract);
      }
      blob.update();
    }

    // Pointer parallax (very subtle).
    let tx = 0, ty = 0, cx = 0, cy = 0;
    window.addEventListener("pointermove", (e) => {
      tx = (e.clientX / window.innerWidth - 0.5);
      ty = (e.clientY / window.innerHeight - 0.5);
    }, { passive: true });

    function resize() {
      const w = stage.clientWidth || canvas.clientWidth || 0;
      const h = stage.clientHeight || canvas.clientHeight || 0;
      if (w < 2 || h < 2) return; // layout not settled yet — RO will call again
      renderer.setPixelRatio(DPR);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize);
    // Re-size whenever the stage's box actually changes (covers late CSS/layout).
    try { new ResizeObserver(resize).observe(stage); } catch {}

    // Render control: pause when tab hidden or hero scrolled offscreen.
    let visible = true, running = false, raf = 0;
    const clock = new THREE.Clock();

    function frame() {
      if (!running) return;
      const t = clock.getElapsedTime();
      applyTint(); material.color.lerp(targetTint, 0.06); // ease toward the product colour
      fillBlob(t);
      blob.rotation.y = t * 0.18;
      blob.rotation.x = Math.sin(t * 0.2) * 0.12;
      cx += (tx - cx) * 0.05; cy += (ty - cy) * 0.05;
      camera.position.x = cx * 0.6;
      camera.position.y = -cy * 0.4;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    function start() { if (!running && visible) { running = true; clock.start(); frame(); } }
    function stop() { running = false; cancelAnimationFrame(raf); }

    if (reduceMotion) {
      // Single static frame, no loop.
      resize(); applyTint(); material.color.copy(targetTint); fillBlob(1.2); blob.rotation.y = 0.6; renderer.render(scene, camera);
    } else {
      const io = new IntersectionObserver((es) => {
        visible = es[0].isIntersecting;
        visible ? start() : stop();
      }, { threshold: 0.05 });
      io.observe(stage);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) stop(); else start();
      });
      start();
    }
  } catch (e) {
    console.warn("hero-gl: scene error", e);
    markFallback();
  }
});
