import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

export function applyAstroNeutral(obj) {
  obj.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((M) => {
      if (!M) return;
      M.color.setHex(0xffffff);
      M.needsUpdate = true;
    });
  });
}

export function prepTex(texture, anisotropy = 1) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.flipY = true;
  return texture;
}

export function applyTextureToAstro(obj, texture) {
  obj.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((M) => {
      if (!M) return;
      M.map = texture;
      M.color.setHex(0xffffff);
      M.needsUpdate = true;
    });
  });
}

export function prepAstroComoArena(astro, astroScale) {
  astro.scale.setScalar(astroScale);
  astro.rotation.set(0, -1.8, 0);
  astro.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(astro);
  const c = b.getCenter(new THREE.Vector3());
  astro.position.set(-c.x, -b.min.y, -c.z);
}

export function configureGunMaterials(object, texture) {
  object.traverse((child) => {
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

export function setupGunMesh(gun, gunTex, worldScale, position, options = {}) {
  const { scale = 0.012, rotationX = 0.08, rotationY = Math.PI / 2, rotationZ = -0.22 } = options;
  configureGunMaterials(gun, gunTex);
  gun.scale.setScalar(scale * worldScale);
  gun.rotation.set(rotationX, rotationY, rotationZ);
  gun.name = "weapon-model";
  gun.position.set(position.x, position.y, position.z);
}

export function loadTextureFirst(urls, onLoad, onFail) {
  let i = 0;
  const txL = new THREE.TextureLoader();
  function next() {
    if (i >= urls.length) {
      if (onFail) onFail();
      return;
    }
    txL.load(
      urls[i++],
      (t) => onLoad(t),
      undefined,
      next
    );
  }
  next();
}

export function loadFbxFirst(urls, onLoad, onFail) {
  let i = 0;
  const fbxL = new FBXLoader();
  function next() {
    if (i >= urls.length) {
      if (onFail) onFail();
      return;
    }
    fbxL.load(
      urls[i++],
      (m) => onLoad(m),
      undefined,
      next
    );
  }
  next();
}
