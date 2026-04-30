import * as THREE from "three";
import { loadFbxFirst } from "../astro-sync-assets.js";
import {
  MODEL_BASES,
  ZOMBIE_HITS_TO_KILL,
  PLAYER_TOUCH_DAMAGE,
  PLAYER_TOUCH_COOLDOWN_MS,
  ZOMBIE_MOVE_SPEED,
  ZOMBIE_HIT_AABB_PAD,
  ZOMBIE_TOUCH_RADIUS,
  ZOMBIE_GROUND_Y,
  ZOMBIE_MIN_VISUAL_LIFT,
  TOTAL_WAVES,
  WAVE_ZOMBIE_COUNTS,
  SEGMENT_STEPS,
  SNAPSHOT_SEND_MS,
  COOP_SYNC_MODE,
  REQUIRED_READY_PLAYERS,
  PREP_COUNTDOWN_MS,
  MAP_PLAY_BOUNDS,
  PHASE_WAITING_PLAYERS,
  PHASE_COUNTDOWN,
  PHASE_ACTIVE
} from "./zombie-coop-constants.js";
import {
  setZombieHudStatus,
  showZombieEndOverlay,
  hideZombieEndOverlay
} from "./zombie-coop-ui.js";
import {
  registerPintagolSceneBulletHandler,
  registerPintagolSceneFrameHandler,
  registerPintagolZombieVistaHandler,
  registerPintagolPedirSyncListener,
  getPintagolSyncScene,
  getPintagolLocalPlayerId,
  sendPintagolVistaMessage,
  applyPintagolExternalLocalHit
} from "../astro-sync.js";

const _tmpBox = new THREE.Box3();
const _tmpVecA = new THREE.Vector3();
const _tmpVecB = new THREE.Vector3();
const _tmpVecC = new THREE.Vector3();

let scene = null;
let zombies = [];
let waveIndex = 0;
let waveSpawning = false;
let coopFinished = false;
let unregBullet = null;
let unregFrame = null;
let unregVista = null;
let unregPedir = null;
let zombieTemplate = null;
let loadRequested = false;
let nextZombieId = 1;
let localSnapshotSeq = 0;
let snapshotElapsed = 0;
let lastAppliedSnapshotSeq = 0;
let knownAuthorityId = "";
let coopPhase = PHASE_WAITING_PLAYERS;
let countdownEndAtMs = 0;
let matchResult = ""; // "", "victory", "defeat"

function pathsFor(rel) {
  return MODEL_BASES.map((base) => base + rel);
}

function setHudStatus(text) {
  setZombieHudStatus(text);
}

function showEndOverlay(resultType) {
  showZombieEndOverlay(resultType);
}

function hideEndOverlay() {
  hideZombieEndOverlay();
}

function setPhase(nextPhase) {
  coopPhase = nextPhase;
}

function getReadyPlayerCount() {
  return listPlayerGroups().filter(playerCanBeHit).length;
}

function countAlivePlayers() {
  return listPlayerGroups().filter(playerCanBeHit).length;
}

function listPlayerGroups() {
  const s = getPintagolSyncScene();
  if (!s) return [];
  const out = [];
  const local = s.getObjectByName("astro-sync-root");
  if (local) out.push({ id: getPintagolLocalPlayerId(), group: local, isLocal: true });
  s.traverse((obj) => {
    if (!obj || !obj.name || !obj.name.startsWith("astro-remote-")) return;
    const id = obj.name.slice("astro-remote-".length);
    if (!id) return;
    out.push({ id, group: obj, isLocal: false });
  });
  return out;
}

