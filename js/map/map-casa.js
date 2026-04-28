/**
 * Casa en el mapa (OBJ + textura en `assets/models/casa/`).
 * Nombres habituales: `casa.obj` / `casa1.obj` y textura jpg/jpeg.
 * No registra colisiones en `map-structure-collisions` (el avatar puede atravesarla).
 */
import * as THREE from "three";
import { applyTextureToAstro, loadObjFirst, loadTextureFirst, prepTex } from "../astro-sync-assets.js";
import { applyMapStructureShine, DEFAULT_MAP_STRUCTURE_SHINE } from "./map-structure-materials.js";

const GROUND_Y = -0.02;

export const CASA_CONFIG = {
  x: -32,
  z: 26,
  rotY: -0.55,
  targetHeight: 14,
  /** Penetración en el suelo. */
  sinkIntoGround: 0,
  /** Despegue adicional del suelo. */
  liftAboveGround: 0.18,
};

const CASA_SHINE = {
  ...DEFAULT_MAP_STRUCTURE_SHINE,
  roughness: 0.65,
  emissiveIntensity: 0.26
};

function mergeCasaConfig(overrides) {
  return { ...CASA_CONFIG, ...overrides };
}

function placeCasaObject(obj, config) {
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

function casaObjUrlBases() {
  return ["casa/casa.obj", "casa/casa1.obj", "Casa/casa.obj", "Casa/casa1.obj"];
}

function casaTextureUrlBases() {
  return [
    "casa/casa.jpg",
    "casa/casa.jpeg",
    "casa/casa1.jpg",
    "casa/casa1.jpeg",
    "Casa/casa1.jpeg"
  ];
}

/**
 * @param {object} context
 * @param {THREE.Scene} context.scene
 * @param {number} context.aniso
 * @param {(rel: string) => string[]} context.pathsFor
 * @param {Partial<typeof CASA_CONFIG>} [configOverride]
 */
export function loadMapCasa(context, configOverride) {
  const { scene, aniso, pathsFor } = context;
  if (!scene || !pathsFor) return;
  const config = mergeCasaConfig(configOverride || {});

  const objUrls = casaObjUrlBases().flatMap((rel) => pathsFor(rel));
  const texUrls = casaTextureUrlBases().flatMap((rel) => pathsFor(rel));

  const onObj = (obj) => {
    obj.name = "map-casa-mesh";
    applyMapStructureShine(obj, CASA_SHINE);
    placeCasaObject(obj, config);
    const group = new THREE.Group();
    group.name = "map-casa";
    group.add(obj);
    scene.add(group);
    group.updateMatrixWorld(true);
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
