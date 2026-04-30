/**
 * Modo zombie: barra de vida propia (5 celdas, sin nombre) en espacio mundial;
 * al llenar (5 balas) el mesh desaparece para todos. Sincronía por vista.
 */
import * as THREE from "three";
import { loadFbxFirst } from "../astro-sync-assets.js";
import {
  registerPintagolSceneBulletHandler,
  registerPintagolSceneFrameHandler,
  registerPintagolZombieVistaHandler,
  registerPintagolPedirSyncListener,
  setPintagolZombieSyncForPose,
  getPintagolSyncScene,
  getPintagolLocalPlayerId,
  sendPintagolVistaMessage
} from "../astro-sync.js";

const ZOMBIE_MAX_HITS = 5;
const HIT_AABB_PAD = 0.45;
/** Tamaño visual en unidades de mundo (no anidado bajo el zombie con scale 0.01). */
const ZOMBIE_BAR_WORLD_W = 3.2;
const ZOMBIE_BAR_WORLD_H = 0.42;
const ZOMBIE_BAR_Y_MARGIN = 0.35;
const MODEL_BASES = ["assets/models/", "/assets/models/", "../assets/models/"];
const SEG_STEPS = 12;

function pathsFor(rel) {
  return MODEL_BASES.map((b) => b + rel);
}

const _pA = new THREE.Vector3();
const _pB = new THREE.Vector3();
const _boxT = new THREE.Box3();
const _szT = new THREE.Vector3();
let zombieModel = null;
let zombieWorldHitAabb = null;
/** Contenedor en espacio mundial: el hijo (sprite) no hereda el scale 0.0115 del FBX, así se ve. */
let zombieBarAnchor = null;
let zombieBarSprite = null;
let zombieHits = 0;
let zombieDefeated = false;
/** Estado de red recibido antes de que el FBX termine de cargar. */
let pendingZombieVista = null;
let unregBullet;
let unregFrame;
let unregVista;
let unregPedir;

/** Replicado en cada mensaje `modelo` (misma tasa que posición) para que todos vean vida/estado al unísono. */
function getZombieSyncForPose() {
  if (zombieDefeated) {
    return { hits: ZOMBIE_MAX_HITS, maxHits: ZOMBIE_MAX_HITS, defeated: true };
  }
  if (pendingZombieVista && pendingZombieVista.defeated) {
    return { hits: ZOMBIE_MAX_HITS, maxHits: ZOMBIE_MAX_HITS, defeated: true };
  }
  var h = zombieHits;
  if (pendingZombieVista && !pendingZombieVista.defeated) {
    h = Math.max(h, pendingZombieVista.hits | 0);
  }
  return { hits: Math.min(ZOMBIE_MAX_HITS, h), maxHits: ZOMBIE_MAX_HITS, defeated: false };
}

function rebuildZombieWorldHitAabb() {
  zombieWorldHitAabb = null;
  if (!zombieModel) return;
  zombieModel.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(zombieModel);
  if (b.isEmpty()) return;
  b.expandByScalar(HIT_AABB_PAD);
  zombieWorldHitAabb = b;
}

/**
 * Barra de enemigo: 5 celdas, sin nombre; celdas dañadas en rojo (resistencia = 5 balas).
 * Distinta al GameTag de jugador (llevaba nombre y 20 toques en astro-sync).
 */
function buildZombieHpBarTexture() {
  const w = 512;
  const h = 80;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const pad = 4;
  const n = ZOMBIE_MAX_HITS;
  const gap = 4;
  const cellW = (w - pad * 2 - (n - 1) * gap) / n;
  const y0 = 8;
  const hCell = h - 16;
  for (var i = 0; i < n; i += 1) {
    const x = pad + i * (cellW + gap);
    const damaged = i < zombieHits;
    ctx.fillStyle = damaged ? "rgba(220, 38, 38, 0.92)" : "rgba(30, 41, 59, 0.95)";
    ctx.fillRect(x, y0, cellW, hCell);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y0, cellW, hCell);
  }
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.needsUpdate = true;
  return { texture: tx, canvas: c };
}

function applyZombieBarTexture() {
  if (!zombieBarSprite || !zombieBarSprite.material) return;
  if (zombieBarSprite.material.map) {
    zombieBarSprite.material.map.dispose();
  }
  const b = buildZombieHpBarTexture();
  if (!b) return;
  zombieBarSprite.material.map = b.texture;
  zombieBarSprite.material.needsUpdate = true;
}