function getSortedPlayerIds() {
  return listPlayerGroups()
    .map((p) => String(p.id || ""))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function isLocalAuthority() {
  if (knownAuthorityId) {
    return String(getPintagolLocalPlayerId() || "") === knownAuthorityId;
  }
  const ids = getSortedPlayerIds();
  if (!ids.length) return true;
  return String(getPintagolLocalPlayerId() || "") === ids[0];
}

function playerCanBeHit(playerEntry) {
  return !!(playerEntry && playerEntry.group && playerEntry.group.visible !== false);
}

function hitPointInAstronautRig(point, playerGroup) {
  if (!point || !playerGroup) return false;
  const g = playerGroup.position;
  const dx = point.x - g.x;
  const dz = point.z - g.z;
  if (dx * dx + dz * dz > 1.45 * 1.45) return false;
  const yMin = g.y + 0.25;
  const yMax = g.y + 3.45;
  return point.y >= yMin && point.y <= yMax;
}

function segmentIntersectsAstronautRig(prevPos, currPos, playerGroup) {
  if (!prevPos || !currPos || !playerGroup) return false;
  if (hitPointInAstronautRig(currPos, playerGroup)) return true;
  for (let i = 1; i <= SEGMENT_STEPS; i += 1) {
    const t = i / SEGMENT_STEPS;
    _tmpVecA.lerpVectors(prevPos, currPos, t);
    if (hitPointInAstronautRig(_tmpVecA, playerGroup)) return true;
  }
  return false;
}

function buildZombieMeshClone() {
  if (!zombieTemplate) return null;
  return zombieTemplate.clone(true);
}

function createFallbackZombie() {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.42, 1.25, 6, 10),
    new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x14532d,
      emissiveIntensity: 0.34,
      roughness: 0.52,
      metalness: 0.08
    })
  );
  const root = new THREE.Group();
  root.add(mesh);
  return root;
}

function brightenZombieMaterials(root) {
  if (!root) return;
  root.traverse((child) => {
    if (!child || !child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (let i = 0; i < materials.length; i += 1) {
      const mat = materials[i];
      if (!mat) continue;
      if (mat.color && mat.color.multiplyScalar) mat.color.multiplyScalar(1.05);
      if ("emissive" in mat && mat.emissive && mat.emissive.setHex) {
        mat.emissive.setHex(0x166534);
      }
      if ("emissiveIntensity" in mat) mat.emissiveIntensity = Math.max(0.14, Number(mat.emissiveIntensity) || 0);
      if ("roughness" in mat && typeof mat.roughness === "number") {
        mat.roughness = Math.min(0.65, mat.roughness);
      }
      mat.needsUpdate = true;
    }
  });
}

function buildZombieHpTexture(hits, maxHits) {
  const safeMax = Math.max(1, maxHits | 0);
  const safeHits = Math.max(0, Math.min(safeMax, hits | 0));
  const width = 256;
  const height = 40;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
  ctx.fillRect(0, 0, width, height);
  const ratio = 1 - safeHits / safeMax;
  ctx.fillStyle = "rgba(34, 197, 94, 0.92)";
  ctx.fillRect(3, 3, Math.max(0, (width - 6) * ratio), height - 6);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.needsUpdate = true;
  return tx;
}

function updateZombieHpUi(zombie) {
  if (!zombie || !zombie.root || !scene) return;
  if (!zombie.hpSprite) {
    const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false });
    zombie.hpSprite = new THREE.Sprite(mat);
    zombie.hpSprite.scale.set(2.7, 0.42, 1);
    zombie.hpSprite.position.set(0, 0, 0);
    zombie.hpSprite.renderOrder = 400;
    scene.add(zombie.hpSprite);
  }
  const tx = buildZombieHpTexture(zombie.hits, zombie.maxHits);
  if (!tx) return;
  if (zombie.hpSprite.material.map) zombie.hpSprite.material.map.dispose();
  zombie.hpSprite.material.map = tx;
  zombie.hpSprite.material.needsUpdate = true;
  _tmpBox.setFromObject(zombie.root);
  const topY = _tmpBox.isEmpty() ? zombie.root.position.y + 2.2 : _tmpBox.max.y + 0.55;
  zombie.hpSprite.position.set(zombie.root.position.x, topY, zombie.root.position.z);
}

function adjustZombieToGround(root) {
  if (!root) return;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const minY = box.min.y;
  const targetMinY = ZOMBIE_GROUND_Y + ZOMBIE_MIN_VISUAL_LIFT;
  if (isFinite(minY) && minY < targetMinY) {
    root.position.y += targetMinY - minY;
  }
}

