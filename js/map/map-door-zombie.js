/**
 * Puerta decorativa exclusiva del modo zombie (`zombie-sync.html`).
 * No registra colisión (PvE: no bloquea frente al zombie ni a jugadores).
 */
import * as THREE from "three";
import { applyTextureToAstro, loadObjFirst, loadTextureFirst, prepTex } from "../astro-sync-assets.js";
import { applyMapStructureShine, DEFAULT_MAP_STRUCTURE_SHINE } from "./map-structure-materials.js";

const GROUND_Y = -0.02;

/** Marco visual en un sector distinto al spawn PvP típico. */
export const ZOMBIE_DOOR_CONFIG = {
  x: -10,
  z: 18,
  rotY: 1.05,
  targetHeight: 5.2,
  sinkIntoGround: 0.35,
  liftAboveGround: 0
};

const DOOR_SHINE = {
  ...DEFAULT_MAP_STRUCTURE_SHINE,
  roughness: 0.58,
  metalness: 0.1,
  emissiveIntensity: 0.18
};

function mergeConfig(overrides) {
  return { ...ZOMBIE_DOOR_CONFIG, ...overrides };
}

function placeDoor(obj, config) {
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

function doorObjBases() {
  return ["door/door.obj", "Door/door.obj"];
}

function doorTextureBases() {
  return ["door/door.jpg", "Door/door.jpg"];
}

/**
 * Carga la puerta en la escena de `getPintagolMapLoadContext()`.
 * @param {{ scene: THREE.Scene, aniso: number, pathsFor: (rel: string) => string[] }} context
 * @param {Partial<typeof ZOMBIE_DOOR_CONFIG>} [configOverride]
 */
export function loadZombieModeDoor(context, configOverride) {
  const { scene, aniso, pathsFor } = context;
  if (!scene || !pathsFor) return;
  const config = mergeConfig(configOverride || {});

  const objUrls = doorObjBases().flatMap((rel) => pathsFor(rel));
  const texUrls = doorTextureBases().flatMap((rel) => pathsFor(rel));

  const onObj = (obj) => {
    obj.name = "zombie-map-door-mesh";
    applyMapStructureShine(obj, DOOR_SHINE);
    placeDoor(obj, config);
    const group = new THREE.Group();
    group.name = "zombie-map-door";
    group.add(obj);
    scene.add(group);
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
