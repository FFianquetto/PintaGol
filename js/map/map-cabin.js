/**
 * Decoración de mapa: cabaña (OBJ + textura en carpeta del modelo).
 * Ajusta posición/escala en `CABIN_CONFIG` o pasa override a `loadMapCabin`.
 */
import * as THREE from "three";
import { applyTextureToAstro, loadObjFirst, loadTextureFirst, prepTex } from "../astro-sync-assets.js";
import { registerMapStructureFootprintFromObject } from "./map-structure-collisions.js";
import { applyMapStructureShine } from "./map-structure-materials.js";

/** Mismo suelo que pinos y plano del mapa. */
const GROUND_Y = -0.02;

/**
 * Posición en el plano XZ (el centrado horizontal se hace con el AABB del modelo).
 * Valores apartados del origen para afinar colocación sin quedar en el centro del mapa.
 */
export const CABIN_CONFIG = {
  x: 34,
  z: -30,
  rotY: 0.42,
  /** Altura deseada en unidades de escena (mismo espacio que spawns / pines). */
  targetHeight: 12,
  /**
   * Metros extra hacia abajo para que la base quede enterrada un poco en el suelo.
   * Aumenta si quieres más hundimiento.
   */
  sinkIntoGround: 1.78,
  /** Inflado horizontal del rectángulo de colisión respecto al mesh (evita atravesar bordes). */
  collisionMargin: 0.52
};

function mergeCabinConfig(overrides) {
  return { ...CABIN_CONFIG, ...overrides };
}

/** Ligeramente por encima del brillo base (madera de cabaña). */
const CABIN_SHINE = {
  roughness: 0.64,
  metalness: 0.08,
  emissiveHex: 0x4a3a24,
  emissiveIntensity: 0.3
};

/**
 * Escala al `targetHeight` y apoya el modelo en el suelo, con centro XZ en (x, z).
 */
function placeCabinObject(obj, config) {
  const { x, z, rotY, targetHeight, sinkIntoGround = 0 } = config;
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
  const baseY = GROUND_Y - box.min.y - Math.max(0, sinkIntoGround);
  obj.position.set(x - center.x, baseY, z - center.z);
  obj.updateMatrixWorld(true);
}

function cabinObjUrlBases() {
  return ["Cabin/cabin.obj", "cabin/cabin.obj"];
}

function cabinTextureUrlBases() {
  return ["Cabin/cabin.jpg", "cabin/cabin.jpg"];
}

/**
 * @param {object} context
 * @param {THREE.Scene} context.scene
 * @param {number} context.aniso
 * @param {(rel: string) => string[]} context.pathsFor
 * @param {Partial<typeof CABIN_CONFIG>} [configOverride]
 */
export function loadMapCabin(context, configOverride) {
  const { scene, aniso, pathsFor } = context;
  if (!scene || !pathsFor) return;
  const config = mergeCabinConfig(configOverride || {});

  const objUrls = cabinObjUrlBases().flatMap((rel) => pathsFor(rel));
  const texUrls = cabinTextureUrlBases().flatMap((rel) => pathsFor(rel));

  const onObj = (obj) => {
    obj.name = "map-cabin-mesh";
    applyMapStructureShine(obj, CABIN_SHINE);
    placeCabinObject(obj, config);
    const group = new THREE.Group();
    group.name = "map-cabin";
    group.add(obj);
    scene.add(group);
    group.updateMatrixWorld(true);
    const colMargin = config.collisionMargin != null ? config.collisionMargin : 0.5;
    registerMapStructureFootprintFromObject(group, colMargin);
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