function createZombieAt(position) {
  const root = buildZombieMeshClone() || createFallbackZombie();
  root.name = "zombie-coop-enemy";
  root.position.set(
    Math.max(-MAP_PLAY_BOUNDS, Math.min(MAP_PLAY_BOUNDS, position.x)),
    ZOMBIE_GROUND_Y,
    Math.max(-MAP_PLAY_BOUNDS, Math.min(MAP_PLAY_BOUNDS, position.z))
  );
  root.userData.zombieEnemy = true;
  root.scale.multiplyScalar(0.86);
  brightenZombieMaterials(root);
  adjustZombieToGround(root);
  const glow = new THREE.PointLight(0x86efac, 0.18, 5.2, 2);
  glow.position.set(0, 1.25, 0);
  root.add(glow);
  scene.add(root);
  const zombie = {
    id: nextZombieId++,
    root,
    hits: 0,
    maxHits: ZOMBIE_HITS_TO_KILL,
    alive: true,
    touchByPlayer: new Map(),
    hpSprite: null
  };
  updateZombieHpUi(zombie);
  return zombie;
}

function clearAllZombies() {
  for (let i = 0; i < zombies.length; i += 1) {
    const z = zombies[i];
    if (z && z.hpSprite && z.hpSprite.parent) {
      if (z.hpSprite.material?.map) z.hpSprite.material.map.dispose();
      z.hpSprite.material?.dispose?.();
      z.hpSprite.parent.remove(z.hpSprite);
      z.hpSprite = null;
    }
    if (z && z.root && z.root.parent) z.root.parent.remove(z.root);
  }
  zombies = [];
}

function waveZombieCount(idx) {
  return WAVE_ZOMBIE_COUNTS[idx] || WAVE_ZOMBIE_COUNTS[WAVE_ZOMBIE_COUNTS.length - 1] || 8;
}

function spawnWave(index) {
  if (!scene || coopFinished) return;
  waveSpawning = false;
  matchResult = "";
  hideEndOverlay();
  const amount = waveZombieCount(index);
  const radiusBase = 18 + index * 1.7;
  const center = new THREE.Vector3(0, -1.2, 0);
  for (let i = 0; i < amount; i += 1) {
    const angle = (Math.PI * 2 * i) / Math.max(1, amount);
    const jitter = (Math.random() - 0.5) * 2.2;
    const r = radiusBase + (Math.random() - 0.5) * 4.5;
    const pos = new THREE.Vector3(
      center.x + Math.cos(angle + jitter * 0.09) * r,
      ZOMBIE_GROUND_Y,
      center.z + Math.sin(angle + jitter * 0.09) * r
    );
    pos.x = Math.max(-MAP_PLAY_BOUNDS, Math.min(MAP_PLAY_BOUNDS, pos.x));
    pos.z = Math.max(-MAP_PLAY_BOUNDS, Math.min(MAP_PLAY_BOUNDS, pos.z));
    zombies.push(createZombieAt(pos));
  }
  setPhase(PHASE_WAITING_PLAYERS);
  countdownEndAtMs = 0;
  setHudStatus(`Esperando ${REQUIRED_READY_PLAYERS} jugadores para iniciar...`);
  broadcastSnapshotNow();
}

function ensureZombieTemplate() {
  if (loadRequested) return;
  loadRequested = true;
  loadFbxFirst(
    pathsFor("zombie/zombie.fbx"),
    (model) => {
      model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = false;
        child.receiveShadow = false;
      });
      model.scale.setScalar(0.0115);
      model.rotation.set(0, Math.PI * 0.65, 0);
      model.updateMatrixWorld(true);
      _tmpBox.setFromObject(model);
      if (isFinite(_tmpBox.min.y)) model.position.y -= _tmpBox.min.y;
      brightenZombieMaterials(model);
      zombieTemplate = model;
      spawnWave(0);
    },
    () => {
      zombieTemplate = null;
      spawnWave(0);
    }
  );
}

function distanceSquaredXZ(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function findClosestAlivePlayerPos(fromPos) {
  const players = listPlayerGroups().filter(playerCanBeHit);
  if (!players.length) return null;
  let best = null;
  let bestD2 = Infinity;
  for (let i = 0; i < players.length; i += 1) {
    const p = players[i].group.position;
    const d2 = distanceSquaredXZ(fromPos, p);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = players[i];
    }
  }
  return best;
}

