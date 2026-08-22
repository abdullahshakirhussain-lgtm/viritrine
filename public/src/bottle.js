/* VITRINE — hero bottle. Self-contained ES module (from Claude Design).
   Exposes window.VITRINE_BOTTLE.mount(canvas) and self-claims #vit-bottle-canvas.
   Loads three from CDN on demand, degrades to the fallback when WebGL is off.
   Reads --vit-wine for the liquid colour. */

const THREE_URL = 'https://unpkg.com/three@0.169.0/build/three.module.js';
const CANVAS_ID = 'vit-bottle-canvas';
const FALLBACK_ID = 'vit-bottle-fallback';

const prefersReduced = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

function waitForEl(id, timeout = 20000) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      const el = document.getElementById(id);
      if (el) return resolve(el);
      if (performance.now() - t0 > timeout) return resolve(null);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function showFallback(canvas) {
  if (canvas) canvas.style.display = 'none';
  const fb = document.getElementById(FALLBACK_ID);
  if (fb) fb.style.opacity = '1';
}

function readAccent() {
  const v = getComputedStyle(document.body).getPropertyValue('--vit-wine').trim();
  return v || '#5A1430';
}

/* ---------- generated textures (no external assets) ---------- */

function studioEnv(THREE) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const x = c.getContext('2d');
  const sky = x.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#ffffff');
  sky.addColorStop(0.45, '#f2f3f2');
  sky.addColorStop(0.55, '#e2e5e4');
  sky.addColorStop(1, '#c9ccca');
  x.fillStyle = sky;
  x.fillRect(0, 0, 1024, 512);
  const box = (cx, cy, w, h, a) => {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h));
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(cx - w, cy - h, w * 2, h * 2);
  };
  box(250, 150, 210, 150, 1);
  box(760, 190, 170, 120, 0.85);
  x.fillStyle = 'rgba(24,24,22,0.55)';
  x.fillRect(470, 60, 90, 300);
  x.fillStyle = 'rgba(24,24,22,0.28)';
  x.fillRect(0, 430, 1024, 82);
  const t = new THREE.Texture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function labelTexture(THREE, accent) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 900;
  const x = c.getContext('2d');
  x.fillStyle = '#fbfbf9';
  x.fillRect(0, 0, 1024, 900);
  x.fillStyle = '#101010';
  x.textAlign = 'center';
  x.font = '500 34px "IBM Plex Mono", ui-monospace, monospace';
  x.fillText('N o .   0 1', 512, 150);
  x.fillStyle = accent;
  x.fillRect(392, 196, 240, 3);
  x.fillStyle = '#101010';
  x.font = '800 132px Archivo, system-ui, sans-serif';
  x.fillText('VITRINE', 512, 350);
  x.font = '400 40px Newsreader, Georgia, serif';
  x.fillStyle = '#3a3a34';
  x.fillText('Ceylon Verbena', 512, 452);
  x.fillText('Pressed Oil', 512, 508);
  x.fillStyle = '#d8d8d2';
  x.fillRect(340, 570, 344, 2);
  x.fillStyle = '#101010';
  x.font = '500 30px "IBM Plex Mono", ui-monospace, monospace';
  x.fillText('K A N D Y  ·  3 0 m l', 512, 640);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function shadowTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

/* ---------- bottle silhouette (lathe profile, bottom → top) ---------- */

function bottleProfile(THREE) {
  const p = [];
  p.push(new THREE.Vector2(0, -1.1));
  p.push(new THREE.Vector2(0.3, -1.1));
  p.push(new THREE.Vector2(0.355, -1.075));
  p.push(new THREE.Vector2(0.362, -1.03));
  p.push(new THREE.Vector2(0.362, 0.34));
  const steps = 14;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const r = 0.362 - (0.362 - 0.128) * Math.sin((t * Math.PI) / 2);
    const y = 0.34 + 0.42 * (1 - Math.cos((t * Math.PI) / 2));
    p.push(new THREE.Vector2(r, y));
  }
  p.push(new THREE.Vector2(0.128, 1.0));
  p.push(new THREE.Vector2(0.148, 1.02));
  p.push(new THREE.Vector2(0.148, 1.08));
  p.push(new THREE.Vector2(0.128, 1.1));
  p.push(new THREE.Vector2(0.108, 1.1));
  p.push(new THREE.Vector2(0.104, 1.05));
  p.push(new THREE.Vector2(0, 1.04));
  return p;
}

/* ---------- scene ---------- */

let THREE_MOD = null;
let current = null; // { canvas, dispose }
let claimed = false;

async function loadThree() {
  if (!THREE_MOD) THREE_MOD = await import(THREE_URL);
  return THREE_MOD;
}

