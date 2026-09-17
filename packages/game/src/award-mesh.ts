import {
  Color,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Uint32BufferAttribute,
} from "three";

export type AwardMetalFinish = {
  color: string;
  metalness: number;
  roughness: number;
};

/** Meshy exports are position-only; lighting needs generated normals to read relief. */
export function ensureAwardNormals(mesh: Mesh) {
  if (!mesh.geometry.getAttribute("normal")) {
    mesh.geometry.computeVertexNormals();
  }
}

export function applyAwardMetalFinish(
  root: Object3D,
  finish: AwardMetalFinish,
) {
  root.traverse((child: Object3D) => {
    if (!(child instanceof Mesh)) return;
    ensureAwardNormals(child);
    child.material = new MeshStandardMaterial({
      color: finish.color,
      metalness: finish.metalness,
      roughness: finish.roughness,
      envMapIntensity: 1.3,
    });
  });
}

const MARK_BLACK = new Color("#000000");
const BETA_LETTER_Z = 0.067;
const BETA_LETTER_RADIUS = 0.66;
const BETA_FACE_Z = 0.0508;
const BETA_MASK_GRID = 360;
const BETA_MASK_MIN = -0.72;
const BETA_MASK_SPAN = 1.44;
const TROPHY_BASE_Y = -0.43;

const preparedTemplates = new Map<string, Object3D>();

/**
 * High relief is black. Shallow stems (the I in CERTIFIED) never reach
 * letter-top height, so pick them up as thin vertical mid-relief runs.
 */
function buildBetaLetterTest(root: Object3D) {
  const grid = BETA_MASK_GRID;
  const maxZ = new Float32Array(grid * grid);
  const hits = new Uint16Array(grid * grid);
  const toCell = (x: number, y: number) => {
    const ix = Math.floor(((x - BETA_MASK_MIN) / BETA_MASK_SPAN) * grid);
    const iy = Math.floor(((y - BETA_MASK_MIN) / BETA_MASK_SPAN) * grid);
    if (ix < 0 || iy < 0 || ix >= grid || iy >= grid) return -1;
    return iy * grid + ix;
  };

  root.traverse((child: Object3D) => {
    if (!(child instanceof Mesh)) return;
    const positions = child.geometry.attributes.position;
    if (!positions) return;
    const arr = positions.array;
    for (let i = 0; i < positions.count; i++) {
      const x = arr[i * 3];
      const y = arr[i * 3 + 1];
      const z = arr[i * 3 + 2];
      if (z < BETA_FACE_Z || Math.hypot(x, y) > BETA_LETTER_RADIUS) continue;
      const k = toCell(x, y);
      if (k < 0) continue;
      hits[k]++;
      if (z > maxZ[k]) maxZ[k] = z;
    }
  });

  const letter = new Uint8Array(grid * grid);
  for (let k = 0; k < letter.length; k++) {
    if (maxZ[k] > BETA_LETTER_Z) letter[k] = 1;
  }

  const seen = new Uint8Array(grid * grid);
  const nbr = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ] as const;
  const cellSize = BETA_MASK_SPAN / grid;
  for (let start = 0; start < letter.length; start++) {
    if (seen[start] || hits[start] < 2 || maxZ[start] < BETA_FACE_Z) continue;
    const stack = [start];
    seen[start] = 1;
    const cells = [start];
    let minX = grid;
    let maxX = 0;
    let minY = grid;
    let maxY = 0;
    let high = 0;
    while (stack.length) {
      const k = stack.pop()!;
      const ix = k % grid;
      const iy = (k / grid) | 0;
      if (ix < minX) minX = ix;
      if (ix > maxX) maxX = ix;
      if (iy < minY) minY = iy;
      if (iy > maxY) maxY = iy;
      if (maxZ[k] > BETA_LETTER_Z) high++;
      for (const [dx, dy] of nbr) {
        const jx = ix + dx;
        const jy = iy + dy;
        if (jx < 0 || jy < 0 || jx >= grid || jy >= grid) continue;
        const j = jy * grid + jx;
        if (seen[j] || hits[j] < 2 || maxZ[j] < BETA_FACE_Z) continue;
        seen[j] = 1;
        stack.push(j);
        cells.push(j);
      }
    }
    const width = (maxX - minX + 1) * cellSize;
    const height = (maxY - minY + 1) * cellSize;
    const thinStem =
      cells.length >= 40 &&
      high / cells.length < 0.08 &&
      height / Math.max(width, 1e-6) >= 3 &&
      width < 0.04;
    if (thinStem) {
      for (const k of cells) letter[k] = 1;
    }
  }

  const dilated = new Uint8Array(letter);
  for (let iy = 1; iy < grid - 1; iy++) {
    for (let ix = 1; ix < grid - 1; ix++) {
      if (!letter[iy * grid + ix]) continue;
      dilated[iy * grid + ix - 1] = 1;
      dilated[iy * grid + ix + 1] = 1;
      dilated[(iy - 1) * grid + ix] = 1;
      dilated[(iy + 1) * grid + ix] = 1;
    }
  }

  return (x: number, y: number, z: number) => {
    if (z <= BETA_FACE_Z || Math.hypot(x, y) >= BETA_LETTER_RADIUS) return false;
    if (z > BETA_LETTER_Z) return true;
    const k = toCell(x, y);
    return k >= 0 && dilated[k] === 1;
  };
}