function tryZombieTouchDamage(zombie, nowMs) {
  if (coopPhase !== PHASE_ACTIVE) return;
  const players = listPlayerGroups();
  for (let i = 0; i < players.length; i += 1) {
    const p = players[i];
    if (!playerCanBeHit(p)) continue;
    const d2 = distanceSquaredXZ(zombie.root.position, p.group.position);
    if (d2 > ZOMBIE_TOUCH_RADIUS * ZOMBIE_TOUCH_RADIUS) continue;
    const prevAt = zombie.touchByPlayer.get(p.id) || 0;
    if (nowMs - prevAt < PLAYER_TOUCH_COOLDOWN_MS) continue;
    zombie.touchByPlayer.set(p.id, nowMs);
    if (p.isLocal) {
      applyPintagolExternalLocalHit(0x16a34a, PLAYER_TOUCH_DAMAGE);
    }
    sendPintagolVistaMessage({
      tipo: "hit",
      playerId: "zombie-wave",
      targetPlayerId: p.id,
      hitColorHex: 0x16a34a,
      damage: PLAYER_TOUCH_DAMAGE
    });
    // Cada zombie solo puede tocar una vez: se elimina tras impactar.
    if (isLocalAuthority()) {
      handleZombieKilled(zombie);
    }
    return;
  }
}

function tickZombies(dt) {
  if (coopFinished || !zombies.length) return;
  if (coopPhase !== PHASE_ACTIVE) return;
  const nowMs = performance.now();
  for (let i = 0; i < zombies.length; i += 1) {
    const zombie = zombies[i];
    if (!zombie || !zombie.alive || !zombie.root) continue;
    const target = findClosestAlivePlayerPos(zombie.root.position);
    if (target && target.group) {
      _tmpVecB.copy(target.group.position);
      _tmpVecB.y = zombie.root.position.y;
      _tmpVecC.subVectors(_tmpVecB, zombie.root.position);
      const len = _tmpVecC.length();
      if (len > 0.001) {
        _tmpVecC.multiplyScalar(1 / len);
        zombie.root.position.addScaledVector(_tmpVecC, ZOMBIE_MOVE_SPEED * dt);
        zombie.root.position.x = Math.max(-MAP_PLAY_BOUNDS, Math.min(MAP_PLAY_BOUNDS, zombie.root.position.x));
        zombie.root.position.z = Math.max(-MAP_PLAY_BOUNDS, Math.min(MAP_PLAY_BOUNDS, zombie.root.position.z));
        zombie.root.position.y = Math.max(zombie.root.position.y, ZOMBIE_GROUND_Y);
        adjustZombieToGround(zombie.root);
        zombie.root.lookAt(_tmpVecB.x, zombie.root.position.y, _tmpVecB.z);
      }
      updateZombieHpUi(zombie);
      tryZombieTouchDamage(zombie, nowMs);
    }
  }
}

function zombieWorldAabb(zombie) {
  if (!zombie || !zombie.root) return null;
  zombie.root.updateMatrixWorld(true);
  _tmpBox.setFromObject(zombie.root);
  if (_tmpBox.isEmpty()) return null;
  _tmpBox.expandByScalar(ZOMBIE_HIT_AABB_PAD);
  return _tmpBox.clone();
}

function segmentIntersectsBox(prevPos, currPos, box) {
  if (!prevPos || !currPos || !box) return false;
  if (box.containsPoint(currPos)) return true;
  for (let i = 1; i <= SEGMENT_STEPS; i += 1) {
    const t = i / SEGMENT_STEPS;
    _tmpVecA.lerpVectors(prevPos, currPos, t);
    if (box.containsPoint(_tmpVecA)) return true;
  }
  return false;
}