function ensureZombieBarAnchor() {
  const s = getPintagolSyncScene();
  if (!s || !zombieModel) return null;
  if (!zombieBarAnchor) {
    zombieBarAnchor = new THREE.Group();
    zombieBarAnchor.name = "zombie-hp-billboard";

    const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false });
    const sp = new THREE.Sprite(mat);
    sp.name = "zombie-hp-bar";
    sp.renderOrder = 500;
    sp.scale.set(ZOMBIE_BAR_WORLD_W, ZOMBIE_BAR_WORLD_H, 1);
    sp.position.set(0, 0, 0);
    zombieBarSprite = sp;
    zombieBarAnchor.add(sp);
    s.add(zombieBarAnchor);
  }
  return zombieBarAnchor;
}

function updateZombieHpBar() {
  if (!zombieModel || zombieDefeated) {
    if (zombieBarAnchor) zombieBarAnchor.visible = false;
    return;
  }
  ensureZombieBarAnchor();
  applyZombieBarTexture();
  if (zombieBarAnchor) zombieBarAnchor.visible = true;
}

function onFrameZombie() {
  if (zombieDefeated) {
    if (zombieBarAnchor) zombieBarAnchor.visible = false;
    return;
  }
  if (!zombieModel) return;
  if (!zombieBarAnchor || !zombieBarSprite) {
    updateZombieHpBar();
  }
  if (!zombieBarAnchor || !zombieBarSprite) return;
  zombieModel.updateMatrixWorld(true);
  _boxT.setFromObject(zombieModel);
  if (_boxT.isEmpty()) return;
  const c = new THREE.Vector3();
  _boxT.getSize(_szT);
  _boxT.getCenter(c);
  c.y += _szT.y * 0.5 + ZOMBIE_BAR_Y_MARGIN;
  zombieBarAnchor.position.copy(c);
  zombieBarAnchor.visible = true;
}

function disposeZombieObject(obj) {
  if (!obj) return;
  obj.traverse((ch) => {
    if (!ch.isMesh) return;
    ch.geometry?.dispose?.();
    if (ch.material) {
      const m = ch.material;
      (Array.isArray(m) ? m : [m]).forEach((mat) => {
        if (mat.map) mat.map.dispose();
        mat.dispose();
      });
    }
  });
}

function disposeZombieBarUi() {
  const s = getPintagolSyncScene();
  if (zombieBarAnchor && s) {
    s.remove(zombieBarAnchor);
  }
  if (zombieBarSprite && zombieBarSprite.material) {
    if (zombieBarSprite.material.map) {
      zombieBarSprite.material.map.dispose();
    }
    zombieBarSprite.material.dispose();
  }
  zombieBarSprite = null;
  zombieBarAnchor = null;
}

function removeZombieFromScene(announce) {
  const s = getPintagolSyncScene();
  disposeZombieBarUi();
  if (zombieModel) {
    if (s) s.remove(zombieModel);
    disposeZombieObject(zombieModel);
  }
  zombieModel = null;
  zombieWorldHitAabb = null;
  zombieDefeated = true;
  zombieHits = ZOMBIE_MAX_HITS;
  if (announce) {
    sendPintagolVistaMessage({
      tipo: "zombieState",
      sourceId: getPintagolLocalPlayerId(),
      hits: ZOMBIE_MAX_HITS,
      maxHits: ZOMBIE_MAX_HITS,
      defeated: true
    });
  }
}

function onPedirSyncResend() {
  if (zombieDefeated) {
    sendPintagolVistaMessage({
      tipo: "zombieState",
      sourceId: getPintagolLocalPlayerId(),
      hits: ZOMBIE_MAX_HITS,
      maxHits: ZOMBIE_MAX_HITS,
      defeated: true
    });
    return;
  }
  if (!zombieModel) {
    if (pendingZombieVista && !pendingZombieVista.defeated && (pendingZombieVista.hits | 0) > 0) {
      sendPintagolVistaMessage({
        tipo: "zombieState",
        sourceId: getPintagolLocalPlayerId(),
        hits: Math.min(ZOMBIE_MAX_HITS, pendingZombieVista.hits | 0),
        maxHits: ZOMBIE_MAX_HITS,
        defeated: false
      });
    }
    return;
  }
  sendPintagolVistaMessage({
    tipo: "zombieState",
    sourceId: getPintagolLocalPlayerId(),
    hits: zombieHits,
    maxHits: ZOMBIE_MAX_HITS,
    defeated: false
  });
}

function segmentIntersectsZombieWorldAabb(prevPos, currPos) {
  if (zombieDefeated || !zombieWorldHitAabb || !prevPos || !currPos) return false;
  if (zombieWorldHitAabb.containsPoint(_pA.copy(currPos))) return true;
  for (let s = 1; s <= SEG_STEPS; s += 1) {
    const t = s / SEG_STEPS;
    _pB.lerpVectors(prevPos, currPos, t);
    if (zombieWorldHitAabb.containsPoint(_pB)) return true;
  }
  return false;
}