async function boot(canvas) {
  const THREE = await loadThree();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });

  const mobile = Math.min(window.innerWidth, window.innerHeight) < 700;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.setClearAlpha(0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(0, 0.06, 8.4);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(studioEnv(THREE)).texture;
  scene.environment = env;

  const accent = readAccent();
  const wine = new THREE.Color(accent);
  const group = new THREE.Group();

  const glass = new THREE.Mesh(
    new THREE.LatheGeometry(bottleProfile(THREE), 128),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.05,
      transmission: 1,
      thickness: 0.5,
      ior: 1.48,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.15,
      transparent: true,
      side: THREE.DoubleSide
    })
  );
  group.add(glass);

  const liquid = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, -1.055),
        new THREE.Vector2(0.29, -1.055),
        new THREE.Vector2(0.338, -1.02),
        new THREE.Vector2(0.338, 0.2),
        new THREE.Vector2(0, 0.2)
      ],
      96
    ),
    new THREE.MeshPhysicalMaterial({
      color: wine,
      metalness: 0,
      roughness: 0.12,
      transmission: 0.5,
      thickness: 1.7,
      ior: 1.37,
      attenuationColor: wine,
      attenuationDistance: 1.1,
      envMapIntensity: 0.9,
      transparent: true,
      side: THREE.DoubleSide
    })
  );
  group.add(liquid);

  const label = new THREE.Mesh(
    new THREE.CylinderGeometry(0.368, 0.368, 0.6, 96, 1, true, -0.98, 1.96),
    new THREE.MeshStandardMaterial({
      map: labelTexture(THREE, accent),
      roughness: 0.82,
      metalness: 0,
      side: THREE.DoubleSide
    })
  );
  label.position.y = -0.2;
  group.add(label);

  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.162, 0.162, 0.04, 64),
    new THREE.MeshStandardMaterial({ color: wine, roughness: 0.35, metalness: 0.3 })
  );
  collar.position.y = 1.04;
  group.add(collar);

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.152, 0.158, 0.24, 64),
    new THREE.MeshStandardMaterial({ color: 0x17120f, roughness: 0.46, metalness: 0.22 })
  );
  cap.position.y = 1.18;
  group.add(cap);

  const shade = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 0.62),
    new THREE.MeshBasicMaterial({
      map: shadowTexture(THREE),
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      color: 0x0d0d0b
    })
  );
  shade.rotation.x = -Math.PI / 2;
  shade.position.y = -1.112;
  group.add(shade);

  scene.add(group);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d8d2, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(2.6, 3.2, 2.4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.75);
  rim.position.set(-3.2, 1.1, -1.6);
  scene.add(rim);

  const BASE_Y = -0.14;
  const still = prefersReduced() || document.body.getAttribute('data-vit-motion') === 'static';

  let alive = true;
  let raf = 0;
  const listeners = [];
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    listeners.push([target, type, fn]);
  };

  const resize = () => {
    const w = canvas.clientWidth || (canvas.parentElement && canvas.parentElement.clientWidth) || 1;
    const h = canvas.clientHeight || (canvas.parentElement && canvas.parentElement.clientHeight) || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = 8.4 * Math.max(1, 1.05 / camera.aspect);
    camera.updateProjectionMatrix();
  };
  resize();

  let ro = null;
  if (window.ResizeObserver) {
    ro = new ResizeObserver(resize);
    ro.observe(canvas);
  } else {
    on(window, 'resize', resize);
  }

  const dispose = () => {
    alive = false;
    if (raf) cancelAnimationFrame(raf);
    if (ro) ro.disconnect();
    listeners.forEach(([tg, ty, fn]) => tg.removeEventListener(ty, fn));
    renderer.dispose();
    pmrem.dispose();
  };

  if (still) {
    group.rotation.y = BASE_Y;
    renderer.render(scene, camera);
    return { canvas, dispose };
  }

  let visible = true;
  let io = null;
  if (window.IntersectionObserver) {
    io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0.01 });
    io.observe(canvas);
  }

  let px = 0;
  let py = 0;
  let tx = 0;
  let ty = 0;
  if (!mobile) {
    on(window, 'pointermove', (e) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
  }

  let scroll = 0;
  on(window, 'scroll', () => {
    const r = canvas.getBoundingClientRect();
    scroll = Math.max(0, Math.min(1, -r.top / Math.max(1, r.height)));
  }, { passive: true });

  const t0 = performance.now();
  const SETTLE = 1600;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  const frame = (now) => {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    // the element can be swapped out from under us as the page streams in
    if (!canvas.isConnected) {
      dispose();
      if (io) io.disconnect();
      claimed = false;
      current = null;
      claim();
      return;
    }
    if (!visible) return;
    const elapsed = now - t0;
    const s = Math.min(1, elapsed / SETTLE);
    const e = easeOut(s);

    px += (tx - px) * 0.045;
    py += (ty - py) * 0.045;

    const drift = Math.sin(elapsed / 5200) * 0.035;
    group.rotation.y = (-0.62 + (BASE_Y + 0.62) * e) + drift + px * 0.1 + scroll * 0.22;
    group.rotation.x = py * 0.045 - scroll * 0.03;
    group.position.y = (1 - e) * -0.16 - scroll * 0.16;
    group.position.x = px * 0.04;
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return { canvas, dispose };
}

async function mount(canvas) {
  if (!canvas) return;
  if (current && current.canvas === canvas) return;
  if (!hasWebGL()) return showFallback(canvas);
  if (current) {
    current.dispose();
    current = null;
  }
  claimed = true;
  try {
    current = await boot(canvas);
  } catch (e) {
    current = null;
    showFallback(canvas);
  }
}

/* Safety net: if the page never hands us a canvas, find it ourselves. */
async function claim() {
  const el = await waitForEl(CANVAS_ID);
  if (!el || claimed) return;
  mount(el);
}

window.VITRINE_BOTTLE = { mount: mount };
setTimeout(claim, 1200);