function handleZombieKilled(zombie) {
  zombie.alive = false;
  if (zombie.hpSprite && zombie.hpSprite.parent) {
    if (zombie.hpSprite.material?.map) zombie.hpSprite.material.map.dispose();
    zombie.hpSprite.material?.dispose?.();
    zombie.hpSprite.parent.remove(zombie.hpSprite);
    zombie.hpSprite = null;
  }
  if (zombie.root && zombie.root.parent) zombie.root.parent.remove(zombie.root);
  const remaining = zombies.filter((z) => z.alive).length;
  if (remaining > 0) return;
  waveIndex += 1;
  if (waveIndex >= TOTAL_WAVES) {
    coopFinished = true;
    matchResult = "victory";
    showEndOverlay(matchResult);
    setHudStatus("Modo zombie cooperativo completado. Oleadas terminadas.");
    broadcastSnapshotNow();
    return;
  }
  if (!waveSpawning) {
    waveSpawning = true;
    setHudStatus(`Oleada ${waveIndex + 1} iniciando...`);
    window.setTimeout(() => spawnWave(waveIndex), 1800);
  }
  broadcastSnapshotNow();
}

function applyAuthoritativeZombieHit(zombieId, damage) {
  if (!isLocalAuthority() || coopFinished) return;
  const zid = Math.max(1, Math.floor(Number(zombieId) || 0));
  if (!zid) return;
  const zombie = zombies.find((z) => z && z.id === zid && z.alive);
  if (!zombie) return;
  const dmg = Math.max(1, Math.floor(Number(damage) || 1));
  zombie.hits = Math.min(zombie.maxHits, zombie.hits + dmg);
  updateZombieHpUi(zombie);
  if (zombie.hits >= zombie.maxHits) handleZombieKilled(zombie);
  else broadcastSnapshotNow();
}

function syncSnapshotPayload() {
  const nowMs = Date.now();
  const countdownRemainingMs =
    coopPhase === PHASE_COUNTDOWN && countdownEndAtMs > nowMs ? countdownEndAtMs - nowMs : 0;
  return {
    mode: COOP_SYNC_MODE,
    seq: ++localSnapshotSeq,
    waveIndex,
    totalWaves: TOTAL_WAVES,
    finished: coopFinished,
    matchResult,
    phase: coopPhase,
    countdownEndAtMs,
    countdownRemainingMs,
    readyPlayers: getReadyPlayerCount(),
    zombies: zombies.map((z) => ({
      id: z.id,
      x: Number(z.root?.position?.x || 0),
      y: Number(z.root?.position?.y || ZOMBIE_GROUND_Y),
      z: Number(z.root?.position?.z || 0),
      rotY: Number(z.root?.rotation?.y || 0),
      hits: z.hits | 0,
      maxHits: z.maxHits | 0,
      alive: z.alive !== false
    }))
  };
}

function broadcastSnapshotNow() {
  if (!isLocalAuthority()) return;
  knownAuthorityId = String(getPintagolLocalPlayerId() || "");
  sendPintagolVistaMessage({
    tipo: "zombieState",
    zombieMode: COOP_SYNC_MODE,
    sourceId: getPintagolLocalPlayerId(),
    coop: syncSnapshotPayload()
  });
}

function upsertZombieFromRemote(remoteZombie) {
  const rid = Math.max(1, Math.floor(Number(remoteZombie?.id) || 0));
  if (!rid) return null;
  let target = null;
  for (let i = 0; i < zombies.length; i += 1) {
    if (zombies[i] && zombies[i].id === rid) {
      target = zombies[i];
      break;
    }
  }
  if (!target) {
    target = createZombieAt(
      new THREE.Vector3(
        Number(remoteZombie.x || 0),
        Number(remoteZombie.y || ZOMBIE_GROUND_Y),
        Number(remoteZombie.z || 0)
      )
    );
    target.id = rid;
    zombies.push(target);
  }
  if (target.root) {
    target.root.position.set(
      Math.max(-MAP_PLAY_BOUNDS, Math.min(MAP_PLAY_BOUNDS, Number(remoteZombie.x || 0))),
      Number(remoteZombie.y || ZOMBIE_GROUND_Y),
      Math.max(-MAP_PLAY_BOUNDS, Math.min(MAP_PLAY_BOUNDS, Number(remoteZombie.z || 0)))
    );
    adjustZombieToGround(target.root);
    target.root.rotation.y = Number(remoteZombie.rotY || 0);
  }
  target.hits = Math.max(0, Math.floor(Number(remoteZombie.hits) || 0));
  target.maxHits = Math.max(1, Math.floor(Number(remoteZombie.maxHits) || ZOMBIE_HITS_TO_KILL));
  updateZombieHpUi(target);
  target.alive = remoteZombie.alive !== false;
  if (!target.alive && target.root && target.root.parent) {
    target.root.parent.remove(target.root);
  }
  return target;
}

