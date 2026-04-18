import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import {
  iniciarVistaSync,
  enviarVista,
  onVistaMessage,
  setVistaEstadoElement,
  getVentanaId,
  getTransportLabel
} from "./modelo-vista-sync.js";

const FBX_URLS = ["assets/models/astro/astronout.fbx", "/assets/models/astro/astronout.fbx"];
const PNG_URLS = ["assets/models/astro/astronout.png", "/assets/models/astro/astronout.png"];

/** Mismas bases que multijugador (assets.js) para encontrar gun1 / gun2. */
const MODEL_BASES = ["assets/models/", "/assets/models/", "../assets/models/"];

const ASTRO_BORDE = 2.45;
/** Cámara alejada y alta para ver cuerpo + arma sin “zoom” excesivo. */
const camSegui = { dist: 10.5, alto: 3.6, suav: 0.1 };
/** Escala base del mesh (Arena); el grupo se encoge con WORLD_GROUP_SCALE. */
const ASTRO_SCALE = 0.02;
/** Encoge el astronauta (el arma usa la misma escala visual). */
const WORLD_GROUP_SCALE = 0.52;
/** Posición mundo del arma 1 (IJKO). */
const gunWorld = { x: 1.45, y: 0.78, z: 0.42 };
/** Posición mundo del arma 2 (CVBN), a la izquierda respecto al 1. */
const gun2World = { x: -1.35, y: 0.78, z: 0.42 };
const GUN_NUDGE = 0.028;
const GUN_ARENA = 4.2;

const canvas = document.getElementById("astro-canvas");
const statusEl = document.getElementById("astro-status");
const playerNameHud = document.getElementById("astro-player-name");
const ACTIVE_MATCH_KEY = "pintagol_active_match";

function resolveLocalPlayerName() {
  const q = new URLSearchParams(window.location.search);
  const fromQuery = q.get("playerName");
  if (fromQuery && fromQuery.trim()) return fromQuery.trim();
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_MATCH_KEY);
    if (!raw) return "";
    const o = JSON.parse(raw);
    if (o && typeof o.playerName === "string" && o.playerName.trim()) return o.playerName.trim();
  } catch (_) {
    /* ignorar */
  }
  return "";
}

(function showLocalPlayerName() {
  const name = resolveLocalPlayerName();
  if (playerNameHud) {
    playerNameHud.textContent = name ? `Jugador: ${name}` : "";
    if (!name) playerNameHud.setAttribute("hidden", "");
    else playerNameHud.removeAttribute("hidden");
  }
})();

function setStatus(msg, ok) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.className = ok === true ? "ok" : ok === false ? "err" : "";
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 5, 16);
camera.lookAt(0, 1.2, 0);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance"
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());

scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const di = new THREE.DirectionalLight(0xffffff, 0.95);
di.position.set(2.5, 4, 3.5);
scene.add(di);
scene.add(new THREE.GridHelper(24, 24, 0x475569, 0x1e293b));

const wander = { x: 0, z: 0, lastRot: Math.PI };
const keys = { w: false, a: false, s: false, d: false };
const keysGun = { i: false, j: false, k: false, o: false };
const keysGun2 = { c: false, v: false, b: false, n: false };
let aplicandoRemoto = false;
/** Solo astronauta (WASD). @type {THREE.Group | null} */
let astroRoot = null;
/** Arma 1 (IJKO); no es hija del astronauta. @type {THREE.Object3D | null} */
let gunRoot = null;
/** Arma 2 (CVBN). @type {THREE.Object3D | null} */
let gun2Root = null;

