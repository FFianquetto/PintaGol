/**
 * Pozo de agua (pozoagua) + superficie con `agua/agua.obj` (mesh grande reescalado al interior del pozo).
 */
import * as THREE from "three";
import { applyTextureToAstro, loadObjFirst, loadTextureFirst, prepTex } from "../astro-sync-assets.js";
import { registerMapStructureFootprintFromObject } from "./map-structure-collisions.js";
import { applyMapStructureShine, DEFAULT_MAP_STRUCTURE_SHINE } from "./map-structure-materials.js";

const GROUND_Y = -0.02;

export const POZO_CONFIG = {
  x: 5,
  z: -11,
  rotY: 0.35,
  targetHeight: 6.4,
  sinkIntoGround: 0.48,
  liftAboveGround: 0,
  collisionMargin: 0.6,
  waterMaxDiameter: 5.1,
  /** Casi al fondo del brocal (cerca del “piso” interno), no flotando arriba. */
  waterLevelFrac: 0.1
};

const POZO_SHINE = {
  ...DEFAULT_MAP_STRUCTURE_SHINE,
  roughness: 0.7,
  metalness: 0.12,
  emissiveIntensity: 0.2
};

function mergeConfig(overrides) {
  return { ...POZO_CONFIG, ...overrides };
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

function wellObjBases() {
  return ["pozoagua/PosoAgua.obj", "pozoagua/pozoagua.obj", "PosoAgua/PosoAgua.obj"];
}

function wellTextureBases() {
  return ["pozoagua/pozoagua.png", "pozoagua/PosoAgua.png", "PozoAgua/pozoagua.png"];
}

function aguaObjBases() {
  return ["agua/agua.obj", "Agua/agua.obj"];
}

function aguaTextureBases() {
  return ["agua/agua.jpg", "agua/agua.png", "Agua/agua.jpg"];
}

function styleWaterMaterial(obj) {
  obj.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (let i = 0; i < mats.length; i += 1) {
      const m = mats[i];
      if (!m) continue;
      m.transparent = true;
      m.opacity = 0.86;
      m.depthWrite = false;
      if (m.color && m.color.lerp) m.color.lerp(new THREE.Color(0x4a9e9a), 0.25);
      m.needsUpdate = true;
    }
  });
}

/**
 * Escala el agua (muy ancho en el .obj) y la alinea al brocal en XZ; Y = fracción de la altura del pozo.
 */
function fitWaterToWell(waterObj, wellGroup, config) {
  const maxD = config.waterMaxDiameter != null ? config.waterMaxDiameter : 3.5;
  const frac = config.waterLevelFrac != null ? config.waterLevelFrac : 0.09;
  wellGroup.updateMatrixWorld(true);
  const wellBox = new THREE.Box3().setFromObject(wellGroup);
  const wellCx = (wellBox.min.x + wellBox.max.x) * 0.5;
  const wellCz = (wellBox.min.z + wellBox.max.z) * 0.5;
  const targetY = wellBox.min.y + frac * (wellBox.max.y - wellBox.min.y);
  waterObj.rotation.set(0, 0, 0);
  waterObj.position.set(0, 0, 0);
  waterObj.scale.set(1, 1, 1);
  waterObj.updateMatrixWorld(true);
  const b0 = new THREE.Box3().setFromObject(waterObj);
  const s0 = b0.getSize(new THREE.Vector3());
  const horiz = Math.max(s0.x, s0.z, 1e-6);
  const sc = maxD / horiz;
  waterObj.scale.setScalar(sc);
  waterObj.updateMatrixWorld(true);
  const b1 = new THREE.Box3().setFromObject(waterObj);
  const minY = b1.min.y;
  const cx = (b1.min.x + b1.max.x) * 0.5;
  const cz = (b1.min.z + b1.max.z) * 0.5;
  waterObj.position.set(wellCx - cx, targetY - minY, wellCz - cz);
  waterObj.name = "map-pozo-agua-surface";
  waterObj.updateMatrixWorld(true);
}

/**
 * @param {object} context
 * @param {THREE.Scene} context.scene
 * @param {number} context.aniso
 * @param {(rel: string) => string[]} context.pathsFor
 * @param {Partial<typeof POZO_CONFIG>} [configOverride]
 */
export function loadMapPozoAgua(context, configOverride) {
  const { scene, aniso, pathsFor } = context;
  if (!scene || !pathsFor) return;
  const config = mergeConfig(configOverride || {});

  const wellObjUrls = wellObjBases().flatMap((rel) => pathsFor(rel));
  const wellTexUrls = wellTextureBases().flatMap((rel) => pathsFor(rel));
  const aguaObjUrls = aguaObjBases().flatMap((rel) => pathsFor(rel));
  const aguaTexUrls = aguaTextureBases().flatMap((rel) => pathsFor(rel));

  const group = new THREE.Group();
  group.name = "map-pozo-agua";

  const loadWater = (wellMesh) => {
    loadTextureFirst(
      aguaTexUrls,
      (utex) => {
        prepTex(utex, aniso);
        loadObjFirst(
          aguaObjUrls,
          (aguaObj) => {
            applyTextureToAstro(aguaObj, utex);
            styleWaterMaterial(aguaObj);
            fitWaterToWell(aguaObj, group, config);
            group.add(aguaObj);
            group.updateMatrixWorld(true);
          },
          () => {}
        );
      },
      () => {
        loadObjFirst(
          aguaObjUrls,
          (aguaObj) => {
            styleWaterMaterial(aguaObj);
            fitWaterToWell(aguaObj, group, config);
            group.add(aguaObj);
            group.updateMatrixWorld(true);
          },
          () => {}
        );
      }
    );
  };

  loadTextureFirst(
    wellTexUrls,
    (wtx) => {
      prepTex(wtx, aniso);
      loadObjFirst(
        wellObjUrls,
        (wellObj) => {
          wellObj.name = "map-pozo-mesh";
          applyTextureToAstro(wellObj, wtx);
          applyMapStructureShine(wellObj, POZO_SHINE);
          placeObject(wellObj, config);
          group.add(wellObj);
          scene.add(group);
          group.updateMatrixWorld(true);
          const m = config.collisionMargin != null ? config.collisionMargin : 0.55;
          registerMapStructureFootprintFromObject(group, m);
          loadWater();
        },
        () => {
          loadObjFirst(
            wellObjUrls,
            (wellObj) => {
              wellObj.name = "map-pozo-mesh";
              applyMapStructureShine(wellObj, POZO_SHINE);
              placeObject(wellObj, config);
              group.add(wellObj);
              scene.add(group);
              group.updateMatrixWorld(true);
              registerMapStructureFootprintFromObject(
                group,
                config.collisionMargin != null ? config.collisionMargin : 0.55
              );
              loadWater();
            },
            () => {}
          );
        }
      );
    },
    () => {
      loadObjFirst(
        wellObjUrls,
        (wellObj) => {
          wellObj.name = "map-pozo-mesh";
          applyMapStructureShine(wellObj, POZO_SHINE);
          placeObject(wellObj, config);
          group.add(wellObj);
          scene.add(group);
          group.updateMatrixWorld(true);
          registerMapStructureFootprintFromObject(
            group,
            config.collisionMargin != null ? config.collisionMargin : 0.55
          );
          loadWater();
        },
        () => {}
      );
    }
  );
}