function applyRemoteSnapshot(snapshot) {
  if (!snapshot || snapshot.mode !== COOP_SYNC_MODE) return;
  const incomingSeq = Math.max(0, Math.floor(Number(snapshot.seq) || 0));
  if (incomingSeq <= lastAppliedSnapshotSeq) return;
  lastAppliedSnapshotSeq = incomingSeq;
  waveIndex = Math.max(0, Math.floor(Number(snapshot.waveIndex) || 0));
  coopFinished = !!snapshot.finished;
  matchResult = String(snapshot.matchResult || "");
  coopPhase = String(snapshot.phase || PHASE_WAITING_PLAYERS);
  countdownEndAtMs = Math.max(0, Math.floor(Number(snapshot.countdownEndAtMs) || 0));
  const remoteZombies = Array.isArray(snapshot.zombies) ? snapshot.zombies : [];
  const seen = new Set();
  for (let i = 0; i < remoteZombies.length; i += 1) {
    const rz = remoteZombies[i];
    const updated = upsertZombieFromRemote(rz);
    if (updated) seen.add(updated.id);
  }
  for (let i = zombies.length - 1; i >= 0; i -= 1) {
    const z = zombies[i];
    if (!z) continue;
    if (!seen.has(z.id)) {
      if (z.root && z.root.parent) z.root.parent.remove(z.root);
      zombies.splice(i, 1);
    }
  }
  const currentWave = Math.min(TOTAL_WAVES, waveIndex + 1);
  if (coopFinished) {
    if (matchResult === "victory") {
      setHudStatus("Victoria: oleadas completadas.");
      showEndOverlay("victory");
    } else if (matchResult === "defeat") {
      setHudStatus("Derrota: todos los jugadores cayeron.");
      showEndOverlay("defeat");
    } else {
      setHudStatus("Partida finalizada.");
    }
  } else if (coopPhase === PHASE_WAITING_PLAYERS) {
    const ready = Math.max(0, Math.floor(Number(snapshot.readyPlayers) || 0));
    setHudStatus(`Esperando jugadores... ${ready}/${REQUIRED_READY_PLAYERS}`);
  } else if (coopPhase === PHASE_COUNTDOWN) {
    const leftSec = Math.max(0, Math.ceil((countdownEndAtMs - Date.now()) / 1000));
    setHudStatus(`Inicia en ${leftSec}s... preparense`);
  } else {
    setHudStatus(`Oleada ${currentWave}/${TOTAL_WAVES} en progreso`);
    hideEndOverlay();
  }
}

function onVistaZombieCoop(d) {
  if (!d || d.zombieMode !== COOP_SYNC_MODE) return;
  if (d.zombieCmd === "hit") {
    applyAuthoritativeZombieHit(d.zombieId, d.damage);
    return;
  }
  const sourceId = String(d.sourceId || "");
  if (sourceId) {
    if (!knownAuthorityId || sourceId.localeCompare(knownAuthorityId) < 0) {
      knownAuthorityId = sourceId;
    }
  }
  if (isLocalAuthority()) return;
  applyRemoteSnapshot(d.coop);
}

function onPedirSyncZombieCoop() {
  if (!isLocalAuthority()) return;
  broadcastSnapshotNow();
}

