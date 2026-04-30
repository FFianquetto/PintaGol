import * as THREE from "three";
import { applyTextureToAstro, loadFbxFirst, loadObjFirst, loadTextureFirst, prepTex } from "../astro-sync-assets.js";
import { registerMapStructureFootprintFromObject } from "./map-structure-collisions.js";
import { applyMapStructureShine, DEFAULT_MAP_STRUCTURE_SHINE } from "./map-structure-materials.js";

const GROUND_Y = -0.02;

const DUMPSTER_LAYOUT = [
  { x: -12.8, z: 10.2, rotY: 1.05, targetHeight: 3.2, sinkIntoGround: 0.06, collisionMargin: 0.22 },
  { x: 14.5, z: 12.4, rotY: -0.55, targetHeight: 3.15, sinkIntoGround: 0.06, collisionMargin: 0.22 },
  { x: -18.6, z: -7.8, rotY: 0.35, targetHeight: 3.25, sinkIntoGround: 0.05, collisionMargin: 0.24 },
  { x: 6.8, z: -18.4, rotY: 1.42, targetHeight: 3.1, sinkIntoGround: 0.06, collisionMargin: 0.22 }
];

const DUMPSTER_SHINE = {
  ...DEFAULT_MAP_STRUCTURE_SHINE,
  roughness: 0.6,
  metalness: 0.2,
  emissiveIntensity: 0.12
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

export function loadMapDumpster(context) {
  const { scene, aniso, pathsFor } = context || {};
  if (!scene || !pathsFor) return;

  const spawnAllFromTemplate = (template) => {
    if (!template) return;
    for (let i = 0; i < DUMPSTER_LAYOUT.length; i += 1) {
      const cfg = DUMPSTER_LAYOUT[i];
      const model = template.clone(true);
      model.name = `map-dumpster-mesh-${i + 1}`;
      applyMapStructureShine(model, DUMPSTER_SHINE);
      placeObject(model, cfg);
      const group = new THREE.Group();
      group.name = `map-dumpster-${i + 1}`;
      group.add(model);
      scene.add(group);
      group.updateMatrixWorld(true);
      const m = cfg.collisionMargin != null ? cfg.collisionMargin : 0.22;
      registerMapStructureFootprintFromObject(group, m);
    }
  };

  const fbxUrls = ["dumpster/dumpster.fbx", "Dumpster/dumpster.fbx"].flatMap((rel) => pathsFor(rel));
  const objUrls = ["dumpster/dumpster.obj", "Dumpster/dumpster.obj"].flatMap((rel) => pathsFor(rel));
  const texUrls = ["dumpster/dumpster.jpg", "Dumpster/dumpster.jpg"].flatMap((rel) => pathsFor(rel));

  const loadObj = () => {
    loadTextureFirst(
      texUrls,
      (tex) => {
        prepTex(tex, aniso);
        loadObjFirst(
          objUrls,
          (obj) => {
            applyTextureToAstro(obj, tex);
            spawnAllFromTemplate(obj);
          },
          () => {}
        );
      },
      () => {
        loadObjFirst(
          objUrls,
          (obj) => spawnAllFromTemplate(obj),
          () => {}
        );
      }
    );
  };

  loadFbxFirst(
    fbxUrls,
    (fbx) => spawnAllFromTemplate(fbx),
    () => loadObj()
  );
}
