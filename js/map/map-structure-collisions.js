/**
 * Colisiones 2D (plano XZ) para estructuras del mapa: cajas alineadas a ejes en el suelo.
 * El jugador se aproxima como un círculo; resolución por empuje hacia afuera de cada caja.
 * Reutilizable: registrar `Object3D` colocado o cajas manuales.
 *
 * Los pinos (u otra vegetación) no se registran aquí: no bloquean al jugador.
 */
import * as THREE from "three";

/** Radio aproximado del cuerpo del astronauta en unidades de escena (mismo espacio que `wander`). */
export const MAP_PLAYER_FOOT_RADIUS = 0.62;

const _footprintBoxes = [];
const _worldAabbs = [];

/**
 * Limpia todos los colisionadores (p. ej. al recargar mapa o resetear partida).
 */
export function clearMapStructureColliders() {
  _footprintBoxes.length = 0;
  _worldAabbs.length = 0;
}

/**
 * @param {THREE.Box3} box3 Caja en espacio mundo (p. ej. `setFromObject` con el mesh ya colocado).
 * @param {number} [margin=0] Aumenta el rectángulo en XZ (hace el bloqueo más generoso).
 */
export function registerMapStructureFootprintFromBox3(box3, margin = 0) {
  if (!box3 || !box3.min || !box3.max) return;
  const m = Number(margin) || 0;
  _footprintBoxes.push({
    minX: box3.min.x - m,
    maxX: box3.max.x + m,
    minZ: box3.min.z - m,
    maxZ: box3.max.z + m
  });
  _worldAabbs.push({
    minX: box3.min.x - m,
    maxX: box3.max.x + m,
    minY: box3.min.y,
    maxY: box3.max.y,
    minZ: box3.min.z - m,
    maxZ: box3.max.z + m
  });
}

/**
 * Añade un colisionador a partir del AABB mundial del objeto (incluye rotación/escala).
 * @param {THREE.Object3D} object3D
 * @param {number} [margin=0.35] Inflado en suelo para no pegar el cuerpo al mesh.
 */
export function registerMapStructureFootprintFromObject(object3D, margin = 0.35) {
  if (!object3D) return;
  object3D.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object3D);
  if (!isFinite(box.min.x) || !isFinite(box.max.x)) return;
  registerMapStructureFootprintFromBox3(box, margin);
}

/**
 * Ajusta una posición candidata evitando traspasar cajas registradas.
 * @param {number} x
 * @param {number} z
 * @param {number} [radius=MAP_PLAYER_FOOT_RADIUS]
 * @returns {{ x: number, z: number }}
 */
export function resolveMapPlayerXZ(x, z, radius = MAP_PLAYER_FOOT_RADIUS) {
  let px = x;
  let pz = z;
  const r = Math.max(0.05, radius);
  for (let i = 0; i < _footprintBoxes.length; i += 1) {
    const out = _pushCircleOutOfAabb2D(px, pz, r, _footprintBoxes[i]);
    px = out.x;
    pz = out.z;
  }
  return { x: px, z: pz };
}

/**
 * @param {number} x
 * @param {number} z
 * @param {number} limit
 * @param {number} [radius=MAP_PLAYER_FOOT_RADIUS]
 */
export function resolveMapPlayerXZClamped(x, z, limit, radius = MAP_PLAYER_FOOT_RADIUS) {
  const cx = Math.max(-limit, Math.min(limit, x));
  const cz = Math.max(-limit, Math.min(limit, z));
  return resolveMapPlayerXZ(cx, cz, radius);
}

/**
 * Devuelve true si un segmento de bala intersecta cualquier estructura registrada.
 * Usa muestreo a lo largo del segmento para mantener costo bajo.
 * @param {{x:number,y:number,z:number}} prevPos
 * @param {{x:number,y:number,z:number}} currPos
 * @param {number} [steps=10]
 */
export function segmentIntersectsMapStructure(prevPos, currPos, steps = 10) {
  if (!prevPos || !currPos || !_worldAabbs.length) return false;
  if (pointInsideAnyAabb(currPos)) return true;
  const n = Math.max(2, Math.floor(Number(steps) || 10));
  for (let i = 1; i <= n; i += 1) {
    const t = i / n;
    const x = prevPos.x + (currPos.x - prevPos.x) * t;
    const y = prevPos.y + (currPos.y - prevPos.y) * t;
    const z = prevPos.z + (currPos.z - prevPos.z) * t;
    if (pointInsideAnyAabb({ x, y, z })) return true;
  }
  return false;
}

function pointInsideAnyAabb(point) {
  for (let i = 0; i < _worldAabbs.length; i += 1) {
    const b = _worldAabbs[i];
    if (
      point.x >= b.minX &&
      point.x <= b.maxX &&
      point.y >= b.minY &&
      point.y <= b.maxY &&
      point.z >= b.minZ &&
      point.z <= b.maxZ
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Círculo en 2D frente a rectángulo alineado a ejes.
 * @param {number} px
 * @param {number} pz
 * @param {number} r
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} b
 */
function _pushCircleOutOfAabb2D(px, pz, r, b) {
  const { minX, maxX, minZ, maxZ } = b;
  const qx = Math.max(minX, Math.min(maxX, px));
  const qz = Math.max(minZ, Math.min(maxZ, pz));
  let dx = px - qx;
  let dz = pz - qz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) {
    return { x: px, z: pz };
  }
  if (d2 < 1e-10) {
    const dLeft = px - minX;
    const dRight = maxX - px;
    const dBack = pz - minZ;
    const dForward = maxZ - pz;
    const m = Math.min(dLeft, dRight, dBack, dForward);
    if (m === dLeft) return { x: minX - r, z: pz };
    if (m === dRight) return { x: maxX + r, z: pz };
    if (m === dBack) return { x: px, z: minZ - r };
    return { x: px, z: maxZ + r };
  }
  const d = Math.sqrt(d2);
  return { x: qx + (dx / d) * r, z: qz + (dz / d) * r };
}