function applyAstroBlue(obj) {
  const base = new THREE.Color(0x2f6fe0);
  obj.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((M) => {
      if (!M) return;
      M.color.copy(base);
      if ("emissive" in M && M.emissive) {
        M.emissive.copy(base).multiplyScalar(0.22);
      } else if ("emissive" in M) {
        M.emissive = base.clone().multiplyScalar(0.2);
      }
      if (typeof M.emissiveIntensity === "number") {
        M.emissiveIntensity = Math.max(M.emissiveIntensity, 0.22);
      }
      if (typeof M.metalness === "number") M.metalness = Math.max(0, Math.max(M.metalness, 0.12));
      if (typeof M.roughness === "number") {
        M.roughness = Math.min(0.82, M.roughness < 0.3 ? 0.72 : M.roughness);
      }
      M.needsUpdate = true;
    });
  });
}

function prepTex(t) {
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.flipY = true;
  return t;
}

function applyTextureBlueSuit(obj, texture) {
  obj.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((M) => {
      if (!M) return;
      M.map = texture;
      M.color.setHex(0xffffff);
      M.needsUpdate = true;
    });
  });
}

/** Igual que multijugador: escala pequeña + pies en Y=0. */
function prepAstroComoArena(astro) {
  astro.scale.setScalar(ASTRO_SCALE);
  astro.rotation.set(0, Math.PI, 0);
  astro.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(astro);
  const c = b.getCenter(new THREE.Vector3());
  astro.position.set(-c.x, -b.min.y, -c.z);
}

function configureGunMaterials(object, texture) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => {
        const next = material || new THREE.MeshStandardMaterial({ color: 0xffffff });
        if (texture) next.map = texture;
        next.color.setHex(0xffffff);
        next.needsUpdate = true;
        return next;
      });
      return;
    }
    if (!child.material) child.material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    if (texture) child.material.map = texture;
    child.material.color.setHex(0xffffff);
    child.material.needsUpdate = true;
  });
}

function pathsFor(rel) {
  return MODEL_BASES.map((base) => base + rel);
}

function loadTextureFirst(urls, onLoad, onFail) {
  let i = 0;
  const txL = new THREE.TextureLoader();
  function next() {
    if (i >= urls.length) {
      if (onFail) onFail();
      return;
    }
    txL.load(
      urls[i++],
      (t) => onLoad(t),
      undefined,
      next
    );
  }
  next();
}

function loadFbxFirst(urls, onLoad, onFail) {
  let i = 0;
  const fbxL = new FBXLoader();
  function next() {
    if (i >= urls.length) {
      if (onFail) onFail();
      return;
    }
    fbxL.load(
      urls[i++],
      (m) => onLoad(m),
      undefined,
      next
    );
  }
  next();
}

function sendPose() {
  if (aplicandoRemoto || !astroRoot) return;
  const msg = {
    tipo: "modelo",
    pos: astroRoot.position.toArray(),
    rotY: astroRoot.rotation.y
  };
  if (gunRoot) {
    msg.gunWorld = { x: gunWorld.x, y: gunWorld.y, z: gunWorld.z };
  }
  if (gun2Root) {
    msg.gun2World = { x: gun2World.x, y: gun2World.y, z: gun2World.z };
  }
  enviarVista(msg);
}

function manejarRemoto(d) {
  if (!d) return;
  if (d.tipo === "pedirSync") {
    sendPose();
    return;
  }
  if (d.tipo !== "modelo" || !astroRoot) return;
  const pos = d.pos;
  const rotY = d.rotY;
  if (!Array.isArray(pos) || pos.length < 3 || typeof rotY !== "number" || !isFinite(rotY)) {
    return;
  }
  aplicandoRemoto = true;
  astroRoot.position.set(pos[0], pos[1], pos[2]);
  astroRoot.rotation.y = rotY;
  wander.x = pos[0];
  wander.z = pos[2];
  wander.lastRot = rotY;
  const gw = d.gunWorld;
  if (gw && typeof gw === "object" && gunRoot) {
    if (typeof gw.x === "number" && isFinite(gw.x)) gunWorld.x = gw.x;
    if (typeof gw.y === "number" && isFinite(gw.y)) gunWorld.y = gw.y;
    if (typeof gw.z === "number" && isFinite(gw.z)) gunWorld.z = gw.z;
    gunRoot.position.set(gunWorld.x, gunWorld.y, gunWorld.z);
  }
  const g2 = d.gun2World;
  if (g2 && typeof g2 === "object" && gun2Root) {
    if (typeof g2.x === "number" && isFinite(g2.x)) gun2World.x = g2.x;
    if (typeof g2.y === "number" && isFinite(g2.y)) gun2World.y = g2.y;
    if (typeof g2.z === "number" && isFinite(g2.z)) gun2World.z = g2.z;
    gun2Root.position.set(gun2World.x, gun2World.y, gun2World.z);
  }
  aplicandoRemoto = false;
}

