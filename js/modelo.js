import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";

const statusEl = document.getElementById("modelo-estado");
const pickEl = document.getElementById("modelo-pick");
const detalleEl = document.getElementById("modelo-detalle");

const FIT = 2.2;
const MODEL_ROOT = "assets/models/";

const CATALOGO = [
  { id: "cajaG", t: "c", l: "Caja (OBJ + textura)" },
  { id: "gun1", t: "f", r: "gun1/gun1", p: 1, c: 0x94a3b8, l: "Arma 1 (FBX)" },
  { id: "gun2", t: "f", r: "gun2/gun2", p: 1, c: 0x94a3b8, l: "Arma 2 (FBX)" },
  { id: "gun3", t: "f", r: "gun3/gun3", p: 1, c: 0x94a3b8, l: "Arma 3 (FBX)" },
  { id: "gun4", t: "f", r: "gun4/gun4", p: 0, c: 0xa8b0bd, l: "Arma 4 (FBX, sin PNG)" },
  { id: "astro", t: "f", r: "astro/astronout", p: 0, c: 0x2f6fe0, fit: 0.7, tAzul: 1, l: "Astronauta (WASD / flechas · clic en el lienzo)" },
  { id: "paintball", t: "a", l: "Cancha paintball (OBJ, más pesada)" }
];

const PB_MAP = {
  floor: "FloorBakeCycles.png",
  outerwalls: "OuterwallsCycles.png",
  roof: "RoofBakeCycles.png",
  ceiling: "RoofBakeCycles.png",
  material: "WallsBakeCycles.png",
  walls: "WallsBakeCycles.png"
};

const ASTRO_ID = "astro";
const ASTRO_BORDE = 2.45;
const camSegui = { dist: 2.25, alto: 0.95, suav: 0.15 };
let idModeloVista = CATALOGO[0].id;
const wanderAstro = { x: 0, z: 0, lastRot: Math.PI };
const keysAstro = { w: false, a: false, s: false, d: false };

function resetAstroMov() {
  wanderAstro.x = 0;
  wanderAstro.z = 0;
  wanderAstro.lastRot = Math.PI;
  keysAstro.w = keysAstro.a = keysAstro.s = keysAstro.d = false;
}

let loadId = 0;
let currentRoot = null;
let animStartS = 0;
const introDurS = 0.55;
const baseDirIntensity = 0.9;
const reduceMotion =
  typeof globalThis.matchMedia === "function" &&
  globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}
const fbxL = new FBXLoader();
const txL = new THREE.TextureLoader();
const v3 = new THREE.Vector3();
const bBox = new THREE.Box3();

function setE(msg, ok) {
  statusEl.textContent = msg;
  statusEl.className = ok === true ? "ok" : ok === false ? "err" : "";
}
const det = (s) => detalleEl && (detalleEl.textContent = s || "");

const sc = new THREE.Scene();
sc.background = new THREE.Color(0x0f172a);
const cam = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 2e3);
const re = new THREE.WebGLRenderer({ canvas: document.getElementById("modelo-canvas"), antialias: true, powerPreference: "high-performance" });
re.setSize(innerWidth, innerHeight);
re.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
re.outputColorSpace = THREE.SRGBColorSpace;
sc.add(new THREE.AmbientLight(0xffffff, 0.9));
const di = new THREE.DirectionalLight(0xffffff, baseDirIntensity);
di.position.set(2.5, 4, 3.5);
sc.add(di);
sc.add(new THREE.GridHelper(6, 12, 0x475569, 0x1e293b));
const aniso = Math.min(4, re.capabilities.getMaxAnisotropy());

function prepT(t) {
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.flipY = true;
  return t;
}

function runMats(o, apply) {
  o.traverse((c) => {
    if (!c.isMesh) return;
    (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m && apply(m));
  });
}

function ajustarFoto(obj, spanU = FIT) {
  bBox.setFromObject(obj);
  const s0 = bBox.getSize(v3);
  const mx = Math.max(s0.x, s0.y, s0.z) || 1;
  obj.scale.setScalar(spanU / mx);
  obj.updateMatrixWorld(true);
  bBox.setFromObject(obj);
  const c = bBox.getCenter(v3);
  obj.position.set(-c.x, -bBox.min.y, -c.z);
}

function ajusteCamara(obj) {
  bBox.setFromObject(obj);
  const c = bBox.getCenter(v3);
  const s = bBox.getSize(v3);
  const r = (Math.max(s.x, s.y, s.z) * 0.55) || 0.5;
  cam.near = Math.max(0.01, r * 0.02);
  cam.far = Math.max(500, r * 200);
  cam.updateProjectionMatrix();
  cam.position.set(c.x + r * 1.4, c.y + r * 0.9, c.z + r * 1.4);
  cam.lookAt(c);
}

