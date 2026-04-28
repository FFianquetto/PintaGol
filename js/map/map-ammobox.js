/**
 * Caja de munición / contenedor (OBJ + textura en `assets/models/ammobox/`).
 * El archivo en disco puede llamarse `amoobox.obj` (typo) o `ammobox.obj`.
 */
import * as THREE from "three";
import { applyTextureToAstro, loadObjFirst, loadTextureFirst, prepTex } from "../astro-sync-assets.js";
import { registerMapStructureFootprintFromObject } from "./map-structure-collisions.js";
import { applyMapStructureShine, DEFAULT_MAP_STRUCTURE_SHINE } from "./map-structure-materials.js";

const GROUND_Y = -0.02;

export const AMMOBOX_CONFIG = {
  /** Cerca del centro del mapa (~0, 0). */
  x: 2.5,
  z: -1.5,
  rotY: 0.35,
  targetHeight: 1.78,
  sinkIntoGround: 0.12,
  liftAboveGround: 0,
  collisionMargin: 0.22
};

const AMMOBOX_SHINE = {
  ...DEFAULT_MAP_STRUCTURE_SHINE,
  roughness: 0.55,
  metalness: 0.22,
  emissiveHex: 0x2c2835,
  emissiveIntensity: 0.16
};

function mergeConfig(overrides) {
  return { ...AMMOBOX_CONFIG, ...overrides };
}

function placeObject(obj, config) {
  const { x, z, rotY, targetHeight, sinkIntoGround = 0, liftAboveGround = 0 } = config;
  obj.rotation.set(0, rotY, 0);
  obj.updateMatrixWorld(true);
  const b0 = new THREE.Box3().setFromObject(obj);
  const size0 = b0.getSize(new THREE.Vector3());
  if (size0.y > 1e-6) {
    obj.scale.setScalar(targetHeight / size0.y);
  }
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  const baseY = GROUND_Y - box.min.y - Math.max(0, sinkIntoGround) + (liftAboveGround || 0);
  obj.position.set(x - center.x, baseY, z - center.z);
  obj.updateMatrixWorld(true);
}

function objUrlBases() {
  return ["ammobox/amoobox.obj", "ammobox/ammobox.obj", "Ammobox/ammobox.obj"];
}

function textureUrlBases() {
  return ["ammobox/ammobox.png", "ammobox/ammobox.jpg", "Ammobox/ammobox.png"];
}

/**
 * @param {object} context
 * @param {THREE.Scene} context.scene
 * @param {number} context.aniso
 * @param {(rel: string) => string[]} context.pathsFor
 * @param {Partial<typeof AMMOBOX_CONFIG>} [configOverride]
 */
export function loadMapAmmobox(context, configOverride) {
  const { scene, aniso, pathsFor } = context;
  if (!scene || !pathsFor) return;
  const config = mergeConfig(configOverride || {});

  const objUrls = objUrlBases().flatMap((rel) => pathsFor(rel));
  const texUrls = textureUrlBases().flatMap((rel) => pathsFor(rel));

  const onObj = (obj) => {
    obj.name = "map-ammobox-mesh";
    applyMapStructureShine(obj, AMMOBOX_SHINE);
    placeObject(obj, config);
    const group = new THREE.Group();
    group.name = "map-ammobox";
    group.add(obj);
    scene.add(group);
    group.updateMatrixWorld(true);
    const m = config.collisionMargin != null ? config.collisionMargin : 0.22;
    registerMapStructureFootprintFromObject(group, m);
  };

  loadTextureFirst(
    texUrls,
    (tex) => {
      prepTex(tex, aniso);
      loadObjFirst(
        objUrls,
        (raw) => {
          applyTextureToAstro(raw, tex);
          onObj(raw);
        },
        () => {
          loadObjFirst(
            objUrls,
            (raw) => {
              applyTextureToAstro(raw, tex);
              onObj(raw);
            },
            () => {}
          );
        }
      );
    },
    () => {
      loadObjFirst(
        objUrls,
        (raw) => {
          onObj(raw);
        },
        () => {}
      );
    }
  );
}
