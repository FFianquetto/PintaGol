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
import {
  WORLD_GROUP_SCALE,
  GUN_NUDGE,
  GUN_HAND_OFFSET_DEFAULT,
  GUN2_BASE_ROTATION,
  GUN3_BASE_ROTATION,
  SHOTGUN_BASE_ROTATION,
  GUN2_SCALE,
  GUN3_HAND_SCALE,
  SHOTGUN_HAND_SCALE,
  GUN3_PICKUP_BASE_Y,
  GUN3_PICKUP_RADIUS,
  GUN3_PICKUP_CENTER,
  SHOTGUN_PICKUP_BASE_Y,
  SHOTGUN_PICKUP_RADIUS,
  SHOTGUN_PICKUP_CENTER,
  weaponRotationForType
} from "./weapon-tuning.js";
import { spawnBullet, spawnBulletAtPosition, updateBullets } from "./astro-sync-bullets.js";
import {
  resolveLocalPlayerName,
  resolveLocalPlayerId,
  showLocalPlayerName,
  compactPlayerId
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
/** Escala base del mesh (Arena); el grupo se encoge con WORLD_GROUP_SCALE (ver weapon-tuning.js). */
const ASTRO_SCALE = 0.018;

/** Offset local del arma respecto al astronauta (CVBN); copia mutable desde weapon-tuning.js. */
const gun2World = { x: GUN_HAND_OFFSET_DEFAULT.x, y: GUN_HAND_OFFSET_DEFAULT.y, z: GUN_HAND_OFFSET_DEFAULT.z };
const BULLET_SCALE = 0.019;
const BULLET_SPEED = 28;
const BULLET_COOLDOWN_SUB_MS = 190;
const BULLET_COOLDOWN_PISTOL_MS = 340;
const BULLET_COOLDOWN_SHOTGUN_MS = 560;
const SUBFUSIL_BASE_DAMAGE = 1;
const PISTOL_DAMAGE_MULTIPLIER = 2;
const SHOTGUN_DAMAGE_MULTIPLIER = 4;
const GUN1_SHOT_SFX_URL = "assets/sfx/items/sub.mp3";
const GUN3_SHOT_SFX_URL = "assets/sfx/items/pistol.mp3";
const SHOTGUN_SHOT_SFX_URL = "assets/sfx/items/shotgun.mp3";
const GUN1_SHOT_POOL_SIZE = 4;
const PLAYER_COLORS = [0x3b82f6, 0xffffff, 0x22c55e, 0xeab308];
const MAX_HITS = 20;
const STAIN_DURATION_MS = 5000;

/** Modo extra en la misma escena (p. ej. zombie PvE). No mezclar con colisión de jugador. */
const _pintagolSceneBulletHandlers = [];
const _pintagolSceneFrameHandlers = [];
const _pintagolZombieVistaHandlers = [];
const _pintagolPedirSyncListeners = [];
/** Modo zombie: función que devuelve { hits, maxHits, defeated } para replicar en cada `modelo`. */
let _pintagolZombieSyncForPose = null;

const PLAYER_SPAWNS = [
  { x: -18, z: -18, yaw: Math.PI / 4 },
  { x: 18, z: -18, yaw: (3 * Math.PI) / 4 },
  { x: -18, z: 18, yaw: -Math.PI / 4 },
  { x: 18, z: 18, yaw: (-3 * Math.PI) / 4 }
];

const canvas = document.getElementById("astro-canvas");
const statusEl = document.getElementById("astro-status");
const playerNameHud = document.getElementById("astro-player-name");
const defeatOverlayEl = document.getElementById("astro-defeat-overlay");
const defeatTextEl = document.getElementById("astro-defeat-text");
const watchMatchBtn = document.getElementById("astro-btn-watch");
const goMenuBtn = document.getElementById("astro-btn-menu");
const spectatorIndicatorEl = document.getElementById("astro-spectator-indicator");
const LOCAL_PLAYER_NAME = resolveLocalPlayerName();
const LOCAL_PLAYER_ID = resolveLocalPlayerId(LOCAL_PLAYER_NAME);
const LOCAL_PLAYER_LABEL = LOCAL_PLAYER_NAME || "Jugador";
const LOCAL_STATE_KEY = `pintagol_astro_state_${LOCAL_PLAYER_ID}`;
let localPlayerColor = PLAYER_COLORS[0];
const QUERY_PARAMS = new URLSearchParams(window.location.search);
const INITIAL_WEAPON_QUERY = (QUERY_PARAMS.get("countryKey") || "").toLowerCase();
const CURRENT_GAME_ID = QUERY_PARAMS.get("game") || "";
let pendingInitialWeaponType = null;

function sendSyncMessage(payload) {
  const next = { ...(payload || {}) };
  if (CURRENT_GAME_ID) next.gameId = CURRENT_GAME_ID;
  enviarVista(next);
}

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
let gun3Template = null;
let gun3Pickup = null;
let shotgunTemplate = null;
let shotgunPickup = null;
let localWeaponType = "gun2";
let hasPickedGun3 = false;
let gun3PickupAvailable = true;
let gun3OwnerPlayerId = "";
let hasPickedShotgun = false;
let shotgunPickupAvailable = true;
let shotgunOwnerPlayerId = "";
const activeBullets = [];
let lastShotAt = 0;
let localHits = 0;
let localDefeated = false;
let spectatorMode = false;
let localDamageSeq = 0;
let localShotSeq = 0;
let localLastHitColorHex = 0xffffff;
const remotePlayers = new Map();
const remotePlayersLoading = new Set();
const seenRemoteShotIds = new Set();
const spawnSlotByPlayer = new Map();
const clock = new THREE.Clock();
const gun1ShotSfxPool = [];
const gun3ShotSfxPool = [];
const shotgunShotSfxPool = [];
let gun1ShotSfxIndex = 0;
let gun3ShotSfxIndex = 0;
let shotgunShotSfxIndex = 0;

function shortestAngleDelta(from, to) {
  const TAU = Math.PI * 2;
  let d = (to - from + Math.PI) % TAU;
  if (d < 0) d += TAU;
  return d - Math.PI;
}

function initGun1ShotSfx() {
  if (gun1ShotSfxPool.length) return;
  for (let i = 0; i < GUN1_SHOT_POOL_SIZE; i += 1) {
    const a = new Audio(GUN1_SHOT_SFX_URL);
    a.preload = "auto";
    a.volume = 0.42;
    gun1ShotSfxPool.push(a);
  }
}

function initGun3ShotSfx() {
  if (gun3ShotSfxPool.length) return;
  for (let i = 0; i < GUN1_SHOT_POOL_SIZE; i += 1) {
    const a = new Audio(GUN3_SHOT_SFX_URL);
    a.preload = "auto";
    a.volume = 0.44;
    gun3ShotSfxPool.push(a);
  }
}

function initShotgunShotSfx() {
  if (shotgunShotSfxPool.length) return;
  for (let i = 0; i < GUN1_SHOT_POOL_SIZE; i += 1) {
    const a = new Audio(SHOTGUN_SHOT_SFX_URL);
    a.preload = "auto";
    a.volume = 0.46;
    shotgunShotSfxPool.push(a);
  }
}

function playGun1ShotSfx() {
  if (!gun1ShotSfxPool.length) return;
  const a = gun1ShotSfxPool[gun1ShotSfxIndex];
  gun1ShotSfxIndex = (gun1ShotSfxIndex + 1) % gun1ShotSfxPool.length;
  if (!a) return;
  try {
    a.currentTime = 0;
    const playPromise = a.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        /* ignore autoplay/transient audio errors */
      });
    }
  } catch (_err) {
    /* no-op */
  }
}

