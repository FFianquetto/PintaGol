/**
 * Apariencia común para estructuras del mapa (madera, piedra, etc.): menos “apagado”, algo de brillo.
 * Usar `applyMapStructureShine` en cada OBJ/FBX después de asignar texturas o materiales base.
 */

/**
 * Valores por defecto para reutilizar en puentes, pozos, casas, etc.
 * Pasa un segundo argumento para sobreescribir solo lo que necesites.
 */
export const DEFAULT_MAP_STRUCTURE_SHINE = {
  roughness: 0.66,
  metalness: 0.07,
  emissiveHex: 0x3d3120,
  emissiveIntensity: 0.24
};

/**
 * @param {THREE.Object3D} object3D
 * @param {Partial<typeof DEFAULT_MAP_STRUCTURE_SHINE>} [options]
 */
export function applyMapStructureShine(object3D, options = {}) {
  const cfg = { ...DEFAULT_MAP_STRUCTURE_SHINE, ...options };
  object3D.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (let i = 0; i < mats.length; i += 1) {
      const m = mats[i];
      if (!m) continue;
      if (m.roughness != null) m.roughness = cfg.roughness;
      if (m.metalness != null) m.metalness = cfg.metalness;
      if (m.emissive && m.emissive.setHex) {
        m.emissive.setHex(cfg.emissiveHex);
      }
      if (m.emissiveIntensity !== undefined) {
        m.emissiveIntensity = cfg.emissiveIntensity;
      }
      m.needsUpdate = true;
    }
  });
}