function out() {
  if (currentRoot) {
    sc.remove(currentRoot);
    currentRoot = null;
  }
}

function fbxMat(obj, m, h, spec) {
  const base = h != null ? new THREE.Color(h) : new THREE.Color(0xffffff);
  const tAz = spec && spec.tAzul;
  runMats(obj, (M) => {
    if (m) {
      M.map = m;
      M.color.setHex(0xffffff);
    } else {
      M.color.copy(base);
      if (tAz) {
        if ("emissive" in M && M.emissive) {
          M.emissive.copy(base).multiplyScalar(0.22);
        } else if ("emissive" in M) {
          M.emissive = base.clone().multiplyScalar(0.2);
        }
        if (typeof M.emissiveIntensity === "number") {
          M.emissiveIntensity = Math.max(M.emissiveIntensity, 0.22);
        }
        if (typeof M.metalness === "number") M.metalness = Math.max(0, Math.max(M.metalness, 0.12));
        if (typeof M.roughness === "number") M.roughness = Math.min(0.82, M.roughness < 0.3 ? 0.72 : M.roughness);
      }
    }
    M.needsUpdate = true;
  });
}

function txCands(nombreRelativo) {
  return [MODEL_ROOT + nombreRelativo, `/${MODEL_ROOT}${nombreRelativo}`.replace(/\/+/g, "/")];
}

function cargaTexturaRutas(rutas, g, luego, err) {
  let i = 0;
  function s() {
    if (g !== loadId) return;
    if (i >= rutas.length) {
      if (err) err();
      return;
    }
    const u = rutas[i++];
    txL.load(
      u,
      (t) => {
        if (g !== loadId) return;
        luego(prepT(t), u);
      },
      undefined,
      s
    );
  }
  s();
}

function enganchar(obj, ruta, g, spec) {
  if (g !== loadId) return;
  const fitSpan = spec && typeof spec.fit === "number" && spec.fit > 0 ? spec.fit : FIT;
  ajustarFoto(obj, fitSpan);
  const st = new THREE.Group();
  st.name = "modelo-actual";
  obj.name = "modelo-mesh";
  st.add(obj);
  st.scale.setScalar(1);
  sc.add(st);
  st.updateMatrixWorld(true);
  ajusteCamara(st);
  if (reduceMotion) st.scale.setScalar(1);
  else st.scale.setScalar(0.86);
  animStartS = performance.now() * 0.001;
  currentRoot = st;
  setE("Listo.", true);
  det(ruta);
}

function pbAplicaTexturas(obj, porMat) {
  const n = (s) => String(s || "")
    .trim()
    .toLowerCase();
  runMats(obj, (M) => {
    const t = porMat[n(M.name)];
    if (t) {
      M.map = t;
      M.color.setHex(0xffffff);
      M.needsUpdate = true;
    }
  });
}

function cargaBakes(g, done, fail) {
  const bdir = `${MODEL_ROOT}paintball/textures/`;
  const ufiles = [...new Set(Object.values(PB_MAP))];
  const fPorArch = Object.create(null);
  const total = ufiles.length;
  let leidos = 0;
  let bloqueo = false;

  function listo() {
    if (g !== loadId || bloqueo) return;
    const m = Object.create(null);
    for (const k of Object.keys(PB_MAP)) m[k] = fPorArch[PB_MAP[k]];
    done(m);
  }

  for (const f of ufiles) {
    const urls = [bdir + f, `/${bdir}${f}`.replace(/\/+/g, "/")];
    let i = 0;
    (function intenta() {
      if (g !== loadId) return;
      if (i >= urls.length) {
        if (!bloqueo) {
          bloqueo = true;
          fail(f);
        }
        return;
      }
      const u = urls[i++];
      txL.load(
        u,
        (t) => {
          if (g !== loadId || bloqueo) return;
          fPorArch[f] = prepT(t);
          if (++leidos === total) listo();
        },
        undefined,
        intenta
      );
    })();
  }
}