function bindKeys() {
  window.addEventListener(
    "keydown",
    (e) => {
      const c = e.code;
      if (c === "KeyW" || c === "ArrowUp") {
        keys.w = true;
        e.preventDefault();
      }
      if (c === "KeyS" || c === "ArrowDown") {
        keys.s = true;
        e.preventDefault();
      }
      if (c === "KeyA" || c === "ArrowLeft") {
        keys.a = true;
        e.preventDefault();
      }
      if (c === "KeyD" || c === "ArrowRight") {
        keys.d = true;
        e.preventDefault();
      }
      if (c === "KeyI") {
        keysGun.i = true;
        e.preventDefault();
      }
      if (c === "KeyJ") {
        keysGun.j = true;
        e.preventDefault();
      }
      if (c === "KeyK") {
        keysGun.k = true;
        e.preventDefault();
      }
      if (c === "KeyO") {
        keysGun.o = true;
        e.preventDefault();
      }
      if (c === "KeyC") {
        keysGun2.c = true;
        e.preventDefault();
      }
      if (c === "KeyV") {
        keysGun2.v = true;
        e.preventDefault();
      }
      if (c === "KeyB") {
        keysGun2.b = true;
        e.preventDefault();
      }
      if (c === "KeyN") {
        keysGun2.n = true;
        e.preventDefault();
      }
    },
    true
  );
  window.addEventListener(
    "keyup",
    (e) => {
      const c = e.code;
      if (c === "KeyW" || c === "ArrowUp") keys.w = false;
      if (c === "KeyS" || c === "ArrowDown") keys.s = false;
      if (c === "KeyA" || c === "ArrowLeft") keys.a = false;
      if (c === "KeyD" || c === "ArrowRight") keys.d = false;
      if (c === "KeyI") keysGun.i = false;
      if (c === "KeyJ") keysGun.j = false;
      if (c === "KeyK") keysGun.k = false;
      if (c === "KeyO") keysGun.o = false;
      if (c === "KeyC") keysGun2.c = false;
      if (c === "KeyV") keysGun2.v = false;
      if (c === "KeyB") keysGun2.b = false;
      if (c === "KeyN") keysGun2.n = false;
    },
    true
  );
  window.addEventListener("blur", () => {
    keys.w = keys.a = keys.s = keys.d = false;
    keysGun.i = keysGun.j = keysGun.k = keysGun.o = false;
    keysGun2.c = keysGun2.v = keysGun2.b = keysGun2.n = false;
  });
}

