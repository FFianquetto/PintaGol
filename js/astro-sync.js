import * as THREE from "three";
import {
  iniciarVistaSync,
  enviarVista,
  onVistaMessage,
  setVistaEstadoElement,
  getVentanaId,
  getTransportLabel
} from "./modelo-vista-sync.js";
import {
  applyAstroNeutral,
  prepTex,
  applyTextureToAstro,
  prepAstroComoArena,
  setupGunMesh,
  loadTextureFirst,
  loadFbxFirst
} from "./astro-sync-assets.js";
import {
  gunSetupOptions,
  applyGun2Input,
  clampGun2LocalOffset,
  applyGun2LocalTransform,
  applyGun2RemoteTransform
} from "./astro-sync-gun.js";

const FBX_URLS = ["assets/models/astro/astronout.fbx", "/assets/models/astro/astronout.fbx"];
const PNG_URLS = ["assets/models/astro/astronout.jpg", "/assets/models/astro/astronout.jpg"];

/** Mismas bases que multijugador (assets.js) para encontrar gun1 / gun2. */
const MODEL_BASES = ["assets/models/", "/assets/models/", "../assets/models/"];

const ASTRO_BORDE = 18;
/** Cámara alejada y alta para ver cuerpo + arma sin “zoom” excesivo. */
const camSegui = { dist: 8.4, alto: 5.95, suav: 0.2 };
const camZoom = {
  minDist: 4.5,
  maxDist: 13.5,
  targetDist: 8.4,
  wheelStep: 0.0022
};
const mouseLook = {
  targetYaw: 0,
  pitch: 0.08,
  sensitivity: 0.0022,
  pitchMin: -0.5,
  pitchMax: 0.2
};
/** Escala base del mesh (Arena); el grupo se encoge con WORLD_GROUP_SCALE. */
const ASTRO_SCALE = 0.018;
/** Encoge el astronauta (el arma usa la misma escala visual). */
const WORLD_GROUP_SCALE = 0.52;

/** Offset local del arma 2 respecto al astronauta (CVBN). */
const gun2World = { x: -0.55, y: 2.99, z: 1.8 };
const GUN_NUDGE = 0.028;
const GUN_ARENA = 4.2;
const GUN2_SCALE = 0.008;
const GUN2_ROTATION = { rotationX: Math.PI / 4.5, rotationY: -1.8, rotationZ: 0 };

const PLAYER_SPAWNS = [
  { x: -18, z: -18, yaw: Math.PI / 4 },
  { x: 18, z: -18, yaw: (3 * Math.PI) / 4 },
  { x: -18, z: 18, yaw: -Math.PI / 4 },
  { x: 18, z: 18, yaw: (-3 * Math.PI) / 4 }
];

const canvas = document.getElementById("astro-canvas");
const statusEl = document.getElementById("astro-status");
const playerNameHud = document.getElementById("astro-player-name");
const ACTIVE_MATCH_KEY = "pintagol_active_match";
const LOCAL_PLAYER_ID_KEY = "astro_sync_player_id";

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

