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
  setupBulletMesh,
  loadTextureFirst,
  loadFbxFirst,
  loadObjFirst
} from "./astro-sync-assets.js";
import {
  gunSetupOptions,
  applyGun2Input,
  clampGun2LocalOffset,
  applyGun2LocalTransform,
  applyGun2RemoteTransform
} from "./astro-sync-gun.js";
import { spawnBullet, spawnBulletAtPosition, updateBullets } from "./astro-sync-bullets.js";
import {
  resolveLocalPlayerName,
  resolveLocalPlayerId,
  showLocalPlayerName,
  compactPlayerId,
  spawnForPlayer
} from "./astro-sync-player.js";

const FBX_URLS = ["assets/models/astro/astronout.fbx", "/assets/models/astro/astronout.fbx"];
const PNG_URLS = ["assets/models/astro/astronout.jpg", "/assets/models/astro/astronout.jpg"];

/** Mismas bases que multijugador (assets.js) para encontrar modelos. */
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
const aimCamera = {
  dist: 0.95,
  alto: 2.05,
  lookAhead: 8.2,
  smooth: 0.28
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
const GUN2_SCALE = 0.008;
const GUN2_ROTATION = { rotationX: Math.PI / 4.5, rotationY: -1.8, rotationZ: 0 };
const BULLET_SCALE = 0.019;
const BULLET_SPEED = 28;
const BULLET_COOLDOWN_MS = 190;
const PLAYER_COLORS = [0x3b82f6, 0xffffff, 0x22c55e, 0xeab308];
const MAX_HITS = 20;
const STAIN_DURATION_MS = 5000;

const PLAYER_SPAWNS = [
  { x: -18, z: -18, yaw: Math.PI / 4 },
  { x: 18, z: -18, yaw: (3 * Math.PI) / 4 },
  { x: -18, z: 18, yaw: -Math.PI / 4 },
  { x: 18, z: 18, yaw: (-3 * Math.PI) / 4 }
];

const canvas = document.getElementById("astro-canvas");
const statusEl = document.getElementById("astro-status");
const playerNameHud = document.getElementById("astro-player-name");
const LOCAL_PLAYER_NAME = resolveLocalPlayerName();
const LOCAL_PLAYER_ID = resolveLocalPlayerId(LOCAL_PLAYER_NAME);
const LOCAL_PLAYER_LABEL = LOCAL_PLAYER_NAME || "Jugador";
let localPlayerColor = PLAYER_COLORS[0];

(function renderLocalPlayerNameHud() {
  showLocalPlayerName(playerNameHud, LOCAL_PLAYER_NAME);
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
const keysGun2 = { c: false, v: false, b: false, n: false };
let aplicandoRemoto = false;
let fireQueued = false;
let isAiming = false;
/** Solo astronauta (WASD). @type {THREE.Group | null} */
let astroRoot = null;
/** Arma 2 (CVBN). @type {THREE.Object3D | null} */
let gun2Root = null;
/** Plantilla del modelo de bala cargado desde assets/models/bullet. */
let bulletTemplate = null;
const activeBullets = [];
let lastShotAt = 0;
let localHits = 0;
let localDefeated = false;
let localDamageSeq = 0;
let localShotSeq = 0;
let localLastHitColorHex = 0xffffff;
const remotePlayers = new Map();
const remotePlayersLoading = new Set();
const seenRemoteShotIds = new Set();
const clock = new THREE.Clock();

function shortestAngleDelta(from, to) {
  const TAU = Math.PI * 2;
  let d = (to - from + Math.PI) % TAU;
  if (d < 0) d += TAU;
  return d - Math.PI;
}

function recomputePlayerColors() {
  const ids = [LOCAL_PLAYER_ID, ...Array.from(remotePlayers.keys())].sort();
  const assigned = new Map();
  ids.forEach((id, i) => {
    assigned.set(id, PLAYER_COLORS[i % PLAYER_COLORS.length]);
  });
  localPlayerColor = assigned.get(LOCAL_PLAYER_ID) ?? PLAYER_COLORS[0];
  if (astroRoot) {
    tintAstroWithPlayerColor(astroRoot, localPlayerColor);
  }
  remotePlayers.forEach((rp, playerId) => {
    const nextColor = assigned.get(playerId) ?? PLAYER_COLORS[0];
    rp.colorHex = nextColor;
    if (rp.group) tintAstroWithPlayerColor(rp.group, nextColor);
  });
}

function tintAstroWithPlayerColor(astroGroup, colorHex) {
  if (!astroGroup || colorHex == null) return;
  astroGroup.userData.baseColorHex = colorHex;
  if (!Array.isArray(astroGroup.userData.hitStains)) astroGroup.userData.hitStains = [];
  applyAstroCurrentTint(astroGroup, colorHex);
}

function applyAstroCurrentTint(astroGroup, colorHex) {
  if (!astroGroup || colorHex == null) return;
  const astroMesh = astroGroup.getObjectByName("astro-mesh") || astroGroup.getObjectByName("astro-mesh-remote");
  if (!astroMesh) return;
  astroMesh.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((material) => {
      if (!material) return;
      material.color.setHex(colorHex);
      material.needsUpdate = true;
    });
  });
}

function addHitStain(astroGroup, stainColorHex) {
  if (!astroGroup || stainColorHex == null) return;
  if (!Array.isArray(astroGroup.userData.hitStains)) astroGroup.userData.hitStains = [];
  astroGroup.userData.hitStains.push({
    colorHex: stainColorHex,
    until: performance.now() + STAIN_DURATION_MS
  });
}

function refreshAstronautStain(astroGroup, nowMs) {
  if (!astroGroup) return;
  const baseHex = astroGroup.userData.baseColorHex;
  if (baseHex == null) return;
  const stains = Array.isArray(astroGroup.userData.hitStains) ? astroGroup.userData.hitStains : [];
  const active = stains.filter((s) => s && typeof s.until === "number" && s.until > nowMs);
  astroGroup.userData.hitStains = active;
  if (!active.length) {
    applyAstroCurrentTint(astroGroup, baseHex);
    return;
  }
  const latest = active[active.length - 1];
  const weight = Math.min(0.78, 0.38 + active.length * 0.12);
  const mixed = new THREE.Color(baseHex).lerp(new THREE.Color(latest.colorHex), weight);
  applyAstroCurrentTint(astroGroup, mixed.getHex());
}

function setAimMode(active) {
  isAiming = !!active;
  if (!astroRoot) return;
  const astroMesh = astroRoot.getObjectByName("astro-mesh");
  if (astroMesh) astroMesh.visible = !isAiming;
}

function createNameTagSprite(labelText, hitRatio = 0) {
  const canvasTag = document.createElement("canvas");
  canvasTag.width = 512;
  canvasTag.height = 128;
  const ctx = canvasTag.getContext("2d");
  if (!ctx) return null;

  const text = (labelText && labelText.trim()) || "Jugador";
  ctx.clearRect(0, 0, canvasTag.width, canvasTag.height);
  const clamped = Math.max(0, Math.min(1, hitRatio));
  ctx.fillStyle = "rgba(15, 23, 42, 0.86)";
  ctx.fillRect(0, 20, canvasTag.width, 88);
  if (clamped > 0) {
    const fillW = Math.round((canvasTag.width - 8) * clamped);
    ctx.fillStyle = "rgba(220, 38, 38, 0.86)";
    ctx.fillRect(4, 24, fillW, 80);
  }
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

function updateNameTag(playerGroup, labelText, hitRatio = 0) {
  if (!playerGroup) return;
  const prev = playerGroup.getObjectByName("astro-gametag");
  if (prev) {
    if (prev.material?.map) prev.material.map.dispose?.();
    prev.material?.dispose?.();
    playerGroup.remove(prev);
  }
  const sprite = createNameTagSprite(labelText, hitRatio);
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
    rotY: astroRoot.rotation.y,
    hits: localHits,
    defeated: localDefeated,
    damageSeq: localDamageSeq,
    colorHex: localPlayerColor,
    lastHitColorHex: localLastHitColorHex
  };
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
  if (d.tipo === "shot") {
    handleRemoteShot(d);
    return;
  }
  if (d.tipo === "damage") {
    handleRemoteDamage(d);
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
    const incomingSeq = typeof d.damageSeq === "number" && isFinite(d.damageSeq) ? Math.floor(d.damageSeq) : null;
    const prevSeq = rp.damageSeq || 0;
    if (incomingSeq != null && incomingSeq >= prevSeq) {
      rp.damageSeq = incomingSeq;
      if (typeof d.hits === "number" && isFinite(d.hits)) {
        rp.hits = Math.max(0, Math.min(MAX_HITS, Math.floor(d.hits)));
      }
      if (typeof d.defeated === "boolean") {
        rp.defeated = d.defeated;
      }
      if (incomingSeq > prevSeq && typeof d.lastHitColorHex === "number") {
        addHitStain(rp.group, d.lastHitColorHex);
      }
    } else if (incomingSeq == null) {
      if (typeof d.hits === "number" && isFinite(d.hits)) {
        rp.hits = Math.max(0, Math.min(MAX_HITS, Math.floor(d.hits)));
      }
      if (typeof d.defeated === "boolean") {
        rp.defeated = d.defeated;
      }
    }
    updateNameTag(rp.group, rp.playerName || compactPlayerId(d.playerId), (rp.hits || 0) / MAX_HITS);
    if (d.playerName && d.playerName !== rp.playerName) {
      rp.playerName = d.playerName;
      updateNameTag(rp.group, d.playerName, rp.hits / MAX_HITS);
    }
    recomputePlayerColors();
    return;
  }
  if (remotePlayersLoading.has(d.playerId)) return;
  remotePlayersLoading.add(d.playerId);
  spawnRemotePlayer(d.playerId, d.playerName, d.gun2World, d.hits, d.defeated, d.damageSeq);
}

function handleRemoteShot(d) {
  if (!d || !d.playerId || d.playerId === LOCAL_PLAYER_ID || !bulletTemplate) return;
  if (typeof d.shotId === "string" && d.shotId) {
    if (seenRemoteShotIds.has(d.shotId)) return;
    seenRemoteShotIds.add(d.shotId);
    if (seenRemoteShotIds.size > 500) {
      const first = seenRemoteShotIds.values().next().value;
      if (first) seenRemoteShotIds.delete(first);
    }
  }
  if (!Array.isArray(d.pos) || d.pos.length < 3) return;
  if (!Array.isArray(d.dir) || d.dir.length < 3) return;
  const pos = new THREE.Vector3(d.pos[0], d.pos[1], d.pos[2]);
  const forward = new THREE.Vector3(d.dir[0], d.dir[1], d.dir[2]);
  if (forward.lengthSq() < 1e-6) return;
  const bullet = spawnBulletAtPosition({
    template: bulletTemplate,
    position: pos,
    speed: BULLET_SPEED,
    forward,
    colorHex: typeof d.colorHex === "number" ? d.colorHex : remotePlayers.get(d.playerId)?.colorHex ?? PLAYER_COLORS[0]
  });
  if (!bullet) return;
  bullet.userData.ownerId = d.playerId;
  scene.add(bullet);
  activeBullets.push(bullet);
}

function handleRemoteDamage(d) {
  if (!d || typeof d.playerId !== "string") return;
  const incomingSeq = typeof d.damageSeq === "number" && isFinite(d.damageSeq) ? Math.floor(d.damageSeq) : null;
  if (d.playerId === LOCAL_PLAYER_ID) {
    if (incomingSeq == null || incomingSeq <= localDamageSeq) return;
    localDamageSeq = incomingSeq;
    if (typeof d.hits === "number" && isFinite(d.hits)) {
      localHits = Math.max(0, Math.min(MAX_HITS, Math.floor(d.hits)));
    }
    if (typeof d.defeated === "boolean") localDefeated = d.defeated;
    if (typeof d.hitColorHex === "number" && astroRoot) addHitStain(astroRoot, d.hitColorHex);
    if (astroRoot) updateNameTag(astroRoot, LOCAL_PLAYER_LABEL, localHits / MAX_HITS);
    return;
  }
  const rp = remotePlayers.get(d.playerId);
  if (!rp || !rp.group) return;
  if (incomingSeq != null && incomingSeq < (rp.damageSeq || 0)) return;
  if (incomingSeq != null) rp.damageSeq = incomingSeq;
  const nextHits = typeof d.hits === "number" && isFinite(d.hits) ? Math.floor(d.hits) : rp.hits || 0;
  rp.hits = Math.max(0, Math.min(MAX_HITS, nextHits));
  if (typeof d.defeated === "boolean") rp.defeated = d.defeated;
  if (typeof d.hitColorHex === "number") addHitStain(rp.group, d.hitColorHex);
  updateNameTag(rp.group, rp.playerName || compactPlayerId(d.playerId), rp.hits / MAX_HITS);
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
      if (c === "KeyC") keysGun2.c = false;
      if (c === "KeyV") keysGun2.v = false;
      if (c === "KeyB") keysGun2.b = false;
      if (c === "KeyN") keysGun2.n = false;
    },
    true
  );
  window.addEventListener("blur", () => {
    keys.w = keys.a = keys.s = keys.d = false;
    keysGun2.c = keysGun2.v = keysGun2.b = keysGun2.n = false;
    fireQueued = false;
    setAimMode(false);
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
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      fireQueued = true;
      return;
    }
    if (e.button === 2) {
      setAimMode(true);
      e.preventDefault();
    }
  });
  canvas.addEventListener("mouseup", (e) => {
    if (e.button !== 2) return;
    setAimMode(false);
    e.preventDefault();
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button !== 2) return;
    setAimMode(false);
  });
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });
}