function tickMovement() {
  if (!astroRoot) return;
  let mx = 0;
  let mz = 0;
  if (keys.w) mz -= 1;
  if (keys.s) mz += 1;
  if (keys.a) mx -= 1;
  if (keys.d) mx += 1;
  const l = Math.hypot(mx, mz) || 1;
  mx /= l;
  mz /= l;
  const sp = 0.075;
  if (mx || mz) {
    wander.x = Math.max(-ASTRO_BORDE, Math.min(ASTRO_BORDE, wander.x + mx * sp));
    wander.z = Math.max(-ASTRO_BORDE, Math.min(ASTRO_BORDE, wander.z + mz * sp));
    wander.lastRot = Math.atan2(mx, mz) + Math.PI;
  }
  astroRoot.position.x = wander.x;
  astroRoot.position.z = wander.z;
  astroRoot.rotation.y = wander.lastRot;
  const t = performance.now() * 0.001;
  astroRoot.position.y = 0.02 * Math.sin(t * 1.12);

  const p = astroRoot.position;
  const r = astroRoot.rotation.y;
  const tx = p.x - Math.sin(r) * camSegui.dist;
  const ty = p.y + camSegui.alto;
  const tz = p.z - Math.cos(r) * camSegui.dist;
  const s = camSegui.suav;
  camera.position.x += (tx - camera.position.x) * s;
  camera.position.y += (ty - camera.position.y) * s;
  camera.position.z += (tz - camera.position.z) * s;
  camera.lookAt(p.x, p.y + 0.55, p.z);

  if (gunRoot) {
    if (!aplicandoRemoto) {
      if (keysGun.i) gunWorld.z -= GUN_NUDGE;
      if (keysGun.k) gunWorld.z += GUN_NUDGE;
      if (keysGun.j) gunWorld.x -= GUN_NUDGE;
      if (keysGun.o) gunWorld.x += GUN_NUDGE;
    }
    gunWorld.x = Math.max(-GUN_ARENA, Math.min(GUN_ARENA, gunWorld.x));
    gunWorld.z = Math.max(-GUN_ARENA, Math.min(GUN_ARENA, gunWorld.z));
    gunWorld.y = Math.max(0.15, Math.min(2.2, gunWorld.y));

    const bobY = Math.cos(t * 8) * 0.008;
    gunRoot.rotation.z = -0.22 + Math.sin(t * 8) * 0.02;
    gunRoot.position.set(gunWorld.x, gunWorld.y + bobY, gunWorld.z);
  }

  if (gun2Root) {
    if (!aplicandoRemoto) {
      if (keysGun2.v) gun2World.z -= GUN_NUDGE;
      if (keysGun2.b) gun2World.z += GUN_NUDGE;
      if (keysGun2.c) gun2World.x -= GUN_NUDGE;
      if (keysGun2.n) gun2World.x += GUN_NUDGE;
    }
    gun2World.x = Math.max(-GUN_ARENA, Math.min(GUN_ARENA, gun2World.x));
    gun2World.z = Math.max(-GUN_ARENA, Math.min(GUN_ARENA, gun2World.z));
    gun2World.y = Math.max(0.15, Math.min(2.2, gun2World.y));

    const bob2 = Math.cos(t * 8 + 1.1) * 0.008;
    gun2Root.rotation.z = -0.22 + Math.sin(t * 8 + 1.1) * 0.02;
    gun2Root.position.set(gun2World.x, gun2World.y + bob2, gun2World.z);
  }

  if (!aplicandoRemoto) {
    sendPose();
  }
}

function animate() {
  requestAnimationFrame(animate);
  tickMovement();
  renderer.render(scene, camera);
}

let astroColocado = false;

function tryAstroPng(pi, obj, group) {
  if (pi >= PNG_URLS.length) {
    applyAstroBlue(obj);
    prepAstroComoArena(obj);
    loadGunAndFinish(group);
    return;
  }
  const txL = new THREE.TextureLoader();
  txL.load(
    PNG_URLS[pi],
    (tex) => {
      applyTextureBlueSuit(obj, prepTex(tex));
      prepAstroComoArena(obj);
      loadGunAndFinish(group);
    },
    undefined,
    () => tryAstroPng(pi + 1, obj, group)
  );
}

function setupGunMesh(gun, gunTex) {
  configureGunMaterials(gun, gunTex);
  gun.scale.setScalar(0.014 * WORLD_GROUP_SCALE);
  gun.rotation.set(0.08, Math.PI / 2, -0.22);
  gun.name = "weapon-model";
  gun.position.set(gunWorld.x, gunWorld.y, gunWorld.z);
}

