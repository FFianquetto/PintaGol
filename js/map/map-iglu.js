import * as THREE from "three";
import { loadFbxFirst } from "../astro-sync-assets.js";
import { applyMapStructureShine, DEFAULT_MAP_STRUCTURE_SHINE } from "./map-structure-materials.js";

const GROUND_Y = -0.02;

export const IGLU_CONFIG = {
  x: -32,
  z: 26,
  rotY: -0.55 + (Math.PI * 2) / 3,
  targetHeight: 9.6,
  sinkIntoGround: 0.02,
  liftAboveGround: 0
};

const IGLU_SHINE = {
  ...DEFAULT_MAP_STRUCTURE_SHINE,
  roughness: 0.66,
  metalness: 0.06,
  emissiveIntensity: 0.32
};

function placeObject(obj, config) {
  const { x, z, rotY, targetHeight, sinkIntoGround = 0, liftAboveGround = 0 } = config;
  obj.rotation.set(0, rotY, 0);
  obj.updateMatrixWorld(true);
  const b0 = new THREE.Box3().setFromObject(obj);
  const size0 = b0.getSize(new THREE.Vector3());
  if (size0.y > 1e-6) obj.scale.setScalar(targetHeight / size0.y);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  const baseY = GROUND_Y - box.min.y - Math.max(0, sinkIntoGround) + (liftAboveGround || 0);
  obj.position.set(x - center.x, baseY, z - center.z);
  obj.updateMatrixWorld(true);
}

export function loadMapIglu(context, configOverride) {
  const { scene, pathsFor } = context || {};
  if (!scene || !pathsFor) return;
  const config = { ...IGLU_CONFIG, ...(configOverride || {}) };
  const fbxUrls = ["iglu/iglu.fbx", "Iglu/iglu.fbx"].flatMap((rel) => pathsFor(rel));
  loadFbxFirst(
    fbxUrls,
    (fbx) => {
      fbx.name = "map-iglu-mesh";
      applyMapStructureShine(fbx, IGLU_SHINE);
      placeObject(fbx, config);
      const group = new THREE.Group();
      group.name = "map-iglu";
      group.add(fbx);
      const igluLight = new THREE.PointLight(0xc7e8ff, 1.35, 22, 2);
      igluLight.position.set(0, Math.max(2.2, config.targetHeight * 0.35), 0);
      group.add(igluLight);
      scene.add(group);
    },
    () => {}
  );
}
