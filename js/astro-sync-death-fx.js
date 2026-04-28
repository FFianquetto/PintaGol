/**
 * Explosión breve al eliminar un astronauta (local o remoto). Mismo efecto en todos los clientes:
 * cada uno ejecuta el FX cuando su estado pasa a `defeated` (sincronizado vía `modelo` / `damage`).
 * Sin red extra: posición = última del rig en escena.
 */
import * as THREE from "three";

const PARTICLE_COUNT = 108;
const DURATION_SEC = 0.95;
const HIDE_DELAY_MS = 480;

/**
 * @param {THREE.Scene} scene
 * @param {THREE.Vector3 | { x: number, y: number, z: number }} position Punto aprox. torso (mundo).
 * @param {number} [colorHex] Color del jugador para matizar chispas.
 * @param {(fn: (ctx: { camera: THREE.Camera, scene: THREE.Scene, dt: number, clock: THREE.Clock }) => void) => () => void} registerFrame Debe devolver `unregister` (como `registerPintagolSceneFrameHandler`).
 */
export function playAstronautDeathExplosion(scene, position, colorHex, registerFrame) {
  if (!scene || !position || typeof registerFrame !== "function") return;

  const root = new THREE.Group();
  root.name = "death-explosion-fx";
  if (position instanceof THREE.Vector3) {
    root.position.copy(position);
  } else {
    root.position.set(position.x, position.y, position.z);
  }

  const n = PARTICLE_COUNT;
  const posArr = new Float32Array(n * 3);
  const velArr = new Float32Array(n * 3);
  const colArr = new Float32Array(n * 3);
  const base = new THREE.Color(typeof colorHex === "number" ? colorHex : 0x3b82f6);
  const hot = new THREE.Color(0xffffff).lerp(base, 0.55);
  for (let i = 0; i < n; i += 1) {
    const ix = i * 3;
    const u = Math.random() * Math.PI * 2;
    const horiz = 1.75 + Math.random() * 3.4;
    velArr[ix] = Math.cos(u) * horiz;
    velArr[ix + 1] = 0.65 + Math.random() * 3.0;
    velArr[ix + 2] = Math.sin(u) * horiz;
    posArr[ix] = (Math.random() - 0.5) * 0.2;
    posArr[ix + 1] = (Math.random() - 0.5) * 0.16;
    posArr[ix + 2] = (Math.random() - 0.5) * 0.2;
    const c =
      i % 5 === 0
        ? hot.clone()
        : base
            .clone()
            .lerp(new THREE.Color(0xffffff), 0.12 + Math.random() * 0.18)
            .multiplyScalar(0.75 + Math.random() * 0.32);
    colArr[ix] = c.r;
    colArr[ix + 1] = c.g;
    colArr[ix + 2] = c.b;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.44,
    vertexColors: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const points = new THREE.Points(geom, mat);
  root.add(points);

  const light = new THREE.PointLight(0xffffff, 4.2, 36, 1.8);
  light.color.copy(base);
  light.position.set(0, 0.7, 0);
  root.add(light);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 10, 8),
    new THREE.MeshBasicMaterial({
      color: base.getHex(),
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  root.add(core);

  scene.add(root);

  let t = 0;
  const g = 3.2;
  const off = registerFrame(({ dt }) => {
    t += dt;
    const u = Math.min(1, t / DURATION_SEC);
    const posAttr = geom.attributes.position;
    for (let i = 0; i < n; i += 1) {
      const ix = i * 3;
      posAttr.array[ix] += velArr[ix] * dt;
      posAttr.array[ix + 1] += velArr[ix + 1] * dt;
      posAttr.array[ix + 2] += velArr[ix + 2] * dt;
      velArr[ix + 1] -= g * dt;
    }
    posAttr.needsUpdate = true;
    mat.opacity = Math.max(0, 1 - u * 1.12);
    light.intensity = 4.2 * (1 - u) * (1 - u);
    core.scale.setScalar(0.55 + u * 2.75);
    if (core.material && "opacity" in core.material) {
      core.material.opacity = 0.88 * (1 - u);
    }
    if (t >= DURATION_SEC) {
      off();
      scene.remove(root);
      geom.dispose();
      mat.dispose();
      core.geometry.dispose();
      if (core.material) core.material.dispose();
    }
  });
}

export { HIDE_DELAY_MS };