function shootIfReady(nowMs) {
  if (!fireQueued || !astroRoot || !bulletTemplate || localDefeated) return;
  if (nowMs - lastShotAt < BULLET_COOLDOWN_MS) return;
  const source = gun2Root || astroRoot;
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) return;
  forward.normalize();
  const bullet = spawnBullet({
    template: bulletTemplate,
    shooter: source,
    speed: BULLET_SPEED,
    forward,
    colorHex: localPlayerColor
  });
  if (!bullet) return;
  bullet.userData.ownerId = LOCAL_PLAYER_ID;
  scene.add(bullet);
  activeBullets.push(bullet);
  localShotSeq += 1;
  const shotId = `${LOCAL_PLAYER_ID}:${localShotSeq}`;
  enviarVista({
    tipo: "shot",
    playerId: LOCAL_PLAYER_ID,
    shotId,
    pos: bullet.position.toArray(),
    dir: forward.toArray(),
    colorHex: localPlayerColor
  });
  lastShotAt = nowMs;
  fireQueued = false;
}

function applyHitToLocalPlayer(hitColorHex = 0xffffff) {
  if (localDefeated || !astroRoot) return;
  localHits = Math.min(MAX_HITS, localHits + 1);
  localDamageSeq += 1;
  localLastHitColorHex = hitColorHex;
  updateNameTag(astroRoot, LOCAL_PLAYER_LABEL, localHits / MAX_HITS);
  if (localHits >= MAX_HITS) {
    localDefeated = true;
    setStatus("Has perdido: tu gametag se llenó de rojo (20 impactos).", false);
  }
}

