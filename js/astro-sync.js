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
import { loadMapCabin } from "./map/map-cabin.js";
import { loadMapCasa } from "./map/map-casa.js";
import { loadMapAmmobox, AMMOBOX_CONFIG } from "./map/map-ammobox.js";
import { loadMapPuente } from "./map/map-puente.js";
import { loadMapPozoAgua } from "./map/map-pozo-agua.js";
import { resolveMapPlayerXZClamped } from "./map/map-structure-collisions.js";
import { playAstronautDeathExplosion, HIDE_DELAY_MS } from "./astro-sync-death-fx.js";

const FBX_URLS = ["assets/models/astro/astronout.fbx", "/assets/models/astro/astronout.fbx"];
const PNG_URLS = ["assets/models/astro/astronout.jpg", "/assets/models/astro/astronout.jpg"];

/** Mismas bases que multijugador (assets.js) para encontrar modelos. */
const MODEL_BASES = ["assets/models/", "/assets/models/", "../assets/models/"];
const TEXTURE_BASES = ["assets/textures/", "/assets/textures/", "../assets/textures/"];

const ASTRO_BORDE = 44;
const ASTRO_MOVE_SPEED = 0.13;
const MAP_SIZE = 112;
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
const ASTRO_SCALE = 0.02;

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
const ITEM_PICKUP_SFX_URL = "assets/sfx/items/item.mp3";
const GUN1_SHOT_POOL_SIZE = 4;
const ITEM_PICKUP_POOL_SIZE = 4;
const AUDIO_SFX_KEY = "pintagol_audio_sfx_volume";
const AUDIO_MUSIC_KEY = "pintagol_audio_music_volume";
const DEFAULT_SFX_VOLUME_PERCENT = 72;
const DEFAULT_MUSIC_VOLUME_PERCENT = 72;
const PLAYER_COLORS = [0x3b82f6, 0xffffff, 0x22c55e, 0xeab308];
const MAX_HITS = 20;
const STAIN_DURATION_MS = 5000;
const MEDKIT_HEAL_AMOUNT = 5;
const MEDKIT_PICKUP_RADIUS = 1.8;
const MEDKIT_PICKUP_CENTER = new THREE.Vector3(11.5, 0.72, -9.5);
const DRINK_PICKUP_RADIUS = 1.8;
const DRINK_PICKUP_CENTER = new THREE.Vector3(-17.5, 0.72, 14.5);
const DRINK_SPEED_BOOST_MULTIPLIER = 1.9;
const DRINK_SPEED_BOOST_DURATION_MS = 12000;
const STAR_PICKUP_RADIUS = 1.8;
const STAR_PICKUP_CENTER = new THREE.Vector3(-3.5, 0.78, 19.5);
const STAR_IMMUNITY_DURATION_MS = 6000;
const BOMB_PICKUP_RADIUS = 1.8;
const BOMB_PICKUP_CENTER = new THREE.Vector3(16.8, 0.72, 18.2);
const BOMB_DAMAGE_BOOST_MULTIPLIER = 2;
const BOMB_DAMAGE_BOOST_DURATION_MS = 6000;
const AMMOBOX_INTERACTION_RADIUS = 2.45;
const AMMOBOX_WEAPON_SWAP_COOLDOWN_MS = 2200;
/** Pinares dispersos por todo el terreno jugable (±ASTRO_BORDE); menos árboles que antes para dejar aire al decorado. */
const PINE_LAYOUT = [
  { model: "pine2", x: -24, z: -24, rotY: 0.3, scale: 0.86 },
  { model: "pine3", x: -20, z: -26, rotY: 1.1, scale: 1.0 },
  { model: "pine2", x: 25, z: -23, rotY: 2.5, scale: 0.9 },
  { model: "pine3", x: 22, z: -27, rotY: 0.9, scale: 1.04 },
  { model: "pine2", x: -26, z: 21, rotY: 0.7, scale: 0.88 },
  { model: "pine3", x: -23, z: 25, rotY: 1.8, scale: 0.98 },
  { model: "pine2", x: 23, z: 22, rotY: 2.2, scale: 0.92 },
  { model: "pine3", x: 27, z: 26, rotY: 0.2, scale: 1.02 },
  { model: "pine2", x: -40, z: -8, rotY: 0.55, scale: 0.9 },
  { model: "pine3", x: -35, z: 2, rotY: 1.4, scale: 0.97 },
  { model: "pine2", x: -38, z: 12, rotY: 2.1, scale: 0.88 },
  { model: "pine3", x: -33, z: -12, rotY: 0.2, scale: 1.0 },
  { model: "pine2", x: -18, z: -36, rotY: 1.6, scale: 0.91 },
  { model: "pine3", x: -8, z: -40, rotY: 2.8, scale: 0.99 },
  { model: "pine3", x: 35, z: -38, rotY: 0.45, scale: 1.01 },
  { model: "pine2", x: 40, z: -14, rotY: 1.9, scale: 0.89 },
  { model: "pine3", x: 38, z: 6, rotY: 2.6, scale: 0.96 },
  { model: "pine2", x: 41, z: 18, rotY: 1.1, scale: 0.94 },
  { model: "pine3", x: 32, z: 38, rotY: 0.75, scale: 1.02 },
  { model: "pine2", x: -16, z: 38, rotY: 0.35, scale: 0.91 },
  { model: "pine3", x: -40, z: 22, rotY: 2.2, scale: 1.0 },
  { model: "pine2", x: -30, z: -38, rotY: 2.35, scale: 0.92 },
  { model: "pine3", x: -42, z: -18, rotY: 1.25, scale: 1.04 },
  { model: "pine3", x: -22, z: 32, rotY: 0.85, scale: 1.01 },
  { model: "pine2", x: 42, z: 28, rotY: 0.15, scale: 0.91 }
];

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
const effectTimerEl = document.getElementById("astro-effect-timer");
const playerNameHud = document.getElementById("astro-player-name");
const defeatOverlayEl = document.getElementById("astro-defeat-overlay");
const defeatTextEl = document.getElementById("astro-defeat-text");
const watchMatchBtn = document.getElementById("astro-btn-watch");
const goMenuBtn = document.getElementById("astro-btn-menu");
const spectatorIndicatorEl = document.getElementById("astro-spectator-indicator");
const audioOverlayEl = document.getElementById("astro-audio-overlay");
const audioSfxSliderEl = document.getElementById("astro-slider-sonido");
const audioMusicSliderEl = document.getElementById("astro-slider-musica");
const audioConfirmMuteBtn = document.getElementById("astro-btn-confirmar-silencio");
const audioCloseMenuBtn = document.getElementById("astro-btn-cerrar-menu");
const audioExitLobbyBtn = document.getElementById("astro-btn-salir-lobby");
const LOCAL_PLAYER_NAME = resolveLocalPlayerName();
const LOCAL_PLAYER_ID = resolveLocalPlayerId(LOCAL_PLAYER_NAME);
const LOCAL_PLAYER_LABEL = LOCAL_PLAYER_NAME || "Jugador";
const LOCAL_STATE_KEY = `pintagol_astro_state_${LOCAL_PLAYER_ID}`;
const ACTIVE_MATCH_KEY = "pintagol_active_match";
const SEASON_TO_FLOOR_TEXTURE = {
  invierno: "snow.jpg",
  primavera: "grass.jpg",
  otono: "orange.png"
};
const SEASON_TO_SKY_TEXTURE = {
  invierno: "purplesky.jpg",
  primavera: "sky.jpg",
  otono: "orangesky.jpg"
};
let localPlayerColor = PLAYER_COLORS[0];
const QUERY_PARAMS = new URLSearchParams(window.location.search);
const INITIAL_WEAPON_QUERY = (QUERY_PARAMS.get("countryKey") || "").toLowerCase();
const CURRENT_GAME_ID = QUERY_PARAMS.get("game") || "";
const LOCAL_WEAPON_STATE_KEY = `pintagol_astro_weapon_${CURRENT_GAME_ID || "nogame"}_${LOCAL_PLAYER_NAME || LOCAL_PLAYER_ID || "anon"}`;
const SELECTED_SEASON_KEY = resolveSeasonKey();
let pendingInitialWeaponType = null;

