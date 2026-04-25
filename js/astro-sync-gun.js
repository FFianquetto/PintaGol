import { GUN2_BASE_ROTATION } from "./weapon-tuning.js";

export function gunSetupOptions(scale, rotation) {
  return { scale, ...rotation };
}

export function applyGun2Input(gun2World, keysGun2, nudge) {
  if (keysGun2.v) gun2World.z -= nudge;
  if (keysGun2.b) gun2World.z += nudge;
  if (keysGun2.c) gun2World.x -= nudge;
  if (keysGun2.n) gun2World.x += nudge;
}

export function clampGun2LocalOffset(gun2World) {
  gun2World.x = Math.max(-1.8, Math.min(1.8, gun2World.x));
  gun2World.z = Math.max(-1.8, Math.min(1.8, gun2World.z));
  gun2World.y = Math.max(0.7, Math.min(2.8, gun2World.y));
}

function applyGun2Transform(gun2Root, gun2World, t, baseRotation) {
  if (!gun2Root || !gun2World) return;
  const resolvedBaseRotation = baseRotation || GUN2_BASE_ROTATION;
  const baseX = resolvedBaseRotation.rotationX;
  const baseY = resolvedBaseRotation.rotationY;
  const baseZ = resolvedBaseRotation.rotationZ;
  const bob2 = Math.cos(t * 8 + 1.1) * 0.008;
  gun2Root.rotation.set(baseX, baseY, baseZ + Math.sin(t * 8 + 1.1) * 0.02);
  gun2Root.position.set(gun2World.x, gun2World.y + bob2, gun2World.z);
}

export function applyGun2LocalTransform(gun2Root, gun2World, t, baseRotation) {
  applyGun2Transform(gun2Root, gun2World, t, baseRotation);
}

export function applyGun2RemoteTransform(gun2Root, gun2World, t, baseRotation) {
  applyGun2Transform(gun2Root, gun2World, t, baseRotation);
}