function playGun3ShotSfx() {
  if (!gun3ShotSfxPool.length) return;
  const a = gun3ShotSfxPool[gun3ShotSfxIndex];
  gun3ShotSfxIndex = (gun3ShotSfxIndex + 1) % gun3ShotSfxPool.length;
  if (!a) return;
  try {
    a.currentTime = 0;
    const playPromise = a.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        /* ignore autoplay/transient audio errors */
      });
    }
  } catch (_err) {
    /* no-op */
  }
}

function playShotgunShotSfx() {
  if (!shotgunShotSfxPool.length) return;
  const a = shotgunShotSfxPool[shotgunShotSfxIndex];
  shotgunShotSfxIndex = (shotgunShotSfxIndex + 1) % shotgunShotSfxPool.length;
  if (!a) return;
  try {
    a.currentTime = 0;
    const playPromise = a.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        /* ignore autoplay/transient audio errors */
      });
    }
  } catch (_err) {
    /* no-op */
  }
}

function setWeaponType(nextWeaponType) {
  localWeaponType = normalizedWeaponType(nextWeaponType);
}

function normalizedWeaponType(raw) {
  if (raw === "gun3" || raw === "shotgun" || raw === "gun4") {
    return raw === "gun4" ? "shotgun" : raw;
  }
  return "gun2";
}

function weaponDamageForType(weaponType) {
  const wt = normalizedWeaponType(weaponType);
  if (wt === "gun3") return SUBFUSIL_BASE_DAMAGE * PISTOL_DAMAGE_MULTIPLIER;
  if (wt === "shotgun") return SUBFUSIL_BASE_DAMAGE * SHOTGUN_DAMAGE_MULTIPLIER;
  return SUBFUSIL_BASE_DAMAGE;
}

function weaponCooldownForType(weaponType) {
  const wt = normalizedWeaponType(weaponType);
  if (wt === "gun3") return BULLET_COOLDOWN_PISTOL_MS;
  if (wt === "shotgun") return BULLET_COOLDOWN_SHOTGUN_MS;
  return BULLET_COOLDOWN_SUB_MS;
}

function removeGun3Pickup() {
  if (!gun3Pickup) return;
  scene.remove(gun3Pickup);
  gun3Pickup = null;
}

function spawnGun3Pickup() {
  if (!gun3PickupAvailable || !gun3Template || gun3Pickup || hasPickedGun3) return;
  gun3Pickup = gun3Template.clone(true);
  gun3Pickup.name = "weapon-gun3-pickup";
  gun3Pickup.position.copy(GUN3_PICKUP_CENTER);
  gun3Pickup.rotation.set(0.22, 0, -0.12);
  scene.add(gun3Pickup);
}

function applyGun3PickupState(available, ownerId = "") {
  gun3PickupAvailable = !!available;
  gun3OwnerPlayerId = ownerId || "";
  if (gun3PickupAvailable) {
    spawnGun3Pickup();
  } else {
    removeGun3Pickup();
  }
}

function removeShotgunPickup() {
  if (!shotgunPickup) return;
  scene.remove(shotgunPickup);
  shotgunPickup = null;
}

function spawnShotgunPickup() {
  if (!shotgunPickupAvailable || !shotgunTemplate || shotgunPickup || hasPickedShotgun) return;
  shotgunPickup = shotgunTemplate.clone(true);
  shotgunPickup.name = "weapon-shotgun-pickup";
  shotgunPickup.position.copy(SHOTGUN_PICKUP_CENTER);
  shotgunPickup.rotation.set(0.22, 0, -0.08);
  scene.add(shotgunPickup);
}

