import * as THREE from "three";
import { applyTextureToAstro, loadFbxFirst, loadTextureFirst, prepTex } from "../astro-sync-assets.js";
import { applyMapStructureShine, DEFAULT_MAP_STRUCTURE_SHINE } from "./map-structure-materials.js";

const GROUND_Y = -0.02;

export const TENT_CONFIG = {
  x: -32,
  z: 26,
  rotY: -0.55,
  targetHeight: 8.4,
  sinkIntoGround: 0.03
};

const TENT_SHINE = {
  ...DEFAULT_MAP_STRUCTURE_SHINE,
  roughness: 0.68,
  metalness: 0.08,
  emissiveIntensity: 0.22
};

function placeObject(obj, config) {
  const { x, z, rotY, targetHeight, sinkIntoGround = 0 } = config;
  obj.rotation.set(0, rotY, 0);
  obj.updateMatrixWorld(true);
  const b0 = new THREE.Box3().setFromObject(obj);
  const size0 = b0.getSize(new THREE.Vector3());
  if (size0.y > 1e-6) obj.scale.setScalar(targetHeight / size0.y);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  const baseY = GROUND_Y - box.min.y - Math.max(0, sinkIntoGround);
  obj.position.set(x - center.x, baseY, z - center.z);
  obj.updateMatrixWorld(true);
}

export function loadMapTent(context, configOverride) {
  const { scene, aniso, pathsFor } = context || {};
  if (!scene || !pathsFor) return;
  const config = { ...TENT_CONFIG, ...(configOverride || {}) };
  const fbxUrls = ["tent/tent.fbx", "Tent/tent.fbx"].flatMap((rel) => pathsFor(rel));
  const texUrls = ["tent/tent.png", "Tent/tent.png"].flatMap((rel) => pathsFor(rel));

  loadTextureFirst(
    texUrls,
    (tex) => {
      prepTex(tex, aniso);
      loadFbxFirst(
        fbxUrls,
        (fbx) => {
          fbx.name = "map-tent-mesh";
          applyTextureToAstro(fbx, tex);
          applyMapStructureShine(fbx, TENT_SHINE);
          placeObject(fbx, config);
          const group = new THREE.Group();
          group.name = "map-tent";
          group.add(fbx);
          scene.add(group);
        },
        () => {}
      );
    },
    () => {
      loadFbxFirst(
        fbxUrls,
        (fbx) => {
          fbx.name = "map-tent-mesh";
          applyMapStructureShine(fbx, TENT_SHINE);
          placeObject(fbx, config);
          const group = new THREE.Group();
          group.name = "map-tent";
          group.add(fbx);
          scene.add(group);
        },
        () => {}
      );
    }
  );
}