function blackMarkMaterial() {
  return new MeshBasicMaterial({
    color: MARK_BLACK,
    toneMapped: false,
  });
}

function bodyMaterial(finish: AwardMetalFinish) {
  return new MeshStandardMaterial({
    color: finish.color,
    metalness: finish.metalness,
    roughness: finish.roughness,
    envMapIntensity: 1.3,
  });
}

/**
 * Process a GLB once, then cheap-clone it. Geometry and mark materials are
 * shared; one Object3D still cannot live in two canvases.
 */
export function clonePreparedAward(
  source: Object3D,
  key: string,
  prepare: (root: Object3D) => void,
): Object3D {
  let template = preparedTemplates.get(key);
  if (!template) {
    template = source.clone(true);
    prepare(template);
    preparedTemplates.set(key, template);
  }
  return template.clone(true);
}

function retintBody(root: Object3D, finish: AwardMetalFinish) {
  const bodyMat = bodyMaterial(finish);
  root.traverse((child: Object3D) => {
    if (!(child instanceof Mesh)) return;
    if (Array.isArray(child.material)) {
      child.material = [bodyMat, child.material[1]];
    } else {
      child.material = bodyMat;
    }
  });
}

function applyReliefMarkFinish(
  root: Object3D,
  body: AwardMetalFinish,
  isMark: (x: number, y: number, z: number) => boolean,
) {
  const bodyMat = bodyMaterial(body);
  const markMat = blackMarkMaterial();

  root.traverse((child: Object3D) => {
    if (!(child instanceof Mesh)) return;
    ensureAwardNormals(child);
    const geometry = child.geometry.clone();
    const index = geometry.getIndex();
    const positions = geometry.attributes.position;
    if (!index || !positions) {
      child.material = bodyMat;
      return;
    }

    const bodyTris: number[] = [];
    const markTris: number[] = [];
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      const marks =
        Number(
          isMark(positions.getX(a), positions.getY(a), positions.getZ(a)),
        ) +
        Number(
          isMark(positions.getX(b), positions.getY(b), positions.getZ(b)),
        ) +
        Number(
          isMark(positions.getX(c), positions.getY(c), positions.getZ(c)),
        );
      (marks >= 2 ? markTris : bodyTris).push(a, b, c);
    }

    const next = new Uint32Array(bodyTris.length + markTris.length);
    next.set(bodyTris, 0);
    next.set(markTris, bodyTris.length);
    geometry.setIndex(new Uint32BufferAttribute(next, 1));
    geometry.clearGroups();
    geometry.addGroup(0, bodyTris.length, 0);
    geometry.addGroup(bodyTris.length, markTris.length, 1);
    child.geometry = geometry;
    child.material = [bodyMat, markMat];
  });
}

/** Gold coin body, black “CERTIFIED BETA” relief. */
export function applyBetaCoinFinish(root: Object3D) {
  applyReliefMarkFinish(
    root,
    { color: "#f4cc62", metalness: 0.9, roughness: 0.16 },
    buildBetaLetterTest(root),
  );
}

export function cloneBetaCoin(source: Object3D) {
  return clonePreparedAward(source, "beta-coin-v2", applyBetaCoinFinish);
}

export function cloneRibbonMedal(source: Object3D, body: AwardMetalFinish) {
  const clone = clonePreparedAward(source, "ribbon-body", (root) => {
    applyAwardMetalFinish(root, body);
  });
  retintBody(clone, body);
  return clone;
}

export function cloneGoldCrown(source: Object3D) {
  return clonePreparedAward(source, "gold-crown", (root) => {
    applyAwardMetalFinish(root, {
      color: "#f0c45a",
      metalness: 0.9,
      roughness: 0.16,
    });
  });
}

/** Silver cup, black plinth. Logo stays in the metal. */
export function applyTrophyFinish(root: Object3D) {
  const silver = new MeshStandardMaterial({
    color: "#e2e8ee",
    metalness: 0.94,
    roughness: 0.14,
    envMapIntensity: 1.25,
  });
  const plinth = new MeshStandardMaterial({
    color: "#080b09",
    metalness: 0.12,
    roughness: 0.72,
    envMapIntensity: 0.4,
  });

  root.traverse((child: Object3D) => {
    if (!(child instanceof Mesh)) return;
    ensureAwardNormals(child);
    const geometry = child.geometry.clone();
    const index = geometry.getIndex();
    const positions = geometry.attributes.position;
    if (!index || !positions) {
      child.material = silver;
      return;
    }

    const cup: number[] = [];
    const stand: number[] = [];
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
    geometry.setIndex(new Uint32BufferAttribute(next, 1));
    geometry.clearGroups();
    geometry.addGroup(0, cup.length, 0);
    geometry.addGroup(cup.length, stand.length, 1);
    child.geometry = geometry;
    child.material = [silver, plinth];
  });
}

export function cloneTrophy(source: Object3D) {
  return clonePreparedAward(source, "summit-trophy-metal", applyTrophyFinish);
}

/** Instance-only body metal. Do not dispose shared geometry or the black mark. */
export function disposeAwardInstanceMaterials(root: Object3D) {
  root.traverse((child: Object3D) => {
    if (!(child instanceof Mesh)) return;
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    materials[0]?.dispose();
  });
}