function applyShotgunPickupState(available, ownerId = "") {
  shotgunPickupAvailable = !!available;
  shotgunOwnerPlayerId = ownerId || "";
  if (shotgunPickupAvailable) spawnShotgunPickup();
  else removeShotgunPickup();
}

function equipGun3Local() {
  if (hasPickedGun3 || !gun3PickupAvailable || !gun3Template || !astroRoot) return;
  hasPickedGun3 = true;
  hasPickedShotgun = false;
  applyGun3PickupState(false, LOCAL_PLAYER_ID);
  if (gun2Root && gun2Root.parent) {
    gun2Root.parent.remove(gun2Root);
    gun2Root = null;
  }
  const gun3 = gun3Template.clone(true);
  setupGunMesh(gun3, null, WORLD_GROUP_SCALE, gun2World, gunSetupOptions(GUN3_HAND_SCALE, GUN3_BASE_ROTATION));
  gun3.name = "weapon-gun3";
  gun2Root = gun3;
  astroRoot.add(gun3);
  setWeaponType("gun3");
  sendSyncMessage({
    tipo: "gun3State",
    available: false,
    ownerPlayerId: LOCAL_PLAYER_ID
  });
  setStatus("Recogiste gun3: equipada.", true);
}

function equipShotgunLocal() {
  if (hasPickedShotgun || !shotgunPickupAvailable || !shotgunTemplate || !astroRoot) return;
  hasPickedShotgun = true;
  hasPickedGun3 = false;
  applyShotgunPickupState(false, LOCAL_PLAYER_ID);
  if (gun2Root && gun2Root.parent) {
    gun2Root.parent.remove(gun2Root);
    gun2Root = null;
  }
  const shotgun = shotgunTemplate.clone(true);
  setupGunMesh(shotgun, null, WORLD_GROUP_SCALE, gun2World, gunSetupOptions(SHOTGUN_HAND_SCALE, SHOTGUN_BASE_ROTATION));
  shotgun.name = "weapon-shotgun";
  gun2Root = shotgun;
  astroRoot.add(shotgun);
  setWeaponType("shotgun");
  sendSyncMessage({
    tipo: "shotgunState",
    available: false,
    ownerPlayerId: LOCAL_PLAYER_ID
  });
  setStatus("Recogiste shotgun: equipada.", true);
}

function updateGun3Pickup(nowMs) {
  if (!gun3Pickup) return;
  const t = nowMs * 0.001;
  gun3Pickup.rotation.y = t * 1.9;
  gun3Pickup.position.y = GUN3_PICKUP_BASE_Y + Math.sin(t * 2.7) * 0.35;
  if (!astroRoot || localDefeated || hasPickedGun3 || !gun3PickupAvailable) return;
  const dx = astroRoot.position.x - gun3Pickup.position.x;
  const dz = astroRoot.position.z - gun3Pickup.position.z;
  if (dx * dx + dz * dz <= GUN3_PICKUP_RADIUS * GUN3_PICKUP_RADIUS) {
    equipGun3Local();
  }
}

function updateShotgunPickup(nowMs) {
  if (!shotgunPickup) return;
  const t = nowMs * 0.001;
  shotgunPickup.rotation.y = -t * 1.75;
  shotgunPickup.position.y = SHOTGUN_PICKUP_BASE_Y + Math.sin(t * 2.25) * 0.3;
  if (!astroRoot || localDefeated || hasPickedShotgun || !shotgunPickupAvailable) return;
  const dx = astroRoot.position.x - shotgunPickup.position.x;
  const dz = astroRoot.position.z - shotgunPickup.position.z;
  if (dx * dx + dz * dz <= SHOTGUN_PICKUP_RADIUS * SHOTGUN_PICKUP_RADIUS) {
    equipShotgunLocal();
  }
}

function clearRemoteWeapon(rp) {
  if (!rp || !rp.weaponRoot) return;
  if (rp.weaponRoot.parent) rp.weaponRoot.parent.remove(rp.weaponRoot);
  rp.weaponRoot = null;
  rp.gun2Root = null;
}

function attachRemoteWeapon(playerId, weaponModel, weaponType) {
  const rp = remotePlayers.get(playerId);
  if (!rp || !rp.group || !weaponModel) return;
  clearRemoteWeapon(rp);
  rp.group.add(weaponModel);
  rp.weaponRoot = weaponModel;
  rp.gun2Root = weaponModel;
  rp.weaponType = normalizedWeaponType(weaponType);
}

function loadRemoteGun3(playerId, gunStart) {
  const rp = remotePlayers.get(playerId);
  if (!rp || !rp.group) return;
  loadTextureFirst(
    pathsFor("gun3/gun3.png"),
    (gunTex) => {
      prepTex(gunTex, aniso);
      loadObjFirst(
        pathsFor("gun3/gun3.obj"),
        (gun3) => {
          const start = gunStart || rp.gun2World;
          setupGunMesh(gun3, gunTex, WORLD_GROUP_SCALE, start, gunSetupOptions(GUN3_HAND_SCALE, GUN3_BASE_ROTATION));
          gun3.name = `weapon-gun3-${playerId}`;
          attachRemoteWeapon(playerId, gun3, "gun3");
        },
        () => {
          /* no-op */
        }
      );
    },
    () => {
      loadObjFirst(
        pathsFor("gun3/gun3.obj"),
        (gun3) => {
          const start = gunStart || rp.gun2World;
          setupGunMesh(gun3, null, WORLD_GROUP_SCALE, start, gunSetupOptions(GUN3_HAND_SCALE, GUN3_BASE_ROTATION));
          gun3.name = `weapon-gun3-${playerId}`;
          attachRemoteWeapon(playerId, gun3, "gun3");
        },
        () => {
          /* no-op */
        }
      );
    }
  );
}