function resolveSeasonKey() {
  const byQuery = (QUERY_PARAMS.get("season") || "").toLowerCase();
  if (SEASON_TO_FLOOR_TEXTURE[byQuery]) return byQuery;
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(ACTIVE_MATCH_KEY) || "null");
    const bySession = String((cached && cached.seasonKey) || "").toLowerCase();
    if (SEASON_TO_FLOOR_TEXTURE[bySession]) return bySession;
  } catch (_err) {
    /* no-op */
  }
  return "invierno";
}

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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;

const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());

const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.58);
scene.add(ambientLight);
const sunLight = new THREE.DirectionalLight(0xfff7d6, 0.92);
sunLight.position.set(8, 13, 7.5);
scene.add(sunLight);
const focusTarget = new THREE.Object3D();
scene.add(focusTarget);
const focusLight = new THREE.SpotLight(0xfff1c2, 0.75, 36, Math.PI / 6, 0.42, 1.1);
focusLight.position.set(0, 8, 0);
focusLight.target = focusTarget;
scene.add(focusLight);
applySeasonLightingProfile(SELECTED_SEASON_KEY);

function applySeasonLightingProfile(seasonKey) {
  if (seasonKey === "invierno") {
    ambientLight.color.setHex(0xa5b4fc);
    ambientLight.intensity = 0.46;
    sunLight.color.setHex(0xe2e8f0);
    sunLight.intensity = 1;
    focusLight.color.setHex(0xc4b5fd);
    focusLight.intensity = 0.9;
    focusLight.angle = Math.PI / 6.9;
    renderer.toneMappingExposure = 0.95;
    return;
  }
  if (seasonKey === "otono") {
    ambientLight.color.setHex(0xfde68a);
    ambientLight.intensity = 0.54;
    sunLight.color.setHex(0xfdba74);
    sunLight.intensity = 0.96;
    focusLight.color.setHex(0xfde68a);
    focusLight.intensity = 0.8;
    focusLight.angle = Math.PI / 6.2;
    renderer.toneMappingExposure = 1;
    return;
  }
  ambientLight.color.setHex(0xdbeafe);
  ambientLight.intensity = 0.58;
  sunLight.color.setHex(0xfff7d6);
  sunLight.intensity = 0.92;
  focusLight.color.setHex(0xfff1c2);
  focusLight.intensity = 0.75;
  focusLight.angle = Math.PI / 6;
  renderer.toneMappingExposure = 1.02;
}
const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.96,
  metalness: 0.02
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 1, 1), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
scene.add(ground);

loadTextureFirst(
  texturePathsFor(SEASON_TO_FLOOR_TEXTURE[SELECTED_SEASON_KEY] || "snow.jpg"),
  (snowTex) => {
    prepTex(snowTex, aniso);
    snowTex.wrapS = THREE.RepeatWrapping;
    snowTex.wrapT = THREE.RepeatWrapping;
    snowTex.repeat.set(28, 28);
    groundMaterial.map = snowTex;
    groundMaterial.needsUpdate = true;
  },
  () => {
    /* no-op: mantiene color base */
  }
);

const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(1000, 48, 32),
  new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide })
);
scene.add(skyDome);
loadTextureFirst(
  texturePathsFor(SEASON_TO_SKY_TEXTURE[SELECTED_SEASON_KEY] || "sky.jpg"),
  (skyTex) => {
    skyTex.colorSpace = THREE.SRGBColorSpace;
    skyTex.wrapS = THREE.RepeatWrapping;
    skyTex.wrapT = THREE.ClampToEdgeWrapping;
    skyTex.offset.set(0.25, 0);
    skyDome.material.map = skyTex;
    skyDome.material.needsUpdate = true;
    scene.background = null;
  },
  () => {
    /* no-op: mantiene color de fondo */
  }
);

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
/** Clon del subfusil (mano) para volver a equiparte sin recargar el FBX. */
let gun2HandTemplate = null;
/** Plantilla del modelo de bala cargado desde assets/models/bullet. */
let bulletTemplate = null;
let gun3Template = null;
let gun3Pickup = null;
let shotgunTemplate = null;
let shotgunPickup = null;
let medkitTemplate = null;
let medkitPickup = null;
let drinkTemplate = null;
let drinkPickup = null;
let starTemplate = null;
let starPickup = null;
let bombTemplate = null;
let bombPickup = null;
let pine2Template = null;
let pine3Template = null;
let pineGroup = null;
let localWeaponType = "gun2";
let hasPickedGun3 = false;
let gun3PickupAvailable = false;
let gun3OwnerPlayerId = "";
let hasPickedShotgun = false;
let shotgunPickupAvailable = false;
let shotgunOwnerPlayerId = "";
let medkitAvailable = true;
let medkitOwnerPlayerId = "";
let drinkAvailable = true;
let drinkOwnerPlayerId = "";
let speedBoostUntilMs = 0;
let starAvailable = true;
let starOwnerPlayerId = "";
let immunityUntilMs = 0;
let bombAvailable = true;
let bombOwnerPlayerId = "";
let damageBoostUntilMs = 0;
const activeBullets = [];
let lastShotAt = 0;
let localHits = 0;
let localDefeated = false;
let spectatorMode = false;
let localDamageSeq = 0;
let localShotSeq = 0;
let localLastHitColorHex = 0xffffff;
let isPauseMenuOpen = false;
const remotePlayers = new Map();
const remotePlayersLoading = new Set();
const seenRemoteShotIds = new Set();
const spawnSlotByPlayer = new Map();
const clock = new THREE.Clock();
const gun1ShotSfxPool = [];
const gun3ShotSfxPool = [];
const shotgunShotSfxPool = [];
const itemPickupSfxPool = [];
let lastAmmoboxWeaponSwapAt = 0;
let gun1ShotSfxIndex = 0;
let gun3ShotSfxIndex = 0;
let shotgunShotSfxIndex = 0;
let itemPickupSfxIndex = 0;