function resolveLocalPlayerId() {
  try {
    const saved = window.sessionStorage.getItem(LOCAL_PLAYER_ID_KEY);
    if (saved && saved.trim()) return saved.trim();
  } catch (_) {
    /* ignorar */
  }
  const fromName = resolveLocalPlayerName();
  const base = fromName ? fromName.replace(/\s+/g, "_") : "jugador";
  const generated = `${base}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  try {
    window.sessionStorage.setItem(LOCAL_PLAYER_ID_KEY, generated);
  } catch (_) {
    /* ignorar */
  }
  return generated;
}

const LOCAL_PLAYER_ID = resolveLocalPlayerId();
const LOCAL_PLAYER_NAME = resolveLocalPlayerName();
const LOCAL_PLAYER_LABEL = LOCAL_PLAYER_NAME || "Jugador";

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
scene.add(new THREE.GridHelper(140, 140, 0x475569, 0x1e293b));

const wander = { x: 0, z: 0, lastRot: 0 };
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
const remotePlayers = new Map();
const remotePlayersLoading = new Set();

function shortestAngleDelta(from, to) {
  const TAU = Math.PI * 2;
  let d = (to - from + Math.PI) % TAU;
  if (d < 0) d += TAU;
  return d - Math.PI;
}

function compactPlayerId(id) {
  if (!id || typeof id !== "string") return "Jugador";
  return id.length > 10 ? id.slice(0, 10) : id;
}

function spawnIndexFromPlayerId(playerId) {
  let hash = 0;
  for (let i = 0; i < playerId.length; i += 1) {
    hash = (hash * 33 + playerId.charCodeAt(i)) >>> 0;
  }
  return hash % PLAYER_SPAWNS.length;
}

function spawnForPlayer(playerId) {
  return PLAYER_SPAWNS[spawnIndexFromPlayerId(playerId)] || PLAYER_SPAWNS[0];
}

function createNameTagSprite(labelText) {
  const canvasTag = document.createElement("canvas");
  canvasTag.width = 512;
  canvasTag.height = 128;
  const ctx = canvasTag.getContext("2d");
  if (!ctx) return null;

  const text = (labelText && labelText.trim()) || "Jugador";
  ctx.clearRect(0, 0, canvasTag.width, canvasTag.height);
  ctx.fillStyle = "rgba(15, 23, 42, 0.86)";
  ctx.fillRect(0, 20, canvasTag.width, 88);
  ctx.strokeStyle = "rgba(148, 163, 184, 0.8)";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 22, canvasTag.width - 4, 84);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "700 56px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvasTag.width / 2, canvasTag.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvasTag);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.name = "astro-gametag";
  sprite.position.set(0, 7.50, 0);
  sprite.scale.set(4.5, 1.4, 1);
  return sprite;
}

function updateNameTag(playerGroup, labelText) {
  if (!playerGroup) return;
  const prev = playerGroup.getObjectByName("astro-gametag");
  if (prev) {
    if (prev.material?.map) prev.material.map.dispose?.();
    prev.material?.dispose?.();
    playerGroup.remove(prev);
  }
  const sprite = createNameTagSprite(labelText);
  if (sprite) playerGroup.add(sprite);
}

function pathsFor(rel) {
  return MODEL_BASES.map((base) => base + rel);
}

function sendPose() {
  if (aplicandoRemoto || !astroRoot) return;
  const msg = {
    tipo: "modelo",
    playerId: LOCAL_PLAYER_ID,
    playerName: LOCAL_PLAYER_NAME,
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
    if (!d.playerId || d.playerId !== LOCAL_PLAYER_ID) sendPose();
    return;
  }
  if (d.tipo !== "modelo" || !d.playerId || typeof d.playerId !== "string") return;
  if (d.playerId === LOCAL_PLAYER_ID) return;
  const pos = d.pos;
  const rotY = d.rotY;
  if (!Array.isArray(pos) || pos.length < 3 || typeof rotY !== "number" || !isFinite(rotY)) {
    return;
  }
  const rp = remotePlayers.get(d.playerId);
  if (rp) {
    rp.targetPos.set(pos[0], pos[1], pos[2]);
    rp.targetRotY = rotY;
    const g2 = d.gun2World;
    if (g2 && typeof g2 === "object") {
      if (typeof g2.x === "number" && isFinite(g2.x)) rp.gun2World.x = g2.x;
      if (typeof g2.y === "number" && isFinite(g2.y)) rp.gun2World.y = g2.y;
      if (typeof g2.z === "number" && isFinite(g2.z)) rp.gun2World.z = g2.z;
    }
    if (d.playerName && d.playerName !== rp.playerName) {
      rp.playerName = d.playerName;
      updateNameTag(rp.group, d.playerName);
    }
    return;
  }
  if (remotePlayersLoading.has(d.playerId)) return;
  remotePlayersLoading.add(d.playerId);
  spawnRemotePlayer(d.playerId, pos, rotY, d.playerName, d.gun2World);
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

function bindMouseLook() {
  if (!canvas) return;
  canvas.addEventListener("click", () => {
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
    canvas.focus({ preventScroll: true });
  });
  window.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas) return;
    mouseLook.targetYaw -= e.movementX * mouseLook.sensitivity;
    mouseLook.pitch -= e.movementY * mouseLook.sensitivity;
    mouseLook.pitch = Math.max(mouseLook.pitchMin, Math.min(mouseLook.pitchMax, mouseLook.pitch));
  });
  window.addEventListener(
    "wheel",
    (e) => {
      const next = camZoom.targetDist + e.deltaY * camZoom.wheelStep;
      camZoom.targetDist = Math.max(camZoom.minDist, Math.min(camZoom.maxDist, next));
      e.preventDefault();
    },
    { passive: false }
  );
}

function tickMovement() {
  if (!astroRoot) return;
  let forward = 0;
  let strafe = 0;
  if (keys.w) forward += 1;
  if (keys.s) forward -= 1;
  if (keys.d) strafe += 1;
  if (keys.a) strafe -= 1;

  const yawStep = shortestAngleDelta(astroRoot.rotation.y, mouseLook.targetYaw);
  astroRoot.rotation.y += yawStep * 0.22;
  wander.lastRot = astroRoot.rotation.y;

  let mx = Math.sin(astroRoot.rotation.y) * forward + -Math.cos(astroRoot.rotation.y) * strafe;
  let mz = Math.cos(astroRoot.rotation.y) * forward + Math.sin(astroRoot.rotation.y) * strafe;
  const l = Math.hypot(mx, mz) || 1;
  mx /= l;
  mz /= l;
  const sp = 0.075;
  if (mx || mz) {
    wander.x = Math.max(-ASTRO_BORDE, Math.min(ASTRO_BORDE, wander.x + mx * sp));
    wander.z = Math.max(-ASTRO_BORDE, Math.min(ASTRO_BORDE, wander.z + mz * sp));
  }
  astroRoot.position.x = wander.x;
  astroRoot.position.z = wander.z;
  const t = performance.now() * 0.001;
  astroRoot.position.y = 0.02 * Math.sin(t * 1.12);

  const p = astroRoot.position;
  const r = astroRoot.rotation.y;
  camSegui.dist += (camZoom.targetDist - camSegui.dist) * 0.18;
  const distPlano = camSegui.dist * Math.cos(mouseLook.pitch);
  const tx = p.x - Math.sin(r) * distPlano;
  const ty = p.y + camSegui.alto + camSegui.dist * Math.sin(mouseLook.pitch);
  const tz = p.z - Math.cos(r) * distPlano;
  const s = camSegui.suav;
  camera.position.x += (tx - camera.position.x) * s;
  camera.position.y += (ty - camera.position.y) * s;
  camera.position.z += (tz - camera.position.z) * s;
  camera.lookAt(p.x, p.y + 1.15, p.z);

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
      applyGun2Input(gun2World, keysGun2, GUN_NUDGE);
    }
    clampGun2LocalOffset(gun2World);
    applyGun2LocalTransform(gun2Root, gun2World, t, GUN2_ROTATION);
  }

  if (!aplicandoRemoto) {
    sendPose();
  }

  remotePlayers.forEach((rp) => {
    if (!rp.group) return;
    rp.group.position.lerp(rp.targetPos, 0.2);
    const dYaw = shortestAngleDelta(rp.group.rotation.y, rp.targetRotY);
    rp.group.rotation.y += dYaw * 0.2;
    applyGun2RemoteTransform(rp.gun2Root, rp.gun2World, t, GUN2_ROTATION);
  });
}

function animate() {
  requestAnimationFrame(animate);
  tickMovement();
  renderer.render(scene, camera);
}

let astroColocado = false;

function tryAstroPng(pi, obj, group) {
  if (pi >= PNG_URLS.length) {
    applyAstroNeutral(obj);
    prepAstroComoArena(obj, ASTRO_SCALE);
    loadGunAndFinish(group);
    return;
  }
  const txL = new THREE.TextureLoader();
  txL.load(
    PNG_URLS[pi],
    (tex) => {
      applyTextureToAstro(obj, prepTex(tex, aniso));
      prepAstroComoArena(obj, ASTRO_SCALE);
      loadGunAndFinish(group);
    },
    undefined,
    () => tryAstroPng(pi + 1, obj, group)
  );
}

function loadGun2AndPlace(astroGroup, gun1) {
  loadTextureFirst(
    pathsFor("gun2/gun2.png"),
    (gunTex) => {
      prepTex(gunTex, aniso);
      loadFbxFirst(
        pathsFor("gun2/gun2.fbx"),
        (gun2) => {
          setupGunMesh(gun2, gunTex, WORLD_GROUP_SCALE, gun2World, gunSetupOptions(GUN2_SCALE, GUN2_ROTATION));
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
          setupGunMesh(gun2, null, WORLD_GROUP_SCALE, gun2World, gunSetupOptions(GUN2_SCALE, GUN2_ROTATION));
          gun2.name = "weapon-gun2";
          placeInScene(astroGroup, gun1, gun2);
        },
        () => placeInScene(astroGroup, gun1, null)
      );
    }
  );
}

function loadGunAndFinish(astroGroup) {
  loadGun2AndPlace(astroGroup, null);
}

function tryRemoteAstroPng(pi, obj, onDone) {
  if (pi >= PNG_URLS.length) {
    applyAstroNeutral(obj);
    prepAstroComoArena(obj, ASTRO_SCALE);
    onDone();
    return;
  }
  const txL = new THREE.TextureLoader();
  txL.load(
    PNG_URLS[pi],
    (tex) => {
      applyTextureToAstro(obj, prepTex(tex, aniso));
      prepAstroComoArena(obj, ASTRO_SCALE);
      onDone();
    },
    undefined,
    () => tryRemoteAstroPng(pi + 1, obj, onDone)
  );
}

function loadRemoteGun2(playerId, gun2Start) {
  const rp = remotePlayers.get(playerId);
  if (!rp) return;
  loadTextureFirst(
    pathsFor("gun2/gun2.png"),
    (gunTex) => {
      prepTex(gunTex, aniso);
      loadFbxFirst(
        pathsFor("gun2/gun2.fbx"),
        (gun2) => {
          const start = gun2Start || rp.gun2World;
          setupGunMesh(gun2, gunTex, WORLD_GROUP_SCALE, start, gunSetupOptions(GUN2_SCALE, GUN2_ROTATION));
          gun2.name = `weapon-gun2-${playerId}`;
          rp.group.add(gun2);
          rp.gun2Root = gun2;
        },
        () => {
          /* no-op */
        }
      );
    },
    () => {
      loadFbxFirst(
        pathsFor("gun2/gun2.fbx"),
        (gun2) => {
          const start = gun2Start || rp.gun2World;
          setupGunMesh(gun2, null, WORLD_GROUP_SCALE, start, gunSetupOptions(GUN2_SCALE, GUN2_ROTATION));
          gun2.name = `weapon-gun2-${playerId}`;
          rp.group.add(gun2);
          rp.gun2Root = gun2;
        },
        () => {
          /* no-op */
        }
      );
    }
  );
}

function spawnRemotePlayer(playerId, pos, rotY, playerName, gun2Remote) {
  const remoteGun2 = {
    x: typeof gun2Remote?.x === "number" && isFinite(gun2Remote.x) ? gun2Remote.x : gun2World.x,
    y: typeof gun2Remote?.y === "number" && isFinite(gun2Remote.y) ? gun2Remote.y : gun2World.y,
    z: typeof gun2Remote?.z === "number" && isFinite(gun2Remote.z) ? gun2Remote.z : gun2World.z
  };
  loadFbxFirst(
    FBX_URLS,
    (obj) => {
      const group = new THREE.Group();
      group.name = `astro-remote-${playerId}`;
      obj.name = "astro-mesh-remote";
      group.add(obj);
      tryRemoteAstroPng(0, obj, () => {
        group.scale.setScalar(WORLD_GROUP_SCALE);
        group.position.set(pos[0], pos[1], pos[2]);
        group.rotation.y = rotY;
        updateNameTag(group, playerName || compactPlayerId(playerId));
        scene.add(group);
        remotePlayers.set(playerId, {
          group,
          gun2Root: null,
          gun2World: remoteGun2,
          playerName: playerName || compactPlayerId(playerId),
          targetPos: new THREE.Vector3(pos[0], pos[1], pos[2]),
          targetRotY: rotY
        });
        loadRemoteGun2(playerId, remoteGun2);
        remotePlayersLoading.delete(playerId);
      });
    },
    () => {
      remotePlayersLoading.delete(playerId);
    }
  );
}

function loadFbxWithFallback(index) {
  if (index >= FBX_URLS.length) {
    setStatus("No se encontró el FBX del astronauta (assets/models/astro/).", false);
    return;
  }
  const url = FBX_URLS[index];
  setStatus("Cargando astronauta y arma (gun2)…", null);
  loadFbxFirst(
    [url],
    (obj) => {
      const group = new THREE.Group();
      group.name = "astro-sync-root";
      obj.name = "astro-mesh";
      group.add(obj);
      tryAstroPng(0, obj, group);
    },
    () => loadFbxWithFallback(index + 1)
  );
}

function placeInScene(astroGroup, gun, gun2) {
  if (astroColocado) return;
  astroColocado = true;
  astroGroup.scale.setScalar(WORLD_GROUP_SCALE);
  scene.add(astroGroup);
  astroRoot = astroGroup;
  const mySpawn = spawnForPlayer(LOCAL_PLAYER_ID);
  wander.x = mySpawn.x;
  wander.z = mySpawn.z;
  wander.lastRot = mySpawn.yaw;
  mouseLook.targetYaw = mySpawn.yaw;
  astroRoot.position.x = mySpawn.x;
  astroRoot.position.z = mySpawn.z;
  astroRoot.rotation.y = mySpawn.yaw;
  updateNameTag(astroGroup, LOCAL_PLAYER_LABEL);
  if (gun) {
    gunRoot = gun;
    scene.add(gun);
    gun.position.set(gunWorld.x, gunWorld.y, gunWorld.z);
  }
  if (gun2) {
    gun2Root = gun2;
    astroGroup.add(gun2);
    gun2.position.set(gun2World.x, gun2World.y, gun2World.z);
  }
  setStatus("Listo. WASD mover · mouse rotar cámara/personaje · CVBN (arma 2) · sync.", true);
  queueMicrotask(() => {
    enviarVista({ tipo: "pedirSync", playerId: LOCAL_PLAYER_ID });
    if (getVentanaId() !== "2") {
      sendPose();
    }
  });
}

bindKeys();
bindMouseLook();
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
    enviarVista({ tipo: "pedirSync", playerId: LOCAL_PLAYER_ID });
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