function loadRemoteShotgun(playerId, gunStart) {
  const rp = remotePlayers.get(playerId);
  if (!rp || !rp.group) return;
  loadTextureFirst(
    pathsFor("gun4/shotgun.png"),
    (gunTex) => {
      prepTex(gunTex, aniso);
      loadObjFirst(
        pathsFor("gun4/shotgun.obj"),
        (shotgunObj) => {
          const start = gunStart || rp.gun2World;
          setupGunMesh(shotgunObj, gunTex, WORLD_GROUP_SCALE, start, gunSetupOptions(SHOTGUN_HAND_SCALE, SHOTGUN_BASE_ROTATION));
          shotgunObj.name = `weapon-shotgun-${playerId}`;
          attachRemoteWeapon(playerId, shotgunObj, "shotgun");
        },
        () => {
          /* no-op */
        }
      );
    },
    () => {
      loadObjFirst(
        pathsFor("gun4/shotgun.obj"),
        (shotgunObj) => {
          const start = gunStart || rp.gun2World;
          setupGunMesh(shotgunObj, null, WORLD_GROUP_SCALE, start, gunSetupOptions(SHOTGUN_HAND_SCALE, SHOTGUN_BASE_ROTATION));
          shotgunObj.name = `weapon-shotgun-${playerId}`;
          attachRemoteWeapon(playerId, shotgunObj, "shotgun");
        },
        () => {
          /* no-op */
        }
      );
    }
  );
}