function clampVolumePercent(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function getSfxVolume() {
  try {
    const raw = window.localStorage.getItem(AUDIO_SFX_KEY);
    const percent = raw == null ? DEFAULT_SFX_VOLUME_PERCENT : clampVolumePercent(raw, DEFAULT_SFX_VOLUME_PERCENT);
    return percent / 100;
  } catch (_err) {
    return DEFAULT_SFX_VOLUME_PERCENT / 100;
  }
}

function getMusicVolume() {
  try {
    const raw = window.localStorage.getItem(AUDIO_MUSIC_KEY);
    const percent = raw == null ? DEFAULT_MUSIC_VOLUME_PERCENT : clampVolumePercent(raw, DEFAULT_MUSIC_VOLUME_PERCENT);
    return percent / 100;
  } catch (_err) {
    return DEFAULT_MUSIC_VOLUME_PERCENT / 100;
  }
}

function setStoredVolumePercent(key, value) {
  try {
    window.localStorage.setItem(key, String(clampVolumePercent(value, 0)));
  } catch (_err) {
    /* no-op */
  }
}

function applyMusicVolumeToCurrentPage() {
  const bgm = document.getElementById("pintagol-bgm");
  if (!bgm) return;
  bgm.volume = getMusicVolume();
}

function shortestAngleDelta(from, to) {
  const TAU = Math.PI * 2;
  let d = (to - from + Math.PI) % TAU;
  if (d < 0) d += TAU;
  return d - Math.PI;
}

function initGun1ShotSfx() {
  if (gun1ShotSfxPool.length) return;
  const volume = Math.min(1, getSfxVolume() * 0.58);
  for (let i = 0; i < GUN1_SHOT_POOL_SIZE; i += 1) {
    const a = new Audio(GUN1_SHOT_SFX_URL);
    a.preload = "auto";
    a.volume = volume;
    gun1ShotSfxPool.push(a);
  }
}

function initGun3ShotSfx() {
  if (gun3ShotSfxPool.length) return;
  const volume = Math.min(1, getSfxVolume() * 0.61);
  for (let i = 0; i < GUN1_SHOT_POOL_SIZE; i += 1) {
    const a = new Audio(GUN3_SHOT_SFX_URL);
    a.preload = "auto";
    a.volume = volume;
    gun3ShotSfxPool.push(a);
  }
}

function initShotgunShotSfx() {
  if (shotgunShotSfxPool.length) return;
  const volume = Math.min(1, getSfxVolume() * 0.64);
  for (let i = 0; i < GUN1_SHOT_POOL_SIZE; i += 1) {
    const a = new Audio(SHOTGUN_SHOT_SFX_URL);
    a.preload = "auto";
    a.volume = volume;
    shotgunShotSfxPool.push(a);
  }
}

function initItemPickupSfx() {
  if (itemPickupSfxPool.length) return;
  const volume = Math.min(1, getSfxVolume() * 0.72);
  for (let i = 0; i < ITEM_PICKUP_POOL_SIZE; i += 1) {
    const a = new Audio(ITEM_PICKUP_SFX_URL);
    a.preload = "auto";
    a.volume = volume;
    itemPickupSfxPool.push(a);
  }
}

function playGun1ShotSfx() {
  if (!gun1ShotSfxPool.length) return;
  const a = gun1ShotSfxPool[gun1ShotSfxIndex];
  gun1ShotSfxIndex = (gun1ShotSfxIndex + 1) % gun1ShotSfxPool.length;
  if (!a) return;
  try {
    a.volume = Math.min(1, getSfxVolume() * 0.58);
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
    a.volume = Math.min(1, getSfxVolume() * 0.61);
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
    a.volume = Math.min(1, getSfxVolume() * 0.64);
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

function playItemPickupSfx() {
  if (!itemPickupSfxPool.length) return;
  const a = itemPickupSfxPool[itemPickupSfxIndex];
  itemPickupSfxIndex = (itemPickupSfxIndex + 1) % itemPickupSfxPool.length;
  if (!a) return;
  try {
    a.volume = Math.min(1, getSfxVolume() * 0.72);
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
  persistLocalCombatState();
}

function persistLocalWeaponType() {
  try {
    window.sessionStorage.setItem(LOCAL_WEAPON_STATE_KEY, localWeaponType);
  } catch (_err) {
    /* no-op */
  }
}

function loadPersistedLocalWeaponType() {
  try {
    const raw = window.sessionStorage.getItem(LOCAL_WEAPON_STATE_KEY);
    if (!raw || typeof raw !== "string") return null;
    return normalizedWeaponType(raw);
  } catch (_err) {
    return null;
  }
}

function normalizedWeaponType(raw) {
  if (raw === "gun3" || raw === "shotgun" || raw === "gun4") {
    return raw === "gun4" ? "shotgun" : raw;
  }
  return "gun2";
}

function weaponDamageForType(weaponType) {
  const wt = normalizedWeaponType(weaponType);
  let baseDamage = SUBFUSIL_BASE_DAMAGE;
  if (wt === "gun3") baseDamage = SUBFUSIL_BASE_DAMAGE * PISTOL_DAMAGE_MULTIPLIER;
  else if (wt === "shotgun") baseDamage = SUBFUSIL_BASE_DAMAGE * SHOTGUN_DAMAGE_MULTIPLIER;
  const damageBoost = performance.now() < damageBoostUntilMs ? BOMB_DAMAGE_BOOST_MULTIPLIER : 1;
  return Math.max(1, Math.floor(baseDamage * damageBoost));
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

function removeMedkitPickup() {
  if (!medkitPickup) return;
  scene.remove(medkitPickup);
  medkitPickup = null;
}

function spawnMedkitPickup() {
  if (!medkitAvailable || !medkitTemplate || medkitPickup) return;
  medkitPickup = medkitTemplate.clone(true);
  medkitPickup.name = "item-medkit-pickup";
  medkitPickup.position.copy(MEDKIT_PICKUP_CENTER);
  medkitPickup.rotation.set(0, 0.5, 0);
  scene.add(medkitPickup);
}

function applyMedkitPickupState(available, ownerId = "") {
  medkitAvailable = !!available;
  medkitOwnerPlayerId = ownerId || "";
  if (medkitAvailable) spawnMedkitPickup();
  else removeMedkitPickup();
}

function removeDrinkPickup() {
  if (!drinkPickup) return;
  scene.remove(drinkPickup);
  drinkPickup = null;
}

function spawnDrinkPickup() {
  if (!drinkAvailable || !drinkTemplate || drinkPickup) return;
  drinkPickup = drinkTemplate.clone(true);
  drinkPickup.name = "item-drink-pickup";
  drinkPickup.position.copy(DRINK_PICKUP_CENTER);
  drinkPickup.rotation.set(0, 0.3, 0);
  scene.add(drinkPickup);
}

function applyDrinkPickupState(available, ownerId = "") {
  drinkAvailable = !!available;
  drinkOwnerPlayerId = ownerId || "";
  if (drinkAvailable) spawnDrinkPickup();
  else removeDrinkPickup();
}

function applySpeedBoostToLocalPlayer() {
  speedBoostUntilMs = Math.max(speedBoostUntilMs, performance.now() + DRINK_SPEED_BOOST_DURATION_MS);
  setStatus("Bebida agarrada: velocidad aumentada por 12 segundos.", true);
}

function removeStarPickup() {
  if (!starPickup) return;
  scene.remove(starPickup);
  starPickup = null;
}

function spawnStarPickup() {
  if (!starAvailable || !starTemplate || starPickup) return;
  starPickup = starTemplate.clone(true);
  starPickup.name = "item-star-pickup";
  starPickup.position.copy(STAR_PICKUP_CENTER);
  starPickup.rotation.set(0.1, 0.2, 0);
  scene.add(starPickup);
}

function applyStarPickupState(available, ownerId = "") {
  starAvailable = !!available;
  starOwnerPlayerId = ownerId || "";
  if (starAvailable) spawnStarPickup();
  else removeStarPickup();
}

function applyImmunityToLocalPlayer() {
  immunityUntilMs = Math.max(immunityUntilMs, performance.now() + STAR_IMMUNITY_DURATION_MS);
  setStatus("Estrella agarrada: inmune a disparos por 6 segundos.", true);
}

function removeBombPickup() {
  if (!bombPickup) return;
  scene.remove(bombPickup);
  bombPickup = null;
}

function spawnBombPickup() {
  if (!bombAvailable || !bombTemplate || bombPickup) return;
  bombPickup = bombTemplate.clone(true);
  bombPickup.name = "item-bomb-pickup";
  bombPickup.position.copy(BOMB_PICKUP_CENTER);
  bombPickup.rotation.set(0.08, 0.2, 0);
  scene.add(bombPickup);
}

function applyBombPickupState(available, ownerId = "") {
  bombAvailable = !!available;
  bombOwnerPlayerId = ownerId || "";
  if (bombAvailable) spawnBombPickup();
  else removeBombPickup();
}

function applyDamageBoostToLocalPlayer() {
  damageBoostUntilMs = Math.max(damageBoostUntilMs, performance.now() + BOMB_DAMAGE_BOOST_DURATION_MS);
  setStatus("Bomba agarrada: dano x2 por 6 segundos.", true);
}

function applyHealToLocalPlayer(amount = MEDKIT_HEAL_AMOUNT) {
  if (!astroRoot) return false;
  const heal = Math.max(1, Math.floor(Number(amount) || MEDKIT_HEAL_AMOUNT));
  const prevHits = localHits;
  localHits = Math.max(0, localHits - heal);
  if (localHits === prevHits) return false;
  localDamageSeq += 1;
  updateNameTag(astroRoot, LOCAL_PLAYER_LABEL, localHits / MAX_HITS);
  persistLocalCombatState();
  setStatus("Botiquin usado: -5 de dano acumulado.", true);
  return true;
}

function tryConsumeMedkitLocal() {
  if (!medkitAvailable || !medkitPickup || !astroRoot || localDefeated) return;
  const dx = astroRoot.position.x - medkitPickup.position.x;
  const dz = astroRoot.position.z - medkitPickup.position.z;
  if (dx * dx + dz * dz > MEDKIT_PICKUP_RADIUS * MEDKIT_PICKUP_RADIUS) return;
  applyMedkitPickupState(false, LOCAL_PLAYER_ID);
  playItemPickupSfx();
  const healed = applyHealToLocalPlayer(MEDKIT_HEAL_AMOUNT);
  sendSyncMessage({
    tipo: "medkitState",
    available: false,
    ownerPlayerId: LOCAL_PLAYER_ID
  });
  if (healed) {
    sendPose();
    sendSyncMessage({
      tipo: "damage",
      playerId: LOCAL_PLAYER_ID,
      hits: localHits,
      defeated: localDefeated,
      damageSeq: localDamageSeq
    });
  }
}

function tryConsumeDrinkLocal() {
  if (!drinkAvailable || !drinkPickup || !astroRoot || localDefeated) return;
  const dx = astroRoot.position.x - drinkPickup.position.x;
  const dz = astroRoot.position.z - drinkPickup.position.z;
  if (dx * dx + dz * dz > DRINK_PICKUP_RADIUS * DRINK_PICKUP_RADIUS) return;
  applyDrinkPickupState(false, LOCAL_PLAYER_ID);
  playItemPickupSfx();
  applySpeedBoostToLocalPlayer();
  sendSyncMessage({
    tipo: "drinkState",
    available: false,
    ownerPlayerId: LOCAL_PLAYER_ID
  });
}

function tryConsumeStarLocal() {
  if (!starAvailable || !starPickup || !astroRoot || localDefeated) return;
  const dx = astroRoot.position.x - starPickup.position.x;
  const dz = astroRoot.position.z - starPickup.position.z;
  if (dx * dx + dz * dz > STAR_PICKUP_RADIUS * STAR_PICKUP_RADIUS) return;
  applyStarPickupState(false, LOCAL_PLAYER_ID);
  playItemPickupSfx();
  applyImmunityToLocalPlayer();
  sendSyncMessage({
    tipo: "starState",
    available: false,
    ownerPlayerId: LOCAL_PLAYER_ID
  });
}

function tryConsumeBombLocal() {
  if (!bombAvailable || !bombPickup || !astroRoot || localDefeated) return;
  const dx = astroRoot.position.x - bombPickup.position.x;
  const dz = astroRoot.position.z - bombPickup.position.z;
  if (dx * dx + dz * dz > BOMB_PICKUP_RADIUS * BOMB_PICKUP_RADIUS) return;
  applyBombPickupState(false, LOCAL_PLAYER_ID);
  playItemPickupSfx();
  applyDamageBoostToLocalPlayer();
  sendSyncMessage({
    tipo: "bombState",
    available: false,
    ownerPlayerId: LOCAL_PLAYER_ID
  });
}

function equipGun2Local(opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const fromAmmobox = !!o.fromAmmobox;
  if (!gun2HandTemplate || !astroRoot) return;
  if (gun2Root && gun2Root.parent) {
    gun2Root.parent.remove(gun2Root);
    gun2Root = null;
  }
  const g2 = gun2HandTemplate.clone(true);
  setupGunMesh(g2, null, WORLD_GROUP_SCALE, gun2World, gunSetupOptions(GUN2_SCALE, GUN2_BASE_ROTATION));
  g2.name = "weapon-gun2";
  gun2Root = g2;
  astroRoot.add(g2);
  hasPickedGun3 = false;
  hasPickedShotgun = false;
  setWeaponType("gun2");
  if (fromAmmobox) {
    setStatus("Caja de municion: subfusil.", true);
  }
}

function equipGun3Local(opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const force = !!o.force;
  const fromInitial = !!o.fromInitial;
  const fromAmmobox = !!o.fromAmmobox;
  if (!gun3Template || !astroRoot) return;
  if (!force) {
    if (hasPickedGun3 || !gun3PickupAvailable) return;
    hasPickedGun3 = true;
    hasPickedShotgun = false;
    applyGun3PickupState(false, LOCAL_PLAYER_ID);
  } else {
    hasPickedGun3 = true;
    hasPickedShotgun = false;
  }
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
  if (!force) {
    sendSyncMessage({
      tipo: "gun3State",
      available: false,
      ownerPlayerId: LOCAL_PLAYER_ID
    });
  }
  if (fromAmmobox) {
    setStatus("Caja de municion: pistola.", true);
  }
  if (fromInitial) {
    pendingInitialWeaponType = null;
  }
}

function equipShotgunLocal(opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const force = !!o.force;
  const fromInitial = !!o.fromInitial;
  const fromAmmobox = !!o.fromAmmobox;
  if (!shotgunTemplate || !astroRoot) return;
  if (!force) {
    if (hasPickedShotgun || !shotgunPickupAvailable) return;
    hasPickedShotgun = true;
    hasPickedGun3 = false;
    applyShotgunPickupState(false, LOCAL_PLAYER_ID);
  } else {
    hasPickedShotgun = true;
    hasPickedGun3 = false;
  }
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
  if (!force) {
    sendSyncMessage({
      tipo: "shotgunState",
      available: false,
      ownerPlayerId: LOCAL_PLAYER_ID
    });
  }
  if (fromAmmobox) {
    setStatus("Caja de municion: escopeta.", true);
  }
  if (fromInitial) {
    pendingInitialWeaponType = null;
  }
}

function tryAmmoboxRandomWeaponSwap(nowMs) {
  if (!astroRoot || localDefeated) return;
  if (nowMs - lastAmmoboxWeaponSwapAt < AMMOBOX_WEAPON_SWAP_COOLDOWN_MS) return;
  const ax = AMMOBOX_CONFIG.x;
  const az = AMMOBOX_CONFIG.z;
  const dx = astroRoot.position.x - ax;
  const dz = astroRoot.position.z - az;
  if (dx * dx + dz * dz > AMMOBOX_INTERACTION_RADIUS * AMMOBOX_INTERACTION_RADIUS) return;
  const pool = [];
  if (gun2HandTemplate) pool.push("gun2");
  if (gun3Template) pool.push("gun3");
  if (shotgunTemplate) pool.push("shotgun");
  if (!pool.length) return;
  const different = pool.filter((w) => w !== localWeaponType);
  if (!different.length) return;
  const pick = different[Math.floor(Math.random() * different.length)];
  lastAmmoboxWeaponSwapAt = nowMs;
  playItemPickupSfx();
  if (pick === "gun2") {
    equipGun2Local({ fromAmmobox: true });
  } else if (pick === "gun3") {
    equipGun3Local({ force: true, fromAmmobox: true });
  } else {
    equipShotgunLocal({ force: true, fromAmmobox: true });
  }
  if (getVentanaId() !== "2") {
    sendPose();
  }
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

function updateMedkitPickup(nowMs) {
  if (!medkitPickup) return;
  const t = nowMs * 0.001;
  medkitPickup.rotation.y = 0.4 + t * 1.35;
  medkitPickup.position.y = MEDKIT_PICKUP_CENTER.y + Math.sin(t * 2.2) * 0.2;
}

function updateDrinkPickup(nowMs) {
  if (!drinkPickup) return;
  const t = nowMs * 0.001;
  drinkPickup.rotation.y = 0.3 + t * 1.55;
  drinkPickup.position.y = DRINK_PICKUP_CENTER.y + Math.sin(t * 2.5) * 0.2;
}

function updateStarPickup(nowMs) {
  if (!starPickup) return;
  const t = nowMs * 0.001;
  starPickup.rotation.y = 0.2 + t * 1.95;
  starPickup.position.y = STAR_PICKUP_CENTER.y + Math.sin(t * 2.9) * 0.22;
}

function updateBombPickup(nowMs) {
  if (!bombPickup) return;
  const t = nowMs * 0.001;
  bombPickup.rotation.y = 0.18 + t * 1.65;
  bombPickup.position.y = BOMB_PICKUP_CENTER.y + Math.sin(t * 2.4) * 0.2;
}

function updateLocalEffectTimer(nowMs) {
  if (!effectTimerEl) return;
  const speedRemaining = Math.max(0, speedBoostUntilMs - nowMs);
  const immunityRemaining = Math.max(0, immunityUntilMs - nowMs);
  const damageRemaining = Math.max(0, damageBoostUntilMs - nowMs);
  const labels = [];
  if (speedRemaining > 0) labels.push(`Bebida: ${(speedRemaining / 1000).toFixed(1)}s`);
  if (immunityRemaining > 0) labels.push(`Inmunidad: ${(immunityRemaining / 1000).toFixed(1)}s`);
  if (damageRemaining > 0) labels.push(`Dano x2: ${(damageRemaining / 1000).toFixed(1)}s`);
  effectTimerEl.textContent = labels.join(" | ");
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
        lastHitColorHex: localLastHitColorHex,
        weaponType: localWeaponType
      })
    );
    persistLocalWeaponType();
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
    const weaponType = normalizedWeaponType(parsed.weaponType);
    return { hits, defeated, damageSeq, lastHitColorHex, weaponType };
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
  const now = !!remotePlayerState.defeated;
  const was = remotePlayerState._wasDefeated === true;
  if (now && !was) {
    const p = remotePlayerState.group.position.clone();
    p.y += 1.15;
    playAstronautDeathExplosion(
      scene,
      p,
      remotePlayerState.colorHex ?? PLAYER_COLORS[0],
      registerPintagolSceneFrameHandler
    );
    window.setTimeout(() => setPlayerEliminatedVisual(remotePlayerState.group, true), HIDE_DELAY_MS);
  } else {
    setPlayerEliminatedVisual(remotePlayerState.group, now);
  }
  remotePlayerState._wasDefeated = now;
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

function enterSpectatorMode(message, options = {}) {
  if (spectatorMode) return;
  spectatorMode = true;
  setAimMode(false);
  fireQueued = false;
  keys.w = keys.a = keys.s = keys.d = false;
  keysGun2.c = keysGun2.v = keysGun2.b = keysGun2.n = false;
  const skipFx = options && options.skipExplosion === true;
  if (!skipFx && astroRoot) {
    const p = astroRoot.position.clone();
    p.y += 1.2;
    playAstronautDeathExplosion(scene, p, localPlayerColor, registerPintagolSceneFrameHandler);
    window.setTimeout(() => setPlayerEliminatedVisual(astroRoot, true), HIDE_DELAY_MS);
  } else {
    setPlayerEliminatedVisual(astroRoot, true);
  }
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
  const normalizedLabel = (labelText && String(labelText).trim()) || "Jugador";
  const normalizedHit = Math.max(0, Math.min(1, Math.round(hitRatio * 1000) / 1000));
  const cache = playerGroup.userData && playerGroup.userData.nameTagCache;
  if (cache && cache.label === normalizedLabel && cache.hitRatio === normalizedHit) {
    return;
  }
  const prev = playerGroup.getObjectByName("astro-gametag");
  if (prev) {
    if (prev.material?.map) prev.material.map.dispose?.();
    prev.material?.dispose?.();
    playerGroup.remove(prev);
  }
  const sprite = createNameTagSprite(normalizedLabel, normalizedHit);
  if (sprite) playerGroup.add(sprite);
  playerGroup.userData = playerGroup.userData || {};
  playerGroup.userData.nameTagCache = {
    label: normalizedLabel,
    hitRatio: normalizedHit
  };
}

function scheduleNonCriticalLoad(task, delayMs = 180) {
  if (typeof task !== "function") return;
  const run = () => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => task(), { timeout: 600 });
      return;
    }
    window.setTimeout(task, 0);
  };
  window.setTimeout(run, delayMs);
}

function pathsFor(rel) {
  return MODEL_BASES.map((base) => base + rel);
}

function texturePathsFor(rel) {
  return TEXTURE_BASES.map((base) => base + rel);
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
  msg.medkitAvailable = medkitAvailable;
  msg.medkitOwnerPlayerId = medkitOwnerPlayerId;
  msg.drinkAvailable = drinkAvailable;
  msg.drinkOwnerPlayerId = drinkOwnerPlayerId;
  msg.starAvailable = starAvailable;
  msg.starOwnerPlayerId = starOwnerPlayerId;
  msg.bombAvailable = bombAvailable;
  msg.bombOwnerPlayerId = bombOwnerPlayerId;
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
  if (d.tipo === "medkitState") {
    applyMedkitPickupState(d.available !== false, d.ownerPlayerId || "");
    return;
  }
  if (d.tipo === "drinkState") {
    applyDrinkPickupState(d.available !== false, d.ownerPlayerId || "");
    return;
  }
  if (d.tipo === "starState") {
    applyStarPickupState(d.available !== false, d.ownerPlayerId || "");
    return;
  }
  if (d.tipo === "bombState") {
    applyBombPickupState(d.available !== false, d.ownerPlayerId || "");
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
  if (typeof d.medkitAvailable === "boolean") {
    applyMedkitPickupState(d.medkitAvailable, d.medkitOwnerPlayerId || "");
  }
  if (typeof d.drinkAvailable === "boolean") {
    applyDrinkPickupState(d.drinkAvailable, d.drinkOwnerPlayerId || "");
  }
  if (typeof d.starAvailable === "boolean") {
    applyStarPickupState(d.starAvailable, d.starOwnerPlayerId || "");
  }
  if (typeof d.bombAvailable === "boolean") {
    applyBombPickupState(d.bombAvailable, d.bombOwnerPlayerId || "");
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
  const applied = applyHitToLocalPlayer(hitColorHex, hitDamage);
  if (!applied) return;
  addHitStain(astroRoot, hitColorHex);
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

/**
 * Dano externo al jugador local (p.ej. toque zombie) sin depender de que el
 * transporte de red se refleje en la misma pestaña.
 */
export function applyPintagolExternalLocalHit(hitColorHex = 0xffffff, damage = 1) {
  if (!astroRoot || localDefeated) return false;
  const color = typeof hitColorHex === "number" ? hitColorHex : 0xffffff;
  const delta = Math.max(1, Math.floor(Number(damage) || 1));
  const applied = applyHitToLocalPlayer(color, delta);
  if (!applied) return false;
  addHitStain(astroRoot, color);
  sendPose();
  sendSyncMessage({
    tipo: "damage",
    playerId: LOCAL_PLAYER_ID,
    hits: localHits,
    defeated: localDefeated,
    hitColorHex: color,
    damageSeq: localDamageSeq
  });
  return true;
}

function resetGameplayInputs() {
  keys.w = keys.a = keys.s = keys.d = false;
  keysGun2.c = keysGun2.v = keysGun2.b = keysGun2.n = false;
  fireQueued = false;
  setAimMode(false);
}

function syncAudioMenuFromStorage() {
  if (audioSfxSliderEl) {
    audioSfxSliderEl.value = String(clampVolumePercent(getSfxVolume() * 100, DEFAULT_SFX_VOLUME_PERCENT));
  }
  if (audioMusicSliderEl) {
    audioMusicSliderEl.value = String(clampVolumePercent(getMusicVolume() * 100, DEFAULT_MUSIC_VOLUME_PERCENT));
  }
}

function applyAudioMenuValues() {
  const sfxPercent = audioSfxSliderEl ? clampVolumePercent(audioSfxSliderEl.value, DEFAULT_SFX_VOLUME_PERCENT) : DEFAULT_SFX_VOLUME_PERCENT;
  const musicPercent = audioMusicSliderEl
    ? clampVolumePercent(audioMusicSliderEl.value, DEFAULT_MUSIC_VOLUME_PERCENT)
    : DEFAULT_MUSIC_VOLUME_PERCENT;
  setStoredVolumePercent(AUDIO_SFX_KEY, sfxPercent);
  setStoredVolumePercent(AUDIO_MUSIC_KEY, musicPercent);
  applyMusicVolumeToCurrentPage();
}

function setPauseMenuVisible(visible) {
  isPauseMenuOpen = !!visible;
  if (audioOverlayEl) audioOverlayEl.hidden = !isPauseMenuOpen;
  if (isPauseMenuOpen) {
    resetGameplayInputs();
    syncAudioMenuFromStorage();
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock?.();
    }
  } else if (canvas) {
    canvas.focus({ preventScroll: true });
  }
}

function bindAudioPauseMenu() {
  syncAudioMenuFromStorage();
  if (audioSfxSliderEl) {
    audioSfxSliderEl.addEventListener("input", applyAudioMenuValues);
  }
  if (audioMusicSliderEl) {
    audioMusicSliderEl.addEventListener("input", applyAudioMenuValues);
  }
  if (audioConfirmMuteBtn) {
    audioConfirmMuteBtn.addEventListener("click", () => {
      if (audioSfxSliderEl) audioSfxSliderEl.value = "0";
      if (audioMusicSliderEl) audioMusicSliderEl.value = "0";
      applyAudioMenuValues();
      setStatus("Audio silenciado para esta y siguientes partidas.", true);
    });
  }
  if (audioCloseMenuBtn) {
    audioCloseMenuBtn.addEventListener("click", () => {
      setPauseMenuVisible(false);
    });
  }
  if (audioExitLobbyBtn) {
    audioExitLobbyBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }
}

function bindKeys() {
  window.addEventListener(
    "keydown",
    (e) => {
      const c = e.code;
      if (c === "KeyP") {
        setPauseMenuVisible(!isPauseMenuOpen);
        e.preventDefault();
        return;
      }
      if (isPauseMenuOpen) return;
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
      if (isPauseMenuOpen) return;
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
    resetGameplayInputs();
  });
}

function bindMouseLook() {
  if (!canvas) return;
  canvas.addEventListener("click", () => {
    if (isPauseMenuOpen) return;
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
    if (isPauseMenuOpen) return;
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
  if (isPauseMenuOpen || !fireQueued || !astroRoot || !bulletTemplate || localDefeated) return;
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
  if (localDefeated || !astroRoot) return false;
  if (performance.now() < immunityUntilMs) {
    return false;
  }
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
  return true;
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
        const applied = applyHitToLocalPlayer(hitColorHex, hitDamage);
        if (!applied) {
          consumed = true;
        } else {
          addHitStain(astroRoot, hitColorHex);
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
  const nowMs = performance.now();
  const nowSeconds = nowMs * 0.001;
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
  const t = nowSeconds;

  if (!spectatorMode) {
    let mx = Math.sin(astroRoot.rotation.y) * forward + -Math.cos(astroRoot.rotation.y) * strafe;
    let mz = Math.cos(astroRoot.rotation.y) * forward + Math.sin(astroRoot.rotation.y) * strafe;
    const l = Math.hypot(mx, mz) || 1;
    mx /= l;
    mz /= l;
    const speedMultiplier = nowMs < speedBoostUntilMs ? DRINK_SPEED_BOOST_MULTIPLIER : 1;
    const sp = ASTRO_MOVE_SPEED * speedMultiplier;
    if (mx || mz) {
      const nx = Math.max(-ASTRO_BORDE, Math.min(ASTRO_BORDE, wander.x + mx * sp));
      const nz = Math.max(-ASTRO_BORDE, Math.min(ASTRO_BORDE, wander.z + mz * sp));
      const resolved = resolveMapPlayerXZClamped(nx, nz, ASTRO_BORDE);
      wander.x = resolved.x;
      wander.z = resolved.z;
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
  if (astroRoot && !spectatorMode) {
    focusTarget.position.set(astroRoot.position.x, astroRoot.position.y + 1.2, astroRoot.position.z);
    focusLight.position.set(astroRoot.position.x + 3.1, astroRoot.position.y + 7.4, astroRoot.position.z + 2.3);
  } else {
    const spectatorTarget = findSpectatorTarget();
    if (spectatorTarget) {
      focusTarget.position.set(spectatorTarget.position.x, spectatorTarget.position.y + 1.2, spectatorTarget.position.z);
      focusLight.position.set(spectatorTarget.position.x + 3.1, spectatorTarget.position.y + 7.4, spectatorTarget.position.z + 2.3);
    }
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

  shootIfReady(nowMs);
  updateGun3Pickup(nowMs);
  updateShotgunPickup(nowMs);
  updateMedkitPickup(nowMs);
  updateDrinkPickup(nowMs);
  updateStarPickup(nowMs);
  updateBombPickup(nowMs);
  tryConsumeMedkitLocal();
  tryConsumeDrinkLocal();
  tryConsumeStarLocal();
  tryConsumeBombLocal();
  tryAmmoboxRandomWeaponSwap(nowMs);
  updateLocalEffectTimer(nowMs);
  updateBullets(scene, activeBullets, dt);
  processBulletHits();
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
  // Carga crítica para que el jugador aparezca rápido y jugable.
  loadBulletTemplate();
  loadGun2AndPlace(astroGroup);
  // Pickups/modelos secundarios en segundo plano para acelerar arranque.
  scheduleNonCriticalLoad(loadGun3Template, 220);
  scheduleNonCriticalLoad(loadShotgunTemplate, 280);
  scheduleNonCriticalLoad(loadMedkitTemplate, 340);
  scheduleNonCriticalLoad(loadDrinkTemplate, 400);
  scheduleNonCriticalLoad(loadStarTemplate, 460);
  scheduleNonCriticalLoad(loadBombTemplate, 500);
  scheduleNonCriticalLoad(loadPine2Template, 520);
  scheduleNonCriticalLoad(loadPine3Template, 580);
  scheduleNonCriticalLoad(() => loadMapCabin({ scene, aniso, pathsFor }), 640);
  scheduleNonCriticalLoad(() => loadMapCasa({ scene, aniso, pathsFor }), 700);
  scheduleNonCriticalLoad(() => loadMapPuente({ scene, aniso, pathsFor }), 760);
  scheduleNonCriticalLoad(() => loadMapAmmobox({ scene, aniso, pathsFor }), 820);
  scheduleNonCriticalLoad(() => loadMapPozoAgua({ scene, aniso, pathsFor }), 880);
}

function createFallbackMedkitTemplate() {
  var group = new THREE.Group();
  var body = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.7, 1),
    new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.5, metalness: 0.08 })
  );
  group.add(body);
  var crossMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.42, metalness: 0.04 });
  var crossH = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.18, 1.02), crossMat);
  crossH.position.y = 0.01;
  crossH.position.z = 0.02;
  group.add(crossH);
  var crossV = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 1.02), crossMat);
  crossV.position.y = 0.01;
  crossV.position.z = 0.02;
  group.add(crossV);
  group.scale.setScalar(0.24);
  return group;
}