function loadGun2AndPlace(astroGroup, gun1) {
  loadTextureFirst(
    pathsFor("gun2/gun2.png"),
    (gunTex) => {
      prepTex(gunTex);
      loadFbxFirst(
        pathsFor("gun2/gun2.fbx"),
        (gun2) => {
          setupGunMesh(gun2, gunTex);
          gun2.name = "weapon-gun2";
          placeInScene(astroGroup, gun1, gun2);
        },
        () => placeInScene(astroGroup, gun1, null)
      );
    },
    () => {
      loadFbxFirst(
        pathsFor("gun2/gun2.fbx"),
        (gun2) => {
          setupGunMesh(gun2, null);
          gun2.name = "weapon-gun2";
          placeInScene(astroGroup, gun1, gun2);
        },
        () => placeInScene(astroGroup, gun1, null)
      );
    }
  );
}

function loadGunAndFinish(astroGroup) {
  loadTextureFirst(
    pathsFor("gun1/gun1.png"),
    (gunTex) => {
      prepTex(gunTex);
      loadFbxFirst(
        pathsFor("gun1/gun1.fbx"),
        (gun) => {
          setupGunMesh(gun, gunTex);
          gun.name = "weapon-gun1";
          loadGun2AndPlace(astroGroup, gun);
        },
        () => loadGun2AndPlace(astroGroup, null)
      );
    },
    () => {
      loadFbxFirst(
        pathsFor("gun1/gun1.fbx"),
        (gun) => {
          setupGunMesh(gun, null);
          gun.name = "weapon-gun1";
          loadGun2AndPlace(astroGroup, gun);
        },
        () => loadGun2AndPlace(astroGroup, null)
      );
    }
  );
}

function loadFbxWithFallback(index) {
  if (index >= FBX_URLS.length) {
    setStatus("No se encontró el FBX del astronauta (assets/models/astro/).", false);
    return;
  }
  const url = FBX_URLS[index];
  const loader = new FBXLoader();
  setStatus("Cargando astronauta y armas (gun1, gun2)…", null);
  loader.load(
    url,
    (obj) => {
      const group = new THREE.Group();
      group.name = "astro-sync-root";
      obj.name = "astro-mesh";
      group.add(obj);
      tryAstroPng(0, obj, group);
    },
    undefined,
    () => loadFbxWithFallback(index + 1)
  );
}

function placeInScene(astroGroup, gun, gun2) {
  if (astroColocado) return;
  astroColocado = true;
  astroGroup.scale.setScalar(WORLD_GROUP_SCALE);
  scene.add(astroGroup);
  astroRoot = astroGroup;
  if (gun) {
    gunRoot = gun;
    scene.add(gun);
    gun.position.set(gunWorld.x, gunWorld.y, gunWorld.z);
  }
  if (gun2) {
    gun2Root = gun2;
    scene.add(gun2);
    gun2.position.set(gun2World.x, gun2World.y, gun2World.z);
  }
  setStatus("Listo. WASD · IJKO (arma 1) · CVBN (arma 2) · sync.", true);
  queueMicrotask(() => {
    enviarVista({ tipo: "pedirSync" });
    if (getVentanaId() !== "2") {
      sendPose();
    }
  });
}

bindKeys();
if (canvas) {
  canvas.addEventListener("click", () => canvas.focus({ preventScroll: true }));
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();

loadFbxWithFallback(0);

iniciarVistaSync()
  .then(() => {
    window.__PINTAGOL_VISTA_TRANSPORT__ = getTransportLabel;
    onVistaMessage(manejarRemoto);
    setVistaEstadoElement(document.getElementById("estado-red"));
    enviarVista({ tipo: "pedirSync" });
  })
  .catch((e) => {
    console.error(e);
  });

const btn = document.getElementById("astro-btn-ventana");
if (btn) {
  btn.addEventListener("click", () => {
    const u = new URL(window.location.href);
    u.searchParams.set("ventana", "2");
    window.open(u.toString(), "grafrixAstroSync", "noopener,noreferrer,width=980,height=760");
  });
}
