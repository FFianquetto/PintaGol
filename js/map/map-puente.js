/**
 * Puente (OBJ + textura en `assets/models/puente/` o `Puente/`).
 */
import * as THREE from "three";
import { applyTextureToAstro, loadObjFirst, loadTextureFirst, prepTex } from "../astro-sync-assets.js";
import { registerMapStructureFootprintFromObject } from "./map-structure-collisions.js";
import { applyMapStructureShine, DEFAULT_MAP_STRUCTURE_SHINE } from "./map-structure-materials.js";

const GROUND_Y = -0.02;

export const PUENTE_CONFIG = {
  x: 5,
  z: -11,
  /** Alinea el tramo largo del mesh; ajusta in-game si hace falta. */
  rotY: 0.35,
  targetHeight: 3.6,
  sinkIntoGround: 0.78,
  liftAboveGround: 0,
  collisionMargin: 0.75
};

const PUENTE_SHINE = {
  ...DEFAULT_MAP_STRUCTURE_SHINE,
  roughness: 0.68,
  metalness: 0.06,
  emissiveIntensity: 0.22
};

function mergeConfig(overrides) {
  return { ...PUENTE_CONFIG, ...overrides };
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
  return ["puente/puente.obj", "Puente/Puente.obj", "Puente/puente.obj"];
}

function textureUrlBases() {
  return ["puente/puente.png", "Puente/puente.png", "puente/lambert1_baseColor.png"];
}

/**
 * @param {object} context
 * @param {THREE.Scene} context.scene
 * @param {number} context.aniso
 * @param {(rel: string) => string[]} context.pathsFor
 * @param {Partial<typeof PUENTE_CONFIG>} [configOverride]
 */
export function loadMapPuente(context, configOverride) {
  const { scene, aniso, pathsFor } = context;
  if (!scene || !pathsFor) return;
  const config = mergeConfig(configOverride || {});

  const objUrls = objUrlBases().flatMap((rel) => pathsFor(rel));
  const texUrls = textureUrlBases().flatMap((rel) => pathsFor(rel));

  const onObj = (obj) => {
    obj.name = "map-puente-mesh";
    applyMapStructureShine(obj, PUENTE_SHINE);
    placeObject(obj, config);
    const group = new THREE.Group();
    group.name = "map-puente";
    group.add(obj);
    scene.add(group);
    group.updateMatrixWorld(true);
    const m = config.collisionMargin != null ? config.collisionMargin : 0.75;
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
