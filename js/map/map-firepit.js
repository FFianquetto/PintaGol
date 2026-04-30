import * as THREE from "three";
import { applyTextureToAstro, loadFbxFirst, loadTextureFirst, prepTex } from "../astro-sync-assets.js";
import { applyMapStructureShine, DEFAULT_MAP_STRUCTURE_SHINE } from "./map-structure-materials.js";

const GROUND_Y = -0.02;

export const FIREPIT_CONFIG = {
  x: -6.4,
  z: 8.2,
  rotY: 0.28,
  targetHeight: 3.25,
  sinkIntoGround: 0.22
};

const FIREPIT_SHINE = {
  ...DEFAULT_MAP_STRUCTURE_SHINE,
  roughness: 0.66,
  metalness: 0.08,
  emissiveIntensity: 0.14
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

export function loadMapFirepit(context, configOverride) {
  const { scene, aniso, pathsFor } = context || {};
  if (!scene || !pathsFor) return;
  const config = { ...FIREPIT_CONFIG, ...(configOverride || {}) };

  const fbxUrls = ["firepit/FirePit.fbx", "Firepit/FirePit.fbx"].flatMap((rel) => pathsFor(rel));
  const texUrls = ["firepit/FirePit_Albedo.png", "Firepit/FirePit_Albedo.png"].flatMap((rel) => pathsFor(rel));

  loadTextureFirst(
    texUrls,
    (tex) => {
      prepTex(tex, aniso);
      loadFbxFirst(
        fbxUrls,
        (fbx) => {
          fbx.name = "map-firepit-mesh";
          applyTextureToAstro(fbx, tex);
          applyMapStructureShine(fbx, FIREPIT_SHINE);
          placeObject(fbx, config);
          const group = new THREE.Group();
          group.name = "map-firepit";
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
          fbx.name = "map-firepit-mesh";
          applyMapStructureShine(fbx, FIREPIT_SHINE);
          placeObject(fbx, config);
          const group = new THREE.Group();
          group.name = "map-firepit";
          group.add(fbx);
          scene.add(group);
        },
        () => {}
      );
    }
  );
}