function cargaCajaG(g) {
  setE("Cargando cajaG…", null);
  const base = `${MODEL_ROOT}cajaG/cajaG`;
  const mtlL = new MTLLoader();
  const objL = new OBJLoader();
  mtlL.setMaterialOptions({ side: THREE.DoubleSide });
  mtlL.setResourcePath(`${MODEL_ROOT}cajaG/`);
  mtlL.load(
    base + ".mtl",
    (M) => {
      if (g !== loadId) return;
      M.preload();
      objL.setMaterials(M);
      objL.load(
        base + ".obj",
        (O) => {
          if (g !== loadId) return;
          cargaTexturaRutas(
            [base + ".png", "assets/textures/cajaG.png", "/assets/textures/cajaG.png"],
            g,
            (tx, u) => {
              runMats(O, (m) => {
                m.map = tx;
                m.color.setHex(0xffffff);
                m.needsUpdate = true;
              });
              enganchar(O, `${base}.obj  ←  ${u}`, g);
            },
            () => {
              if (g !== loadId) return;
              enganchar(O, `${base}.obj (sin textura)`, g);
            }
          );
        },
        undefined,
        (e) => (console.error(e), setE("Error cajaG.obj", false))
      );
    },
    undefined,
    (e) => (console.error(e), setE("Error cajaG.mtl", false))
  );
}

function cargaFbx(spec, g) {
  const path = `${MODEL_ROOT}${spec.r}.fbx`;
  setE("Cargando…", null);
  fbxL.load(
    path,
    (O) => {
      if (g !== loadId) return;
      if (spec.p) {
        cargaTexturaRutas(
          txCands(`${spec.r}.png`),
          g,
          (tx, u) => {
            fbxMat(O, tx, null, spec);
            enganchar(O, path + " + " + u, g, spec);
          },
          () => {
            fbxMat(O, null, spec.c, spec);
            enganchar(O, path, g, spec);
          }
        );
      } else {
        fbxMat(O, null, spec.c, spec);
        enganchar(O, path, g, spec);
      }
    },
    undefined,
    (e) => (console.error(e), setE("Error FBX", false))
  );
}

function cargaPaintball(g) {
  setE("Cargando cancha (texturas + obj)…", null);
  cargaBakes(
    g,
    (map) => {
      if (g !== loadId) return;
      const dir = `${MODEL_ROOT}paintball/`;
      const mtlL = new MTLLoader();
      const objL = new OBJLoader();
      mtlL.setMaterialOptions({ side: THREE.DoubleSide });
      mtlL.setResourcePath(dir + "textures/");
      mtlL.load(
        dir + "paintball.mtl",
        (M) => {
          if (g !== loadId) return;
          M.preload();
          objL.setMaterials(M);
          objL.load(
            dir + "paintball.obj",
            (O) => {
              if (g !== loadId) return;
              pbAplicaTexturas(O, map);
              enganchar(O, dir + "paintball.obj", g);
            },
            undefined,
            (e) => (console.error(e), setE("Error paintball.obj", false))
          );
        },
        undefined,
        () => {
          if (g !== loadId) return;
          new OBJLoader().load(
            dir + "paintball.obj",
            (O) => {
              if (g !== loadId) return;
              pbAplicaTexturas(O, map);
              enganchar(O, dir + "paintball.obj (sin mtl)", g);
            },
            undefined,
            (e) => (console.error(e), setE("Error paintball.obj", false))
          );
        }
      );
    },
    (f) => (console.error(f), setE("Falta textura paintball: " + f, false))
  );
}

function carga(id) {
  const g = ++loadId;
  idModeloVista = id;
  if (id !== ASTRO_ID) resetAstroMov();
  out();
  if (id === "cajaG") cargaCajaG(g);
  else if (id === "paintball") cargaPaintball(g);
  else {
    const x = CATALOGO.find((e) => e.id === id);
    if (x && x.t === "f") cargaFbx(x, g);
  }
}

CATALOGO.forEach((e) => {
  const o = document.createElement("option");
  o.value = e.id;
  o.textContent = e.l;
  pickEl.appendChild(o);
});
pickEl.addEventListener("change", () => carga(pickEl.value));

function astroManejaTecla(ev, on) {
  if (idModeloVista !== ASTRO_ID) return false;
  const c = ev.code;
  if (c === "KeyW" || c === "ArrowUp") {
    keysAstro.w = on;
    ev.preventDefault();
    return true;
  }
  if (c === "KeyS" || c === "ArrowDown") {
    keysAstro.s = on;
    ev.preventDefault();
    return true;
  }
  if (c === "KeyA" || c === "ArrowLeft") {
    keysAstro.a = on;
    ev.preventDefault();
    return true;
  }
  if (c === "KeyD" || c === "ArrowRight") {
    keysAstro.d = on;
    ev.preventDefault();
    return true;
  }
  const k = (ev.key || "").toLowerCase();
  if (k.length === 1 && "wasd".indexOf(k) >= 0) {
    if (k === "w") keysAstro.w = on;
    if (k === "a") keysAstro.a = on;
    if (k === "s") keysAstro.s = on;
    if (k === "d") keysAstro.d = on;
    ev.preventDefault();
    return true;
  }
  return false;
}

