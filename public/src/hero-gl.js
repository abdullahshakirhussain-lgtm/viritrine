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

    // A touch of directional light for a crisp specular streak.
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(2, 3, 2);
    scene.add(key);

    // Chrome metaballs — the "liquid chrome".
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xf3f4f7, metalness: 1.0, roughness: 0.045,
      clearcoat: 1.0, clearcoatRoughness: 0.06, envMapIntensity: 1.15,
    });
    const resolution = isSmall ? 40 : 64;
    const blob = new MarchingCubes(resolution, material, true, false, 90000);
    blob.scale.set(1.35, 1.35, 1.35);
    blob.isolation = 60;
    scene.add(blob);

    function fillBlob(t) {
      blob.reset();
      const strength = 0.62;
      const subtract = 12;
      const n = 5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + t * 0.5;
        const x = 0.5 + Math.cos(a) * (0.16 + 0.05 * Math.sin(t * 0.7 + i));
        const y = 0.5 + Math.sin(a) * (0.16 + 0.05 * Math.cos(t * 0.6 + i));
        const z = 0.5 + Math.sin(t * 0.8 + i * 1.7) * 0.13;
        blob.addBall(x, y, z, strength, subtract);
      }
      blob.addBall(0.5, 0.5, 0.5, 0.5, subtract); // cohesive core
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
      resize(); fillBlob(1.2); blob.rotation.y = 0.6; renderer.render(scene, camera);
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
