import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const TROPHY_BASE_Y = -0.43;

/** Same studio lighting as `PayoutAwardCanvas` on the dashboard. */
export function addDashboardAwardLights(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const hemi = new THREE.HemisphereLight(0xfff6e0, 0x1c2c26, 0.7);
  hemi.position.set(0, 1, 0);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff4dc, 2.8);
  key.position.set(3.6, 2.4, 3.2);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xc5e0ff, 1.35);
  fill.position.set(-3.8, 0.6, 2.2);
  scene.add(fill);

  const bounce = new THREE.DirectionalLight(0xffffff, 1.05);
  bounce.position.set(0.4, -1.4, 3.4);
  scene.add(bounce);
}

export function attachAwardEnvironment(renderer, scene) {
  try {
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envMap = pmrem.fromScene(room, 0.04).texture;
    scene.environment = envMap;
    room.dispose();
    pmrem.dispose();
    return () => {
      if (scene.environment === envMap) scene.environment = null;
      envMap.dispose();
    };
  } catch {
    return () => {};
  }
}

function ensureAwardNormals(mesh) {
  if (!mesh.geometry.getAttribute("normal")) {
    mesh.geometry.computeVertexNormals();
  }
}

function applyMetalFinish(root, finish) {
  const material = new THREE.MeshStandardMaterial({
    color: finish.color,
    metalness: finish.metalness,
    roughness: finish.roughness,
    envMapIntensity: 1.3,
  });
  root.traverse((child) => {
    if (!child.isMesh) return;
    ensureAwardNormals(child);
    child.material = material;
    child.castShadow = false;
    child.receiveShadow = false;
  });
}

/** Silver cup + dark plinth — same split as dashboard `cloneTrophy`. */
export function applyTrophyFinish(root) {
  const silver = new THREE.MeshStandardMaterial({
    color: "#e2e8ee",
    metalness: 0.94,
    roughness: 0.14,
    envMapIntensity: 1.25,
  });
  const plinth = new THREE.MeshStandardMaterial({
    color: "#080b09",
    metalness: 0.12,
    roughness: 0.72,
    envMapIntensity: 0.4,
  });

  root.traverse((child) => {
    if (!child.isMesh) return;
    ensureAwardNormals(child);
    const geometry = child.geometry.clone();
    const index = geometry.getIndex();
    const positions = geometry.attributes.position;
    if (!index || !positions) {
      child.material = silver;
      child.castShadow = false;
      child.receiveShadow = false;
      return;
    }

    const cup = [];
    const stand = [];
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      const y =
        (positions.getY(a) + positions.getY(b) + positions.getY(c)) / 3;
      (y < TROPHY_BASE_Y ? stand : cup).push(a, b, c);
    }

    const next = new Uint32Array(cup.length + stand.length);
    next.set(cup, 0);
    next.set(stand, cup.length);
    geometry.setIndex(new THREE.BufferAttribute(next, 1));
    geometry.clearGroups();
    geometry.addGroup(0, cup.length, 0);
    geometry.addGroup(cup.length, stand.length, 1);
    child.geometry = geometry;
    child.material = [silver, plinth];
    child.castShadow = false;
    child.receiveShadow = false;
  });
}

export function finishAwardModel(root, award) {
  if (award === "bronze") {
    applyMetalFinish(root, {
      color: "#d4894a",
      metalness: 0.8,
      roughness: 0.24,
    });
    return;
  }
  if (award === "crown") {
    applyMetalFinish(root, {
      color: "#f0c45a",
      metalness: 0.9,
      roughness: 0.16,
    });
    return;
  }
  applyTrophyFinish(root);
}

/** Camera match for `PayoutAwardCanvas` (fov 32, slight lift, fit margin 1.22). */
export function frameAward(camera, model, margin = 1.22) {
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  model.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const fov = 32 * (Math.PI / 180);
  const dist = (maxDim * margin) / (2 * Math.tan(fov / 2));
  camera.fov = 32;
  camera.position.set(0, maxDim * 0.03, dist);
  camera.near = Math.max(0.01, dist / 100);
  camera.far = dist * 20;
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

export function configureAwardRenderer(renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
}