function bulletHitsAstronaut(bulletPos, astroGroup) {
  if (!bulletPos || !astroGroup) return false;
  const g = astroGroup.position;
  // Colisión aproximada de cápsula: plano XZ + ventana vertical del torso.
  const dx = bulletPos.x - g.x;
  const dz = bulletPos.z - g.z;
  const horizontalHit = dx * dx + dz * dz <= 1.45 * 1.45;
  if (!horizontalHit) return false;
  const yMin = g.y + 0.25;
  const yMax = g.y + 3.45;
  return bulletPos.y >= yMin && bulletPos.y <= yMax;
}

function bulletSegmentHitsAstronaut(prevPos, currPos, astroGroup) {
  if (!prevPos || !currPos || !astroGroup) return false;
  if (bulletHitsAstronaut(currPos, astroGroup)) return true;
  // Muestreamos el trayecto para evitar perder impactos por "tunneling".
  const steps = 6;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const p = new THREE.Vector3().lerpVectors(prevPos, currPos, t);
    if (bulletHitsAstronaut(p, astroGroup)) return true;
  }
  return false;
}

function processBulletHits() {
  if (!activeBullets.length) return;
  for (let i = activeBullets.length - 1; i >= 0; i -= 1) {
    const bullet = activeBullets[i];
    const ownerId = bullet?.userData?.ownerId;
    if (!bullet) continue;
    const prevPos = bullet.userData?.prevPos || bullet.position;
    const currPos = bullet.position;
    let consumed = false;
    if (astroRoot && ownerId !== LOCAL_PLAYER_ID) {
      if (bulletSegmentHitsAstronaut(prevPos, currPos, astroRoot)) {
        const hitColorHex = bullet.userData?.colorHex ?? 0xffffff;
        addHitStain(astroRoot, hitColorHex);
        applyHitToLocalPlayer(hitColorHex);
        sendPose();
        enviarVista({
          tipo: "damage",
          playerId: LOCAL_PLAYER_ID,
          hits: localHits,
          defeated: localDefeated,
          hitColorHex,
          damageSeq: localDamageSeq
        });
        consumed = true;
      }
    }
    if (consumed) {
      scene.remove(bullet);
      activeBullets.splice(i, 1);
    }
  }
}

