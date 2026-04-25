/**
 * Tuning de armas en mano: mismos offset y rotación en todos los modos (normal, zombie-sync, etc.).
 * Cada arma tiene su propia triada Euler: GUN2 (subfusil), GUN3 (pistola), escopeta.
 */
import * as THREE from "three";

/** Escala del grupo en escena: astronauta + armas (mismo factor que al colocar el subfusil). */
export const WORLD_GROUP_SCALE = 0.52;

export const GUN_NUDGE = 0.028;

/** Offset inicial en el rig del astronauta; CVBN ajusta x/z/y (mismo origen para las tres armas). */
export const GUN_HAND_OFFSET_DEFAULT = Object.freeze({ x: -0.55, y: 2.99, z: 1.8 });

/** Subfusil (gun2) */
export const GUN2_BASE_ROTATION = Object.freeze({
  rotationX: Math.PI / 4.5,
  rotationY: -1.8,
  rotationZ: 0
});

/** Pistola (gun3) */
export const GUN3_BASE_ROTATION = Object.freeze({
  rotationX: Math.PI / 4.5,
  rotationY: -0.1,
  rotationZ: 0
});

/** Escopeta (misma fila ajustable por separado si hace falta) */
export const SHOTGUN_BASE_ROTATION = Object.freeze({
  rotationX: Math.PI / 4.5,
  rotationY: -0.1,
  rotationZ: 0
});

export const GUN2_SCALE = 0.008;
export const GUN3_HAND_SCALE = 0.11;
export const SHOTGUN_HAND_SCALE = 0.11;

export const GUN3_PICKUP_BASE_Y = 1.45;
export const GUN3_PICKUP_RADIUS = 2.1;
export const GUN3_PICKUP_CENTER = new THREE.Vector3(0, GUN3_PICKUP_BASE_Y, 0);

export const SHOTGUN_PICKUP_BASE_Y = 1.35;
export const SHOTGUN_PICKUP_RADIUS = 2.1;
export const SHOTGUN_PICKUP_CENTER = new THREE.Vector3(6.2, SHOTGUN_PICKUP_BASE_Y, 0);

/**
 * Rotación base en applyGun2* por frame (misma que setupGunMesh al equipar).
 * @param {string} [weaponType] — "gun2" | "gun3" | "shotgun" | "gun4" (escopeta)
 */
export function weaponRotationForType(weaponType) {
  const wt = typeof weaponType === "string" ? weaponType : "gun2";
  if (wt === "shotgun" || wt === "gun4") {
    return SHOTGUN_BASE_ROTATION;
  }
  if (wt === "gun3") {
    return GUN3_BASE_ROTATION;
  }
  return GUN2_BASE_ROTATION;
}