function syncRemoteWeaponByType(playerId, weaponType) {
  const rp = remotePlayers.get(playerId);
  if (!rp) return;
  const nextType = normalizedWeaponType(weaponType);
  if (rp.weaponType === nextType && rp.weaponRoot) return;
  if (nextType === "gun3") {
    loadRemoteGun3(playerId, rp.gun2World);
  } else if (nextType === "shotgun") {
    loadRemoteShotgun(playerId, rp.gun2World);
  } else {
    loadRemoteGun2(playerId, rp.gun2World);
  }
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

function persistLocalCombatState() {
  try {
    window.sessionStorage.setItem(
      LOCAL_STATE_KEY,
      JSON.stringify({
        hits: localHits,
        defeated: localDefeated,
        damageSeq: localDamageSeq,
        lastHitColorHex: localLastHitColorHex
      })
    );
  } catch (_err) {
    /* no-op */
  }
}

function loadPersistedLocalCombatState() {
  try {
    const raw = window.sessionStorage.getItem(LOCAL_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const hits = Math.max(0, Math.min(MAX_HITS, Math.floor(Number(parsed.hits) || 0)));
    const defeated = !!parsed.defeated || hits >= MAX_HITS;
    const damageSeq = Math.max(0, Math.floor(Number(parsed.damageSeq) || 0));
    const lastHitColorHex = typeof parsed.lastHitColorHex === "number" ? parsed.lastHitColorHex : 0xffffff;
    return { hits, defeated, damageSeq, lastHitColorHex };
  } catch (_err) {
    return null;
  }
}

function setDefeatOverlayVisible(visible, message) {
  if (!defeatOverlayEl) return;
  defeatOverlayEl.hidden = !visible;
  if (visible && defeatTextEl && typeof message === "string" && message.trim()) {
    defeatTextEl.textContent = message;
  }
}

function bindDefeatActions() {
  if (watchMatchBtn) {
    watchMatchBtn.addEventListener("click", () => {
      setDefeatOverlayVisible(false);
      updateSpectatorIndicator();
    });
  }
  if (goMenuBtn) {
    goMenuBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }
}

function updateSpectatorIndicator() {
  if (!spectatorIndicatorEl) return;
  spectatorIndicatorEl.hidden = !spectatorMode;
}

function getSpawnForPlayerId(playerId) {
  if (!playerId || !PLAYER_SPAWNS.length) return PLAYER_SPAWNS[0];
  if (spawnSlotByPlayer.has(playerId)) {
    return PLAYER_SPAWNS[spawnSlotByPlayer.get(playerId)] || PLAYER_SPAWNS[0];
  }
  let hash = 2166136261;
  for (let i = 0; i < playerId.length; i += 1) {
    hash ^= playerId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const start = Math.abs(hash >>> 0) % PLAYER_SPAWNS.length;
  const occupied = new Set(Array.from(spawnSlotByPlayer.values()));
  let picked = start;
  for (let offset = 0; offset < PLAYER_SPAWNS.length; offset += 1) {
    const candidate = (start + offset) % PLAYER_SPAWNS.length;
    if (!occupied.has(candidate)) {
      picked = candidate;
      break;
    }
  }
  spawnSlotByPlayer.set(playerId, picked);
  return PLAYER_SPAWNS[picked] || PLAYER_SPAWNS[0];
}

function setPlayerEliminatedVisual(playerGroup, eliminated) {
  if (!playerGroup) return;
  playerGroup.visible = !eliminated;
}

function syncRemoteDefeatVisual(remotePlayerState) {
  if (!remotePlayerState || !remotePlayerState.group) return;
  setPlayerEliminatedVisual(remotePlayerState.group, !!remotePlayerState.defeated);
}

function findSpectatorTarget() {
  for (const [, rp] of remotePlayers) {
    if (!rp || !rp.group || rp.defeated) continue;
    return rp.group;
  }
  return null;
}

function updateSpectatorCamera() {
  const target = findSpectatorTarget();
  if (target) {
    const desiredX = target.position.x - Math.sin(target.rotation.y) * 7.5;
    const desiredY = target.position.y + 4.8;
    const desiredZ = target.position.z - Math.cos(target.rotation.y) * 7.5;
    camera.position.x += (desiredX - camera.position.x) * 0.08;
    camera.position.y += (desiredY - camera.position.y) * 0.08;
    camera.position.z += (desiredZ - camera.position.z) * 0.08;
    camera.lookAt(target.position.x, target.position.y + 1.5, target.position.z);
    return;
  }
  camera.position.x += (0 - camera.position.x) * 0.06;
  camera.position.y += (24 - camera.position.y) * 0.06;
  camera.position.z += (0 - camera.position.z) * 0.06;
  camera.lookAt(0, 0, 0);
}

function enterSpectatorMode(message) {
  if (spectatorMode) return;
  spectatorMode = true;
  setAimMode(false);
  fireQueued = false;
  keys.w = keys.a = keys.s = keys.d = false;
  keysGun2.c = keysGun2.v = keysGun2.b = keysGun2.n = false;
  setPlayerEliminatedVisual(astroRoot, true);
  setDefeatOverlayVisible(true, message || "Tu barra GameTag se llenó. Ahora estás en modo espectador.");
  updateSpectatorIndicator();
  persistLocalCombatState();
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
  msg.weaponType = localWeaponType;
  msg.gun3PickupAvailable = gun3PickupAvailable;
  msg.gun3OwnerPlayerId = gun3OwnerPlayerId;
  msg.shotgunPickupAvailable = shotgunPickupAvailable;
  msg.shotgunOwnerPlayerId = shotgunOwnerPlayerId;
  if (typeof _pintagolZombieSyncForPose === "function") {
    try {
      const zs = _pintagolZombieSyncForPose();
      if (zs) msg.zombieSync = zs;
    } catch (_e) {
      /* noop */
    }
  }
  sendSyncMessage(msg);
}

function manejarRemoto(d) {
  if (!d) return;
  if (CURRENT_GAME_ID && (!d.gameId || d.gameId !== CURRENT_GAME_ID)) return;
  if (d.tipo === "zombieState") {
    for (let z = 0; z < _pintagolZombieVistaHandlers.length; z += 1) {
      _pintagolZombieVistaHandlers[z](d);
    }
    return;
  }
  if (d.tipo === "modelo" && d.zombieSync && d.playerId && d.playerId !== LOCAL_PLAYER_ID) {
    const z = d.zombieSync;
    const out = {
      tipo: "zombieState",
      hits: typeof z.hits === "number" && isFinite(z.hits) ? z.hits : 0,
      maxHits: typeof z.maxHits === "number" && isFinite(z.maxHits) ? z.maxHits : 5,
      defeated: z.defeated === true
    };
    for (let z2 = 0; z2 < _pintagolZombieVistaHandlers.length; z2 += 1) {
      _pintagolZombieVistaHandlers[z2](out);
    }
  }
  if (d.tipo === "pedirSync") {
    if (!d.playerId || d.playerId !== LOCAL_PLAYER_ID) {
      sendPose();
      for (let ps = 0; ps < _pintagolPedirSyncListeners.length; ps += 1) {
        _pintagolPedirSyncListeners[ps](d);
      }
    }
    return;
  }
  if (d.tipo === "hit") {
    handleRemoteHit(d);
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
  if (d.tipo === "gun3State") {
    applyGun3PickupState(d.available !== false, d.ownerPlayerId || "");
    return;
  }
  if (d.tipo === "shotgunState") {
    applyShotgunPickupState(d.available !== false, d.ownerPlayerId || "");
    return;
  }
  if (d.tipo !== "modelo" || !d.playerId || typeof d.playerId !== "string") return;
  if (d.playerId === LOCAL_PLAYER_ID) return;
  const pos = d.pos;
  const rotY = d.rotY;
  if (!Array.isArray(pos) || pos.length < 3 || typeof rotY !== "number" || !isFinite(rotY)) {
    return;
  }
  if (typeof d.gun3PickupAvailable === "boolean") {
    applyGun3PickupState(d.gun3PickupAvailable, d.gun3OwnerPlayerId || "");
  }
  if (typeof d.shotgunPickupAvailable === "boolean") {
    applyShotgunPickupState(d.shotgunPickupAvailable, d.shotgunOwnerPlayerId || "");
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
    if (typeof d.weaponType === "string") {
      syncRemoteWeaponByType(d.playerId, d.weaponType);
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
    syncRemoteDefeatVisual(rp);
    if (d.playerName && d.playerName !== rp.playerName) {
      rp.playerName = d.playerName;
      updateNameTag(rp.group, d.playerName, rp.hits / MAX_HITS);
    }
    recomputePlayerColors();
    return;
  }
  if (remotePlayersLoading.has(d.playerId)) return;
  remotePlayersLoading.add(d.playerId);
  spawnRemotePlayer(d.playerId, d.playerName, d.gun2World, d.hits, d.defeated, d.damageSeq, d.weaponType);
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
  bullet.userData.damage = Math.max(1, Math.floor(Number(d.damage) || 1));
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
    persistLocalCombatState();
    if (localDefeated) {
      enterSpectatorMode("Perdiste la ronda. Estás en modo espectador.");
      setStatus("Has perdido: modo espectador activo.", false);
    }
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
  syncRemoteDefeatVisual(rp);
}

function handleRemoteHit(d) {
  if (!d || typeof d.targetPlayerId !== "string") return;
  if (d.targetPlayerId !== LOCAL_PLAYER_ID) return;
  if (localDefeated) return;
  const hitColorHex = typeof d.hitColorHex === "number" ? d.hitColorHex : 0xffffff;
  const hitDamage = Math.max(1, Math.floor(Number(d.damage) || 1));
  addHitStain(astroRoot, hitColorHex);
  applyHitToLocalPlayer(hitColorHex, hitDamage);
  sendPose();
  sendSyncMessage({
    tipo: "damage",
    playerId: LOCAL_PLAYER_ID,
    hits: localHits,
    defeated: localDefeated,
    hitColorHex,
    damageSeq: localDamageSeq
  });
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
  const shotCooldownMs = weaponCooldownForType(localWeaponType);
  if (nowMs - lastShotAt < shotCooldownMs) return;
  const shotDamage = weaponDamageForType(localWeaponType);
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
  bullet.userData.damage = shotDamage;
  scene.add(bullet);
  activeBullets.push(bullet);
  if (localWeaponType === "gun3") playGun3ShotSfx();
  else if (localWeaponType === "shotgun") playShotgunShotSfx();
  else playGun1ShotSfx();
  localShotSeq += 1;
  const shotId = `${LOCAL_PLAYER_ID}:${localShotSeq}`;
  sendSyncMessage({
    tipo: "shot",
    playerId: LOCAL_PLAYER_ID,
    shotId,
    pos: bullet.position.toArray(),
    dir: forward.toArray(),
    colorHex: localPlayerColor,
    damage: shotDamage
  });
  lastShotAt = nowMs;
  fireQueued = false;
}

function applyHitToLocalPlayer(hitColorHex = 0xffffff, damage = 1) {
  if (localDefeated || !astroRoot) return;
  const delta = Math.max(1, Math.floor(Number(damage) || 1));
  localHits = Math.min(MAX_HITS, localHits + delta);
  localDamageSeq += 1;
  localLastHitColorHex = hitColorHex;
  updateNameTag(astroRoot, LOCAL_PLAYER_LABEL, localHits / MAX_HITS);
  persistLocalCombatState();
  if (localHits >= MAX_HITS) {
    localDefeated = true;
    enterSpectatorMode("Tu barra GameTag se llenó con 20 impactos. Ahora observas la partida.");
    setStatus("Has perdido: tu gametag se llenó de rojo (20 impactos).", false);
  }
}

// --- Colisión solo para el rig del jugador / remotos (astronauta) ---
// Cápsula analítica fija a partir de group.position (no usa geometría FBX). Distinto a mods de escena o zombie.
function hitPointInAstronautRig(bulletPos, playerGroup) {
  if (!bulletPos || !playerGroup) return false;
  const g = playerGroup.position;
  const dx = bulletPos.x - g.x;
  const dz = bulletPos.z - g.z;
  const horizontalHit = dx * dx + dz * dz <= 1.45 * 1.45;
  if (!horizontalHit) return false;
  const yMin = g.y + 0.25;
  const yMax = g.y + 3.45;
  return bulletPos.y >= yMin && bulletPos.y <= yMax;
}

function segmentIntersectsAstronautRig(prevPos, currPos, playerGroup) {
  if (!prevPos || !currPos || !playerGroup) return false;
  if (hitPointInAstronautRig(currPos, playerGroup)) return true;
  const steps = 6;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const p = new THREE.Vector3().lerpVectors(prevPos, currPos, t);
    if (hitPointInAstronautRig(p, playerGroup)) return true;
  }
  return false;
}

/**
 * 1) Handlers de escena (zombie, etc.); 2) recibir disparo al rig local; 3) tú impactas a remotos.
 * No reutilices la cápsula de astronauta para enemigos: van en módulo aparte.
 */
function processBulletHits() {
  if (!activeBullets.length) return;
  for (let i = activeBullets.length - 1; i >= 0; i -= 1) {
    const bullet = activeBullets[i];
    const ownerId = bullet?.userData?.ownerId;
    if (!bullet) continue;
    const prevPos = bullet.userData?.prevPos || bullet.position;
    const currPos = bullet.position;
    let consumed = false;
    for (let h = 0; h < _pintagolSceneBulletHandlers.length; h += 1) {
      if (_pintagolSceneBulletHandlers[h]({ prevPos, currPos, bullet, index: i })) {
        consumed = true;
        break;
      }
    }
    if (astroRoot && !localDefeated && ownerId !== LOCAL_PLAYER_ID) {
      if (segmentIntersectsAstronautRig(prevPos, currPos, astroRoot)) {
        const hitColorHex = bullet.userData?.colorHex ?? 0xffffff;
        const hitDamage = Math.max(1, Math.floor(Number(bullet.userData?.damage) || 1));
        addHitStain(astroRoot, hitColorHex);
        applyHitToLocalPlayer(hitColorHex, hitDamage);
        sendPose();
        sendSyncMessage({
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
    if (!consumed && ownerId === LOCAL_PLAYER_ID) {
      for (const [targetPlayerId, rp] of remotePlayers) {
        if (!rp || !rp.group || rp.defeated) continue;
        if (segmentIntersectsAstronautRig(prevPos, currPos, rp.group)) {
          const hitColorHex = bullet.userData?.colorHex ?? localPlayerColor;
          const hitDamage = Math.max(1, Math.floor(Number(bullet.userData?.damage) || 1));
          sendSyncMessage({
            tipo: "hit",
            playerId: LOCAL_PLAYER_ID,
            targetPlayerId,
            hitColorHex,
            damage: hitDamage
          });
          consumed = true;
          break;
        }
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
  if (localDefeated) {
    spectatorMode = true;
  }
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
  const t = performance.now() * 0.001;

  if (!spectatorMode) {
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
  } else {
    updateSpectatorCamera();
  }

  if (gun2Root) {
    if (!aplicandoRemoto) {
      applyGun2Input(gun2World, keysGun2, GUN_NUDGE);
    }
    clampGun2LocalOffset(gun2World);
    applyGun2LocalTransform(gun2Root, gun2World, t, weaponRotationForType(localWeaponType));
  }

  if (!aplicandoRemoto) {
    sendPose();
  }

  shootIfReady(performance.now());
  updateGun3Pickup(performance.now());
  updateShotgunPickup(performance.now());
  updateBullets(scene, activeBullets, dt);
  processBulletHits();
  const nowMs = performance.now();
  refreshAstronautStain(astroRoot, nowMs);
  for (let f = 0; f < _pintagolSceneFrameHandlers.length; f += 1) {
    _pintagolSceneFrameHandlers[f]({ camera, scene, dt, clock });
  }

  remotePlayers.forEach((rp) => {
    if (!rp.group) return;
    rp.group.position.lerp(rp.targetPos, 0.2);
    const dYaw = shortestAngleDelta(rp.group.rotation.y, rp.targetRotY);
    rp.group.rotation.y += dYaw * 0.2;
    applyGun2RemoteTransform(rp.gun2Root, rp.gun2World, t, weaponRotationForType(rp.weaponType));
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
          setupGunMesh(gun2, gunTex, WORLD_GROUP_SCALE, gun2World, gunSetupOptions(GUN2_SCALE, GUN2_BASE_ROTATION));
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
          setupGunMesh(gun2, null, WORLD_GROUP_SCALE, gun2World, gunSetupOptions(GUN2_SCALE, GUN2_BASE_ROTATION));
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
  loadGun3Template();
  loadShotgunTemplate();
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

function loadGun3Template() {
  loadTextureFirst(
    pathsFor("gun3/gun3.png"),
    (gunTex) => {
      prepTex(gunTex, aniso);
      loadObjFirst(
        pathsFor("gun3/gun3.obj"),
        (gun3) => {
          setupGunMesh(
            gun3,
            gunTex,
            WORLD_GROUP_SCALE,
            { x: 0, y: GUN3_PICKUP_BASE_Y, z: 0 },
            gunSetupOptions(GUN3_HAND_SCALE, GUN3_BASE_ROTATION)
          );
          gun3Template = gun3;
          spawnGun3Pickup();
          if (pendingInitialWeaponType === "gun3") {
            equipGun3Local();
          }
        },
        () => {
          gun3Template = null;
        }
      );
    },
    () => {
      loadObjFirst(
        pathsFor("gun3/gun3.obj"),
        (gun3) => {
          setupGunMesh(
            gun3,
            null,
            WORLD_GROUP_SCALE,
            { x: 0, y: GUN3_PICKUP_BASE_Y, z: 0 },
            gunSetupOptions(GUN3_HAND_SCALE, GUN3_BASE_ROTATION)
          );
          gun3Template = gun3;
          spawnGun3Pickup();
          if (pendingInitialWeaponType === "gun3") {
            equipGun3Local();
          }
        },
        () => {
          gun3Template = null;
        }
      );
    }
  );
}

function loadShotgunTemplate() {
  loadTextureFirst(
    pathsFor("gun4/shotgun.png"),
    (gunTex) => {
      prepTex(gunTex, aniso);
      loadObjFirst(
        pathsFor("gun4/shotgun.obj"),
        (shotgunObj) => {
          setupGunMesh(
            shotgunObj,
            gunTex,
            WORLD_GROUP_SCALE,
            { x: SHOTGUN_PICKUP_CENTER.x, y: SHOTGUN_PICKUP_BASE_Y, z: SHOTGUN_PICKUP_CENTER.z },
            gunSetupOptions(SHOTGUN_HAND_SCALE, SHOTGUN_BASE_ROTATION)
          );
          shotgunTemplate = shotgunObj;
          spawnShotgunPickup();
          if (pendingInitialWeaponType === "shotgun") {
            equipShotgunLocal();
          }
        },
        () => {
          shotgunTemplate = null;
        }
      );
    },
    () => {
      loadObjFirst(
        pathsFor("gun4/shotgun.obj"),
        (shotgunObj) => {
          setupGunMesh(
            shotgunObj,
            null,
            WORLD_GROUP_SCALE,
            { x: SHOTGUN_PICKUP_CENTER.x, y: SHOTGUN_PICKUP_BASE_Y, z: SHOTGUN_PICKUP_CENTER.z },
            gunSetupOptions(SHOTGUN_HAND_SCALE, SHOTGUN_BASE_ROTATION)
          );
          shotgunTemplate = shotgunObj;
          spawnShotgunPickup();
          if (pendingInitialWeaponType === "shotgun") {
            equipShotgunLocal();
          }
        },
        () => {
          shotgunTemplate = null;
        }
      );
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
          setupGunMesh(gun2, gunTex, WORLD_GROUP_SCALE, start, gunSetupOptions(GUN2_SCALE, GUN2_BASE_ROTATION));
          gun2.name = `weapon-gun2-${playerId}`;
          attachRemoteWeapon(playerId, gun2, "gun2");
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
          setupGunMesh(gun2, null, WORLD_GROUP_SCALE, start, gunSetupOptions(GUN2_SCALE, GUN2_BASE_ROTATION));
          gun2.name = `weapon-gun2-${playerId}`;
          attachRemoteWeapon(playerId, gun2, "gun2");
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
  remoteDamageSeq = 0,
  remoteWeaponType = "gun2"
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
        const fixedSpawn = getSpawnForPlayerId(playerId);
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
          weaponRoot: null,
          gun2World: remoteGun2,
          colorHex: playerColor,
          hits: initialHits,
          defeated: !!remoteDefeated,
          damageSeq: Math.max(0, Math.floor(Number(remoteDamageSeq) || 0)),
          weaponType: normalizedWeaponType(remoteWeaponType),
          playerName: playerName || compactPlayerId(playerId),
          targetPos: new THREE.Vector3(fixedSpawn.x, 0, fixedSpawn.z),
          targetRotY: fixedSpawn.yaw
        });
        syncRemoteDefeatVisual(remotePlayers.get(playerId));
        recomputePlayerColors();
        syncRemoteWeaponByType(playerId, remoteWeaponType);
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
  const mySpawn = getSpawnForPlayerId(LOCAL_PLAYER_ID);
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
  spectatorMode = false;
  localDamageSeq = 0;
  localShotSeq = 0;
  localLastHitColorHex = 0xffffff;
  localWeaponType = normalizedWeaponType(INITIAL_WEAPON_QUERY || "gun2");
  hasPickedGun3 = false;
  hasPickedShotgun = false;
  gun3PickupAvailable = true;
  gun3OwnerPlayerId = "";
  shotgunPickupAvailable = true;
  shotgunOwnerPlayerId = "";
  removeGun3Pickup();
  removeShotgunPickup();
  const persistedState = loadPersistedLocalCombatState();
  if (persistedState) {
    localHits = persistedState.hits;
    localDefeated = persistedState.defeated;
    localDamageSeq = Math.max(localDamageSeq, persistedState.damageSeq);
    localLastHitColorHex = persistedState.lastHitColorHex;
  }
  setPlayerEliminatedVisual(astroRoot, false);
  setDefeatOverlayVisible(false);
  updateNameTag(astroGroup, LOCAL_PLAYER_LABEL, localHits / MAX_HITS);
  if (localDefeated) {
    enterSpectatorMode("Ya estabas eliminado. Sigues en modo espectador.");
    setStatus("Modo espectador restaurado tras recarga.", false);
  } else {
    persistLocalCombatState();
    updateSpectatorIndicator();
  }
  recomputePlayerColors();
  if (gun2) {
    gun2Root = gun2;
    astroGroup.add(gun2);
    gun2.position.set(gun2World.x, gun2World.y, gun2World.z);
  }
  spawnGun3Pickup();
  spawnShotgunPickup();
  if (localWeaponType === "gun3") {
    pendingInitialWeaponType = "gun3";
    equipGun3Local();
  } else if (localWeaponType === "shotgun") {
    pendingInitialWeaponType = "shotgun";
    equipShotgunLocal();
  } else {
    pendingInitialWeaponType = null;
  }
  setStatus("Listo. WASD mover · mouse cámara/personaje · click izquierdo dispara · CVBN arma 2 · sync.", true);
  queueMicrotask(() => {
    sendSyncMessage({ tipo: "pedirSync", playerId: LOCAL_PLAYER_ID });
    if (getVentanaId() !== "2") {
      sendPose();
    }
  });
}

bindKeys();
bindMouseLook();
bindDefeatActions();
initGun1ShotSfx();
initGun3ShotSfx();
initShotgunShotSfx();
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
    sendSyncMessage({ tipo: "pedirSync", playerId: LOCAL_PLAYER_ID });
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

/** PvE / mods que no sean PvP con rig de astronauta. */
export function registerPintagolSceneBulletHandler(fn) {
  if (typeof fn !== "function") {
    return () => {};
  }
  _pintagolSceneBulletHandlers.push(fn);
  return () => {
    const j = _pintagolSceneBulletHandlers.indexOf(fn);
    if (j >= 0) _pintagolSceneBulletHandlers.splice(j, 1);
  };
}

export function registerPintagolSceneFrameHandler(fn) {
  if (typeof fn !== "function") {
    return () => {};
  }
  _pintagolSceneFrameHandlers.push(fn);
  return () => {
    const j = _pintagolSceneFrameHandlers.indexOf(fn);
    if (j >= 0) _pintagolSceneFrameHandlers.splice(j, 1);
  };
}

export function registerPintagolZombieVistaHandler(fn) {
  if (typeof fn !== "function") {
    return () => {};
  }
  _pintagolZombieVistaHandlers.push(fn);
  return () => {
    const j = _pintagolZombieVistaHandlers.indexOf(fn);
    if (j >= 0) _pintagolZombieVistaHandlers.splice(j, 1);
  };
}

/** Úsalo p. ej. en modo zombie para reenviar estado (hits) cuando otro cliente pide sync. */
export function registerPintagolPedirSyncListener(fn) {
  if (typeof fn !== "function") {
    return () => {};
  }
  _pintagolPedirSyncListeners.push(fn);
  return () => {
    const j = _pintagolPedirSyncListeners.indexOf(fn);
    if (j >= 0) _pintagolPedirSyncListeners.splice(j, 1);
  };
}

/** En modo zombie, adjunta { hits, maxHits, defeated } a cada `modelo` (misma frecuencia que el movimiento). */
export function setPintagolZombieSyncForPose(fn) {
  _pintagolZombieSyncForPose = typeof fn === "function" ? fn : null;
}

export function getPintagolSyncScene() {
  return scene;
}

export function getPintagolLocalPlayerId() {
  return LOCAL_PLAYER_ID;
}

export function sendPintagolVistaMessage(p) {
  if (p && typeof p === "object") {
    sendSyncMessage(p);
  }
}
