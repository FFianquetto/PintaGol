import * as THREE from "three";
import { applyTextureToAstro, loadFbxFirst, loadObjFirst, loadTextureFirst, prepTex } from "../astro-sync-assets.js";
import { applyMapStructureShine, DEFAULT_MAP_STRUCTURE_SHINE } from "./map-structure-materials.js";

const GROUND_Y = -0.02;

const SIGN_CONFIG = {
  x: 8.4,
  z: 16.2,
  rotY: 0.35,
  targetHeight: 4.2,
  sinkIntoGround: 0.04
};

const SIGN_SHINE = {
  ...DEFAULT_MAP_STRUCTURE_SHINE,
  roughness: 0.7,
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

export function loadMapSign(context) {
  const { scene, aniso, pathsFor } = context || {};
  if (!scene || !pathsFor) return;

  const onModel = (model) => {
    model.name = "map-sign-mesh";
    applyMapStructureShine(model, SIGN_SHINE);
    placeObject(model, SIGN_CONFIG);
    const group = new THREE.Group();
    group.name = "map-sign";
    group.add(model);
    scene.add(group);
  };

  const fbxUrls = ["sign/sign.fbx", "Sign/sign.fbx"].flatMap((rel) => pathsFor(rel));
  const objUrls = ["sign/sign.obj", "Sign/sign.obj"].flatMap((rel) => pathsFor(rel));
  const texUrls = ["sign/sign.png", "sign/sign.jpg", "Sign/sign.png", "Sign/sign.jpg"].flatMap((rel) => pathsFor(rel));

  const loadObj = () => {
    loadTextureFirst(
      texUrls,
      (tex) => {
        prepTex(tex, aniso);
        loadObjFirst(
          objUrls,
          (obj) => {
            applyTextureToAstro(obj, tex);
            onModel(obj);
          },
          () => {}
        );
      },
      () => {
        loadObjFirst(
          objUrls,
          (obj) => onModel(obj),
          () => {}
        );
      }
    );
  };

  loadFbxFirst(
    fbxUrls,
    (fbx) => onModel(fbx),
    () => loadObj()
  );
}
