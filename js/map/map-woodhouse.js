import * as THREE from "three";
import { applyTextureToAstro, loadFbxFirst, loadTextureFirst, prepTex } from "../astro-sync-assets.js";
import { registerMapStructureFootprintFromObject } from "./map-structure-collisions.js";
import { applyMapStructureShine, DEFAULT_MAP_STRUCTURE_SHINE } from "./map-structure-materials.js";

const GROUND_Y = -0.02;

export const WOODHOUSE_CONFIG = {
  x: 34,
  z: -30,
  rotY: 0.42,
  targetHeight: 12,
  sinkIntoGround: 0.16,
  collisionMargin: 0.52
};

const WOODHOUSE_SHINE = {
  ...DEFAULT_MAP_STRUCTURE_SHINE,
  roughness: 0.64,
  metalness: 0.08,
  emissiveIntensity: 0.26,
  emissiveHex: 0x4a2f1a
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

export function loadMapWoodhouse(context, configOverride) {
  const { scene, aniso, pathsFor } = context || {};
  if (!scene || !pathsFor) return;
  const config = { ...WOODHOUSE_CONFIG, ...(configOverride || {}) };
  const fbxUrls = ["woodhouse/Wood_house.fbx", "Woodhouse/Wood_house.fbx"].flatMap((rel) => pathsFor(rel));
  const texUrls = [
    "woodhouse/Wood_house_Albedo.1001.jpg",
    "woodhouse/Wood_house_BaseColor.1001.jpg",
    "woodhouse/Wood_house_Normal.1001.jpg"
  ].flatMap((rel) => pathsFor(rel));

  const onModel = (fbx) => {
    fbx.name = "map-woodhouse-mesh";
    fbx.traverse((child) => {
      if (!child?.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        if (!m) return;
        if (!m.map && m.color?.setHex) m.color.setHex(0x8b5a2b);
      });
    });
    applyMapStructureShine(fbx, WOODHOUSE_SHINE);
    placeObject(fbx, config);
    const group = new THREE.Group();
    group.name = "map-woodhouse";
    group.add(fbx);
    scene.add(group);
    group.updateMatrixWorld(true);
    registerMapStructureFootprintFromObject(group, config.collisionMargin != null ? config.collisionMargin : 0.52);
  };

  loadTextureFirst(
    texUrls,
    (tex) => {
      prepTex(tex, aniso);
      loadFbxFirst(
        fbxUrls,
        (fbx) => {
          applyTextureToAstro(fbx, tex);
          onModel(fbx);
        },
        () => {}
      );
    },
    () => {
      loadFbxFirst(
        fbxUrls,
        (fbx) => onModel(fbx),
        () => {}
      );
    }
  );
}
