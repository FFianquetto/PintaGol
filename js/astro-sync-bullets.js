import * as THREE from "three";

function applyColorToBulletMeshes(bullet, colorHex) {
  if (!bullet || colorHex == null) return;
  bullet.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => {
        const next = material ? material.clone() : new THREE.MeshStandardMaterial({ color: 0xffffff });
        next.map = null;
        next.color.setHex(colorHex);
        next.needsUpdate = true;
        return next;
      });
      return;
    }
    child.material = child.material.clone();
    child.material.map = null;
    child.material.color.setHex(colorHex);
    child.material.needsUpdate = true;
  });
}

export function spawnBullet({ template, shooter, speed, forward, colorHex }) {
  if (!template || !forward) return null;
  const bullet = template.clone(true);
  applyColorToBulletMeshes(bullet, colorHex);
  const spawnPos = new THREE.Vector3();
  if (shooter) shooter.getWorldPosition(spawnPos);
  const dir = forward.clone().normalize();
  spawnPos.addScaledVector(dir, 0.5);
  spawnPos.y += 0.06;
  bullet.position.copy(spawnPos);
  bullet.lookAt(spawnPos.clone().add(dir));
  bullet.userData.vel = dir.multiplyScalar(speed);
  bullet.userData.colorHex = colorHex;
  bullet.userData.prevPos = bullet.position.clone();
  return bullet;
}

export function spawnBulletAtPosition({ template, position, speed, forward, colorHex }) {
  if (!template || !position || !forward) return null;
  const bullet = template.clone(true);
  applyColorToBulletMeshes(bullet, colorHex);
  const pos = position.clone ? position.clone() : new THREE.Vector3(position.x || 0, position.y || 0, position.z || 0);
  const dir = forward.clone().normalize();
  bullet.position.copy(pos);
  bullet.lookAt(pos.clone().add(dir));
  bullet.userData.vel = dir.multiplyScalar(speed);
  bullet.userData.colorHex = colorHex;
  bullet.userData.prevPos = bullet.position.clone();
  return bullet;
}

export function updateBullets(scene, bullets, dt, maxDistance = 55) {
  if (!scene || !Array.isArray(bullets) || !bullets.length) return;
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const b = bullets[i];
    const v = b?.userData?.vel;
    if (!b || !v) {
      bullets.splice(i, 1);
      continue;
    }
    b.userData.prevPos = b.position.clone();
    b.position.addScaledVector(v, dt);
    const dist = Math.hypot(b.position.x, b.position.z);
    if (dist > maxDistance) {
      scene.remove(b);
      bullets.splice(i, 1);
    }
  }
}