function tickMovement(dt) {
  if (!astroRoot) return;
  let forward = 0;
  let strafe = 0;
  if (!localDefeated) {
    if (keys.w) forward += 1;
    if (keys.s) forward -= 1;
    if (keys.d) strafe += 1;
    if (keys.a) strafe -= 1;
  }

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
  const desiredDist = isAiming ? aimCamera.dist : camZoom.targetDist;
  camSegui.dist += (desiredDist - camSegui.dist) * 0.18;
  const cameraHeight = isAiming ? aimCamera.alto : camSegui.alto;
  const distPlano = camSegui.dist * Math.cos(mouseLook.pitch);
  const tx = p.x - Math.sin(r) * distPlano;
  const ty = p.y + cameraHeight + camSegui.dist * Math.sin(mouseLook.pitch);
  const tz = p.z - Math.cos(r) * distPlano;
  const s = isAiming ? aimCamera.smooth : camSegui.suav;
  camera.position.x += (tx - camera.position.x) * s;
  camera.position.y += (ty - camera.position.y) * s;
  camera.position.z += (tz - camera.position.z) * s;
  if (isAiming) {
    const lookX = p.x + Math.sin(r) * aimCamera.lookAhead;
    const lookY = p.y + 1.72;
    const lookZ = p.z + Math.cos(r) * aimCamera.lookAhead;
    camera.lookAt(lookX, lookY, lookZ);
  } else {
    camera.lookAt(p.x, p.y + 1.15, p.z);
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

  shootIfReady(performance.now());
  updateBullets(scene, activeBullets, dt);
  processBulletHits();
  const nowMs = performance.now();
  refreshAstronautStain(astroRoot, nowMs);

  remotePlayers.forEach((rp) => {
    if (!rp.group) return;
    rp.group.position.lerp(rp.targetPos, 0.2);
    const dYaw = shortestAngleDelta(rp.group.rotation.y, rp.targetRotY);
    rp.group.rotation.y += dYaw * 0.2;
    applyGun2RemoteTransform(rp.gun2Root, rp.gun2World, t, GUN2_ROTATION);
    refreshAstronautStain(rp.group, nowMs);
  });
}

function animate() {
  requestAnimationFrame(animate);
  tickMovement(clock.getDelta());
  renderer.render(scene, camera);
}

let astroColocado = false;

function tryAstroPng(pi, obj, group) {
  if (pi >= PNG_URLS.length) {
    applyAstroNeutral(obj);
    prepAstroComoArena(obj, ASTRO_SCALE);
    loadLocalModelsAndFinish(group);
    return;
  }
  const txL = new THREE.TextureLoader();
  txL.load(
    PNG_URLS[pi],
    (tex) => {
      applyTextureToAstro(obj, prepTex(tex, aniso));
      prepAstroComoArena(obj, ASTRO_SCALE);
      loadLocalModelsAndFinish(group);
    },
    undefined,
    () => tryAstroPng(pi + 1, obj, group)
  );
}

function loadGun2AndPlace(astroGroup) {
  loadTextureFirst(
    pathsFor("gun2/gun2.png"),
    (gunTex) => {
      prepTex(gunTex, aniso);
      loadFbxFirst(
        pathsFor("gun2/gun2.fbx"),
        (gun2) => {
          setupGunMesh(gun2, gunTex, WORLD_GROUP_SCALE, gun2World, gunSetupOptions(GUN2_SCALE, GUN2_ROTATION));
          gun2.name = "weapon-gun2";
          placeInScene(astroGroup, gun2);
        },
        () => placeInScene(astroGroup, null)
      );
    },
    () => {
      loadFbxFirst(
        pathsFor("gun2/gun2.fbx"),
        (gun2) => {
          setupGunMesh(gun2, null, WORLD_GROUP_SCALE, gun2World, gunSetupOptions(GUN2_SCALE, GUN2_ROTATION));
          gun2.name = "weapon-gun2";
          placeInScene(astroGroup, gun2);
        },
        () => placeInScene(astroGroup, null)
      );
    }
  );
}

function loadLocalModelsAndFinish(astroGroup) {
  loadBulletTemplate();
  loadGun2AndPlace(astroGroup);
}

function loadBulletTemplate() {
  loadObjFirst(
    pathsFor("bullet/shareablebullet.obj"),
    (bulletObj) => {
      // Bala blanca: no usamos mapa de textura para mantener color sólido.
      setupBulletMesh(bulletObj, null, WORLD_GROUP_SCALE, { scale: BULLET_SCALE });
      bulletObj.name = "bullet-template";
      bulletTemplate = bulletObj;
    },
    () => {
      bulletTemplate = null;
    }
  );
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

function spawnRemotePlayer(
  playerId,
  playerName,
  gun2Remote,
  remoteHits = 0,
  remoteDefeated = false,
  remoteDamageSeq = 0
) {
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
        const fixedSpawn = spawnForPlayer(playerId, PLAYER_SPAWNS);
        const playerColor = PLAYER_COLORS[0];
        group.scale.setScalar(WORLD_GROUP_SCALE);
        group.position.set(fixedSpawn.x, 0, fixedSpawn.z);
        group.rotation.y = fixedSpawn.yaw;
        tintAstroWithPlayerColor(group, playerColor);
        const initialHits = Math.max(0, Math.min(MAX_HITS, Math.floor(Number(remoteHits) || 0)));
        updateNameTag(group, playerName || compactPlayerId(playerId), initialHits / MAX_HITS);
        scene.add(group);
        remotePlayers.set(playerId, {
          group,
          gun2Root: null,
          gun2World: remoteGun2,
          colorHex: playerColor,
          hits: initialHits,
          defeated: !!remoteDefeated,
          damageSeq: Math.max(0, Math.floor(Number(remoteDamageSeq) || 0)),
          playerName: playerName || compactPlayerId(playerId),
          targetPos: new THREE.Vector3(fixedSpawn.x, 0, fixedSpawn.z),
          targetRotY: fixedSpawn.yaw
        });
        recomputePlayerColors();
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

function placeInScene(astroGroup, gun2) {
  if (astroColocado) return;
  astroColocado = true;
  astroGroup.scale.setScalar(WORLD_GROUP_SCALE);
  scene.add(astroGroup);
  astroRoot = astroGroup;
  const mySpawn = spawnForPlayer(LOCAL_PLAYER_ID, PLAYER_SPAWNS);
  wander.x = mySpawn.x;
  wander.z = mySpawn.z;
  wander.lastRot = mySpawn.yaw;
  mouseLook.targetYaw = mySpawn.yaw;
  astroRoot.position.x = mySpawn.x;
  astroRoot.position.z = mySpawn.z;
  astroRoot.rotation.y = mySpawn.yaw;
  tintAstroWithPlayerColor(astroGroup, localPlayerColor);
  localHits = 0;
  localDefeated = false;
  localDamageSeq = 0;
  localShotSeq = 0;
  localLastHitColorHex = 0xffffff;
  updateNameTag(astroGroup, LOCAL_PLAYER_LABEL, 0);
  recomputePlayerColors();
  if (gun2) {
    gun2Root = gun2;
    astroGroup.add(gun2);
    gun2.position.set(gun2World.x, gun2World.y, gun2World.z);
  }
  setStatus("Listo. WASD mover · mouse cámara/personaje · click izquierdo dispara · CVBN arma 2 · sync.", true);
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