function onBulletZombieCoop({ prevPos, currPos, bullet }) {
  if (!bullet || !currPos) return false;

  const ownerId = bullet.userData?.ownerId;
  const players = listPlayerGroups();
  for (let i = 0; i < players.length; i += 1) {
    const p = players[i];
    if (!playerCanBeHit(p)) continue;
    if (ownerId && p.id === ownerId) continue;
    if (segmentIntersectsAstronautRig(prevPos, currPos, p.group)) {
      return true; // Modo zombie: disparos no llenan barra por impacto de arma.
    }
  }

  if (!ownerId || coopFinished) return false;
  for (let z = 0; z < zombies.length; z += 1) {
    const zombie = zombies[z];
    if (!zombie || !zombie.alive) continue;
    const box = zombieWorldAabb(zombie);
    if (!box) continue;
    if (!segmentIntersectsBox(prevPos, currPos, box)) continue;
    const damage = Math.max(1, Math.floor(Number(bullet.userData?.damage) || 1));
    if (!isLocalAuthority()) {
      sendPintagolVistaMessage({
        tipo: "zombieState",
        zombieMode: COOP_SYNC_MODE,
        zombieCmd: "hit",
        zombieId: zombie.id,
        damage
      });
      return true;
    }
    zombie.hits = Math.min(zombie.maxHits, zombie.hits + damage);
    updateZombieHpUi(zombie);
    if (zombie.hits >= zombie.maxHits) handleZombieKilled(zombie);
    else broadcastSnapshotNow();
    return true;
  }
  return false;
}

function onFrameCoop({ dt }) {
  if (isLocalAuthority()) {
    const readyPlayers = getReadyPlayerCount();
    const nowMsAbs = Date.now();
    if (coopPhase === PHASE_WAITING_PLAYERS) {
      if (readyPlayers >= REQUIRED_READY_PLAYERS) {
        setPhase(PHASE_COUNTDOWN);
        countdownEndAtMs = nowMsAbs + PREP_COUNTDOWN_MS;
        setHudStatus("Todos listos. Inicio en 12s...");
        broadcastSnapshotNow();
      } else {
        setHudStatus(`Esperando jugadores... ${readyPlayers}/${REQUIRED_READY_PLAYERS}`);
      }
    } else if (coopPhase === PHASE_COUNTDOWN) {
      const leftMs = Math.max(0, countdownEndAtMs - nowMsAbs);
      const leftSec = Math.ceil(leftMs / 1000);
      setHudStatus(`Inicia en ${leftSec}s... preparense`);
      if (leftMs <= 0) {
        setPhase(PHASE_ACTIVE);
        countdownEndAtMs = 0;
        setHudStatus(`Oleada ${Math.min(TOTAL_WAVES, waveIndex + 1)}/${TOTAL_WAVES} en progreso`);
        broadcastSnapshotNow();
      }
    }

    if (!coopFinished && coopPhase === PHASE_ACTIVE) {
      const alivePlayers = countAlivePlayers();
      if (alivePlayers <= 0) {
        coopFinished = true;
        matchResult = "defeat";
        showEndOverlay(matchResult);
        setHudStatus("Derrota: todos los jugadores fueron eliminados.");
        broadcastSnapshotNow();
      }
    }

    tickZombies(dt);
    snapshotElapsed += dt * 1000;
    if (snapshotElapsed >= SNAPSHOT_SEND_MS) {
      snapshotElapsed = 0;
      broadcastSnapshotNow();
    }
  }
}

export function initZombieCoopMode() {
  if (unregBullet || unregFrame || unregVista || unregPedir) return;
  scene = getPintagolSyncScene();
  if (!scene) return;
  waveIndex = 0;
  waveSpawning = false;
  coopFinished = false;
  nextZombieId = 1;
  localSnapshotSeq = 0;
  snapshotElapsed = 0;
  lastAppliedSnapshotSeq = 0;
  knownAuthorityId = "";
  coopPhase = PHASE_WAITING_PLAYERS;
  countdownEndAtMs = 0;
  matchResult = "";
  hideEndOverlay();
  clearAllZombies();
  unregBullet = registerPintagolSceneBulletHandler(onBulletZombieCoop);
  unregFrame = registerPintagolSceneFrameHandler(onFrameCoop);
  unregVista = registerPintagolZombieVistaHandler(onVistaZombieCoop);
  unregPedir = registerPintagolPedirSyncListener(onPedirSyncZombieCoop);
  ensureZombieTemplate();
  if (!isLocalAuthority()) {
    sendPintagolVistaMessage({ tipo: "pedirSync", playerId: getPintagolLocalPlayerId() });
  }
}

export function destroyZombieCoopMode() {
  if (unregBullet) unregBullet();
  if (unregFrame) unregFrame();
  if (unregVista) unregVista();
  if (unregPedir) unregPedir();
  unregBullet = unregFrame = unregVista = unregPedir = null;
  clearAllZombies();
}