function onBulletHitZombie({ prevPos, currPos, bullet }) {
  if (!zombieModel || zombieDefeated) return false;
  if (zombieHits >= ZOMBIE_MAX_HITS) return false;
  if (!zombieWorldHitAabb) rebuildZombieWorldHitAabb();
  if (!zombieWorldHitAabb) return false;
  if (!segmentIntersectsZombieWorldAabb(prevPos, currPos)) return false;
  const hitDamage = Math.max(1, Math.floor(Number(bullet?.userData?.damage) || 1));
  zombieHits = Math.min(ZOMBIE_MAX_HITS, zombieHits + hitDamage);
  if (zombieHits >= ZOMBIE_MAX_HITS) {
    removeZombieFromScene(true);
  } else {
    updateZombieHpBar();
    sendPintagolVistaMessage({
      tipo: "zombieState",
      sourceId: getPintagolLocalPlayerId(),
      hits: zombieHits,
      maxHits: ZOMBIE_MAX_HITS,
      defeated: false
    });
  }
  return true;
}

function onVistaZombieState(d) {
  if (d.defeated === true) {
    pendingZombieVista = { defeated: true, hits: ZOMBIE_MAX_HITS };
    zombieDefeated = true;
    zombieHits = ZOMBIE_MAX_HITS;
    if (zombieModel) {
      const s2 = getPintagolSyncScene();
      if (s2) s2.remove(zombieModel);
      disposeZombieObject(zombieModel);
      zombieModel = null;
      zombieWorldHitAabb = null;
    }
    disposeZombieBarUi();
    return;
  }
  if (typeof d.hits !== "number" || !isFinite(d.hits)) return;
  const next = Math.max(0, Math.min(ZOMBIE_MAX_HITS, Math.floor(d.hits)));
  if (!zombieModel) {
    if (zombieDefeated) return;
    const ph = pendingZombieVista && !pendingZombieVista.defeated ? pendingZombieVista.hits : 0;
    pendingZombieVista = { defeated: false, hits: Math.max(ph, next) };
    return;
  }
  if (zombieDefeated) return;
  const prevH = zombieHits;
  zombieHits = Math.max(zombieHits, next);
  if (zombieHits !== prevH) {
    updateZombieHpBar();
  }
  if (zombieHits >= ZOMBIE_MAX_HITS) {
    removeZombieFromScene(false);
  }
}

function loadZombieCenter() {
  const s = getPintagolSyncScene();
  if (!s) return;
  if (s.getObjectByName("zombie-center-model")) return;
  loadFbxFirst(
    pathsFor("zombie/zombie.fbx"),
    (m) => {
      m.name = "zombie-center-model";
      m.traverse((ch) => {
        if (!ch.isMesh) return;
        ch.castShadow = false;
        ch.receiveShadow = false;
      });
      m.scale.setScalar(0.0115);
      m.position.set(0, 0, 0);
      m.rotation.set(0, Math.PI * 0.65, 0);
      m.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(m);
      if (isFinite(b.min.y)) {
        m.position.y -= b.min.y;
      }
      m.position.y -= 1.2;
      m.position.y += 0.95;
      m.updateMatrixWorld(true);
      if (pendingZombieVista && pendingZombieVista.defeated) {
        disposeZombieObject(m);
        pendingZombieVista = null;
        zombieDefeated = true;
        zombieHits = ZOMBIE_MAX_HITS;
        return;
      }
      const fromPending =
        pendingZombieVista && !pendingZombieVista.defeated ? Math.max(0, pendingZombieVista.hits | 0) : 0;
      pendingZombieVista = null;
      zombieDefeated = false;
      zombieHits = Math.min(ZOMBIE_MAX_HITS, fromPending);
      zombieModel = m;
      s.add(m);
      rebuildZombieWorldHitAabb();
      if (zombieHits >= ZOMBIE_MAX_HITS) {
        removeZombieFromScene(false);
      } else {
        updateZombieHpBar();
      }
    },
    () => {}
  );
}

export function initZombieAstroMode() {
  if (unregBullet) {
    return;
  }
  setPintagolZombieSyncForPose(getZombieSyncForPose);
  loadZombieCenter();
  unregBullet = registerPintagolSceneBulletHandler(onBulletHitZombie);
  unregFrame = registerPintagolSceneFrameHandler(onFrameZombie);
  unregVista = registerPintagolZombieVistaHandler(onVistaZombieState);
  unregPedir = registerPintagolPedirSyncListener(onPedirSyncResend);
}

export function destroyZombieAstroMode() {
  if (unregBullet) unregBullet();
  if (unregFrame) unregFrame();
  if (unregVista) unregVista();
  if (unregPedir) unregPedir();
  unregBullet = unregFrame = unregVista = unregPedir = null;
  setPintagolZombieSyncForPose(null);
  disposeZombieBarUi();
  zombieWorldHitAabb = null;
}