function applyWhiteTexturedMaterials(obj, texture) {
  obj.traverse((child) => {
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

function loadMedkitTemplate() {
  loadTextureFirst(
    pathsFor("medkit/medkit.png"),
    (medkitTex) => {
      prepTex(medkitTex, aniso);
      loadObjFirst(
        pathsFor("medkit/medkit.obj"),
        (medkitObj) => {
          applyWhiteTexturedMaterials(medkitObj, medkitTex);
          medkitObj.scale.setScalar(0.18 * WORLD_GROUP_SCALE);
          medkitTemplate = medkitObj;
          spawnMedkitPickup();
        },
        () => {
          medkitTemplate = createFallbackMedkitTemplate();
          spawnMedkitPickup();
        }
      );
    },
    () => {
      loadObjFirst(
        pathsFor("medkit/medkit.obj"),
        (medkitObj) => {
          applyWhiteTexturedMaterials(medkitObj, null);
          medkitObj.scale.setScalar(0.18 * WORLD_GROUP_SCALE);
          medkitTemplate = medkitObj;
          spawnMedkitPickup();
        },
        () => {
          medkitTemplate = createFallbackMedkitTemplate();
          spawnMedkitPickup();
        }
      );
    }
  );
}

function loadDrinkTemplate() {
  loadTextureFirst(
    pathsFor("drink/drink.jpg"),
    (drinkTex) => {
      prepTex(drinkTex, aniso);
      loadFbxFirst(
        pathsFor("drink/drink.fbx"),
        (drinkObj) => {
          applyWhiteTexturedMaterials(drinkObj, drinkTex);
          drinkObj.scale.setScalar(0.008 * WORLD_GROUP_SCALE);
          drinkTemplate = drinkObj;
          spawnDrinkPickup();
        },
        () => {
          drinkTemplate = null;
        }
      );
    },
    () => {
      loadFbxFirst(
        pathsFor("drink/drink.fbx"),
        (drinkObj) => {
          applyWhiteTexturedMaterials(drinkObj, null);
          drinkObj.scale.setScalar(0.008 * WORLD_GROUP_SCALE);
          drinkTemplate = drinkObj;
          spawnDrinkPickup();
        },
        () => {
          drinkTemplate = null;
        }
      );
    }
  );
}

function applyStarMaterials(obj, texture) {
  obj.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((material) => {
      if (!material) return;
      if (texture) material.map = texture;
      if (material.map) {
        material.map.colorSpace = THREE.SRGBColorSpace;
        material.map.needsUpdate = true;
      }
      if (material.color && material.color.setHex) material.color.setHex(0xffffff);
      if (material.emissive && material.emissive.setHex) material.emissive.setHex(0x000000);
      if (material.emissiveIntensity != null) material.emissiveIntensity = 0;
      material.needsUpdate = true;
    });
  });
}

function loadStarTemplate() {
  const starObjPaths = [...pathsFor("star/star.obj"), ...pathsFor("star/Shine Sprite.obj")];
  const starTexPaths = [...pathsFor("star/star.jpeg"), ...pathsFor("star/star.jpg")];
  loadTextureFirst(
    starTexPaths,
    (starTex) => {
      prepTex(starTex, aniso);
      loadObjFirst(
        starObjPaths,
        (starObj) => {
          applyStarMaterials(starObj, starTex);
          starObj.scale.setScalar(0.05 * WORLD_GROUP_SCALE);
          starTemplate = starObj;
          spawnStarPickup();
        },
        () => {
          starTemplate = null;
        }
      );
    },
    () => {
      loadObjFirst(
        starObjPaths,
        (starObj) => {
          applyStarMaterials(starObj, null);
          starObj.scale.setScalar(0.05 * WORLD_GROUP_SCALE);
          starTemplate = starObj;
          spawnStarPickup();
        },
        () => {
          starTemplate = null;
        }
      );
    }
  );
}

function loadBombTemplate() {
  loadObjFirst(
    pathsFor("bomb/bomb.obj"),
    (bombObj) => {
      bombObj.traverse((child) => {
        if (!child.isMesh) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((material) => {
          if (!material) return;
          if (material.map) material.map = null;
          if (material.color && material.color.setHex) material.color.setHex(0x111111);
          if (material.emissive && material.emissive.setHex) material.emissive.setHex(0x000000);
          if (material.roughness != null) material.roughness = 0.65;
          if (material.metalness != null) material.metalness = 0.12;
          material.needsUpdate = true;
        });
      });
      bombObj.scale.setScalar(0.06 * WORLD_GROUP_SCALE);
      bombTemplate = bombObj;
      spawnBombPickup();
    },
    () => {
      bombTemplate = null;
    }
  );
}

function applyPineMaterials(obj) {
  obj.traverse((child) => {
    if (!child.isMesh) return;
    if (!child.material) child.material = new THREE.MeshStandardMaterial({ color: 0x3f7d3a });
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((material) => {
      if (!material) return;
      if (!material.map && material.color && material.color.getHex() === 0xffffff) {
        material.color.setHex(0x3f7d3a);
      }
      if (material.roughness != null) material.roughness = 0.9;
      if (material.metalness != null) material.metalness = 0.02;
      material.needsUpdate = true;
    });
  });
}

function clearPineGroup() {
  if (!pineGroup) return;
  scene.remove(pineGroup);
  pineGroup = null;
}

function spawnPines() {
  clearPineGroup();
  const hasAnyTemplate = !!pine2Template || !!pine3Template;
  if (!hasAnyTemplate) return;
  const group = new THREE.Group();
  group.name = "pines-group";
  // Decoración: no forman parte de `map-structure-collisions` (el avatar las puede atravesar).
  PINE_LAYOUT.forEach((cfg) => {
    const template = cfg.model === "pine3" ? pine3Template : pine2Template;
    if (!template) return;
    const pine = template.clone(true);
    pine.position.set(cfg.x, -0.02, cfg.z);
    pine.rotation.set(0, cfg.rotY || 0, 0);
    pine.scale.setScalar((cfg.scale || 0.22) * WORLD_GROUP_SCALE);
    group.add(pine);
  });
  if (!group.children.length) return;
  pineGroup = group;
  scene.add(group);
}

function loadPine2Template() {
  loadObjFirst(
    [...pathsFor("pine/pine2.obj"), ...pathsFor("Pine/pine2.obj")],
    (pineObj) => {
      applyPineMaterials(pineObj);
      pine2Template = pineObj;
      spawnPines();
    },
    () => {
      pine2Template = null;
    }
  );
}

function loadPine3Template() {
  loadObjFirst(
    [...pathsFor("pine/pine3.obj"), ...pathsFor("Pine/pine3.obj")],
    (pineObj) => {
      applyPineMaterials(pineObj);
      pine3Template = pineObj;
      spawnPines();
    },
    () => {
      pine3Template = null;
    }
  );
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
          if (pendingInitialWeaponType === "gun3") {
            equipGun3Local({ force: true, fromInitial: true });
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
          if (pendingInitialWeaponType === "gun3") {
            equipGun3Local({ force: true, fromInitial: true });
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
          if (pendingInitialWeaponType === "shotgun") {
            equipShotgunLocal({ force: true, fromInitial: true });
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
          if (pendingInitialWeaponType === "shotgun") {
            equipShotgunLocal({ force: true, fromInitial: true });
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
          _wasDefeated: !!remoteDefeated,
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
  localWeaponType = "gun2";
  hasPickedGun3 = false;
  hasPickedShotgun = false;
  gun3PickupAvailable = false;
  gun3OwnerPlayerId = "";
  shotgunPickupAvailable = false;
  shotgunOwnerPlayerId = "";
  medkitAvailable = true;
  medkitOwnerPlayerId = "";
  drinkAvailable = true;
  drinkOwnerPlayerId = "";
  speedBoostUntilMs = 0;
  starAvailable = true;
  starOwnerPlayerId = "";
  immunityUntilMs = 0;
  bombAvailable = true;
  bombOwnerPlayerId = "";
  damageBoostUntilMs = 0;
  removeGun3Pickup();
  removeShotgunPickup();
  removeMedkitPickup();
  removeDrinkPickup();
  removeStarPickup();
  removeBombPickup();
  const persistedState = loadPersistedLocalCombatState();
  if (persistedState) {
    localHits = persistedState.hits;
    localDefeated = persistedState.defeated;
    localDamageSeq = Math.max(localDamageSeq, persistedState.damageSeq);
    localLastHitColorHex = persistedState.lastHitColorHex;
    localWeaponType = normalizedWeaponType(persistedState.weaponType || localWeaponType);
  }
  const persistedWeaponType = loadPersistedLocalWeaponType();
  if (persistedWeaponType) {
    localWeaponType = persistedWeaponType;
  }
  if ((!persistedState || !persistedState.weaponType) && !persistedWeaponType) {
    localWeaponType = normalizedWeaponType(INITIAL_WEAPON_QUERY || localWeaponType || "gun2");
  }
  setPlayerEliminatedVisual(astroRoot, false);
  setDefeatOverlayVisible(false);
  updateNameTag(astroGroup, LOCAL_PLAYER_LABEL, localHits / MAX_HITS);
  if (localDefeated) {
    enterSpectatorMode("Ya estabas eliminado. Sigues en modo espectador.", { skipExplosion: true });
    setStatus("Modo espectador restaurado tras recarga.", false);
  } else {
    persistLocalCombatState();
    updateSpectatorIndicator();
  }
  recomputePlayerColors();
  if (gun2) {
    gun2HandTemplate = gun2.clone(true);
    gun2Root = gun2;
    astroGroup.add(gun2);
    gun2.position.set(gun2World.x, gun2World.y, gun2World.z);
  }
  spawnMedkitPickup();
  spawnDrinkPickup();
  spawnStarPickup();
  spawnBombPickup();
  if (localWeaponType === "gun3") {
    pendingInitialWeaponType = "gun3";
    equipGun3Local({ force: true, fromInitial: true });
  } else if (localWeaponType === "shotgun") {
    pendingInitialWeaponType = "shotgun";
    equipShotgunLocal({ force: true, fromInitial: true });
  } else {
    pendingInitialWeaponType = null;
  }
  setStatus("Listo. WASD mover · mouse camara/personaje · click izquierdo dispara.", true);
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
bindAudioPauseMenu();
applyMusicVolumeToCurrentPage();
initGun1ShotSfx();
initGun3ShotSfx();
initShotgunShotSfx();
initItemPickupSfx();
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

/** Contexto para props de mapa (mismas rutas/anisotropía que en batalla). Útil en modo zombie. */
export function getPintagolMapLoadContext() {
  return { scene, aniso, pathsFor };
}

export function getPintagolLocalPlayerId() {
  return LOCAL_PLAYER_ID;
}

export function sendPintagolVistaMessage(p) {
  if (p && typeof p === "object") {
    sendSyncMessage(p);
  }
}