addEventListener(
  "keydown",
  (e) => {
    astroManejaTecla(e, true);
  },
  true
);
addEventListener(
  "keyup",
  (e) => {
    astroManejaTecla(e, false);
  },
  true
);
addEventListener("blur", () => {
  if (idModeloVista === ASTRO_ID) keysAstro.w = keysAstro.a = keysAstro.s = keysAstro.d = false;
});
const elCanvas = document.getElementById("modelo-canvas");
if (elCanvas) {
  elCanvas.addEventListener("click", () => elCanvas.focus({ preventScroll: true }));
  elCanvas.tabIndex = 0;
}

function tickAstroMov() {
  let mx = 0;
  let mz = 0;
  if (keysAstro.w) mz -= 1;
  if (keysAstro.s) mz += 1;
  if (keysAstro.a) mx -= 1;
  if (keysAstro.d) mx += 1;
  const l = Math.hypot(mx, mz) || 1;
  mx /= l;
  mz /= l;
  const sp = reduceMotion ? 0.05 : 0.075;
  if (mx || mz) {
    wanderAstro.x = Math.max(-ASTRO_BORDE, Math.min(ASTRO_BORDE, wanderAstro.x + mx * sp));
    wanderAstro.z = Math.max(-ASTRO_BORDE, Math.min(ASTRO_BORDE, wanderAstro.z + mz * sp));
    wanderAstro.lastRot = Math.atan2(mx, mz) + Math.PI;
  }
  currentRoot.position.x = wanderAstro.x;
  currentRoot.position.z = wanderAstro.z;
  if (reduceMotion) {
    currentRoot.position.y = 0;
    currentRoot.rotation.x = 0;
    currentRoot.rotation.z = 0;
    currentRoot.rotation.y = wanderAstro.lastRot;
  } else {
    const tA = performance.now() * 0.001;
    const tIn = tA - animStartS;
    if (tIn < introDurS) {
      const p = Math.min(1, tIn / introDurS);
      currentRoot.scale.setScalar(0.86 + 0.14 * easeOutCubic(p));
    } else currentRoot.scale.setScalar(1);
    const ph = tA * 1.12;
    currentRoot.position.y = 0.04 * Math.sin(ph);
    currentRoot.rotation.x = 0.01 * Math.sin(ph * 0.8);
    currentRoot.rotation.y = wanderAstro.lastRot;
    currentRoot.rotation.z = 0.006 * Math.sin(tA * 0.58 + 0.6);
  }
  const p = currentRoot.position;
  const r = currentRoot.rotation.y;
  const tx = p.x - Math.sin(r) * camSegui.dist;
  const ty = p.y + camSegui.alto;
  const tz = p.z - Math.cos(r) * camSegui.dist;
  const s = camSegui.suav;
  cam.position.x += (tx - cam.position.x) * s;
  cam.position.y += (ty - cam.position.y) * s;
  cam.position.z += (tz - cam.position.z) * s;
  cam.lookAt(p.x, p.y + 0.4, p.z);
}

function tick() {
  const t = performance.now() * 0.001;
  if (idModeloVista === ASTRO_ID && currentRoot) {
    tickAstroMov();
  } else if (currentRoot) {
    if (reduceMotion) {
      currentRoot.position.y = 0;
      currentRoot.rotation.x = 0;
      currentRoot.rotation.z = 0;
      currentRoot.rotation.y += 0.0022;
    } else {
      const tIn = t - animStartS;
      if (tIn < introDurS) {
        const p = Math.min(1, tIn / introDurS);
        currentRoot.scale.setScalar(0.86 + 0.14 * easeOutCubic(p));
      } else currentRoot.scale.setScalar(1);
      const ph = t * 1.12;
      currentRoot.position.x = 0;
      currentRoot.position.z = 0;
      currentRoot.position.y = 0.04 * Math.sin(ph);
      currentRoot.rotation.x = 0.012 * Math.sin(ph * 0.8);
      currentRoot.rotation.y += 0.0031;
      currentRoot.rotation.z = 0.008 * Math.sin(t * 0.58 + 0.6);
    }
  }
  di.intensity = reduceMotion ? baseDirIntensity : baseDirIntensity + 0.04 * Math.sin(t * 0.28);
  re.render(sc, cam);
  requestAnimationFrame(tick);
}
tick();

addEventListener("resize", () => {
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
  re.setSize(innerWidth, innerHeight);
});

carga(CATALOGO[0].id);