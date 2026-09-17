/**
 * Pixel walker compositor. Source sheet is one 16×16 × 8×2 crop-hair body.
 * Curated premades use hand-authored sheets (see premade-sheets.js / public/game/premade).
 * Fallback looks are layered on top of a shaved scalp.
 */

import { PREMADE_FRAMES } from "./premade-sheets.js";

const SRC_HAIR = [17, 17, 17];
const SRC_SKIN = [241, 185, 120];
const SRC_SHIRT = [38, 126, 101];
const SRC_OUTLINE = [20, 31, 43];
const SRC_SLEEVE = [28, 90, 72];
const SRC_BEARD = [125, 96, 62];
const SRC_LENS = [18, 18, 20];
const CELL = 16;
const SPRITE_URL = "./characters-black-hair.png";

/** Silhouette key → premade id. Must stay in sync with lib/character/look.ts PREMADE_CHARACTERS. */
const PREMADE_SILHOUETTES = {
  "short|none|tee|none|none": "a",
  "short|cap|tee|none|none": "b",
  "short|beanie|tee|none|none": "c",
  "braids|none|tee|none|none": "d",
  "bun|none|tee|none|none": "e",
  "long|none|hoodie|none|none": "f",
  "ponytail|none|tee|none|none": "g",
};

const PREMADE_PALETTE = {
  ".": null,
  "#": SRC_OUTLINE,
  H: SRC_HAIR,
  S: SRC_SKIN,
  T: SRC_SHIRT,
  V: SRC_SLEEVE,
  B: SRC_BEARD,
  L: SRC_LENS,
};

const FACING_FRAME = [
  "down",
  "up",
  "right",
  "left",
  "right",
  "right",
  "left",
  "left",
  "down",
  "down",
  "up",
  "up",
  "down",
  "up",
  "right",
  "left",
];

export const CHARACTER_ANIMS = {
  "down-idle": 0,
  "up-idle": 1,
  "right-idle": 2,
  "left-idle": 3,
  right: { from: 4, to: 5, loop: true },
  left: { from: 6, to: 7, loop: true },
  down: { from: 8, to: 9, loop: true },
  up: { from: 10, to: 11, loop: true },
};

export const WALKER_HAIR = [
  "bald",
  "buzz",
  "short",
  "fade",
  "afro",
  "mohawk",
  "braids",
  "long",
  "bun",
  "ponytail",
];
export const WALKER_HATS = ["none", "cap", "beanie", "visor", "bandana"];
export const WALKER_TOPS = ["tee", "tank", "jacket", "hoodie", "vest"];
export const WALKER_GLASSES = ["none", "frames", "shades"];
export const WALKER_FACIAL_HAIR = ["none", "stubble", "mustache", "beard"];
export const WALKER_BACKGROUNDS = [
  "canopy",
  "gold",
  "ember",
  "ocean",
  "violet",
  "graphite",
  "rose",
  "ice",
];

export const WALKER_SKIN_TONES = [
  "#fde6d4",
  "#f7d8c0",
  "#ecc09b",
  "#dda67f",
  "#d09268",
  "#bd7954",
  "#a96547",
  "#965a3d",
  "#70402e",
];

export const WALKER_HAIR_COLORS = [
  "#11100f",
  "#271a14",
  "#3a251a",
  "#704227",
  "#9a5831",
  "#aa693a",
  "#d4b06b",
  "#e8d9b0",
  "#c7c1b5",
  "#7f8791",
  "#5c1a1a",
  "#7a2e12",
  "#1a3a5c",
  "#2d4a32",
  "#4a1f4e",
];

export const WALKER_OUTFIT_COLORS = [
  "#d8b86d",
  "#e8e5d8",
  "#1f8f5f",
  "#2563a8",
  "#9f4d5f",
  "#6f4aa8",
  "#3f3b56",
  "#272b2c",
  "#c86e38",
  "#0f766e",
  "#7f1d1d",
  "#1e3a5f",
];

export const DEFAULT_LOOK = {
  skinTone: "#bd7954",
  hairColor: "#11100f",
  outfitColor: "#d8b86d",
  hair: "short",
  top: "tee",
  hat: "none",
  glasses: "none",
  facialHair: "none",
  background: "canopy",
};

const HAIR_ALIAS = {
  bald: "bald",
  buzz: "buzz",
  short: "short",
  fade: "fade",
  afro: "afro",
  mohawk: "mohawk",
  braids: "braids",
  long: "long",
  bun: "bun",
  ponytail: "ponytail",
  crop: "short",
  waves: "short",
  sweep: "short",
  coils: "afro",
  curls: "afro",
  bob: "long",
  locs: "braids",
};

const HAT_ALIAS = {
  none: "none",
  cap: "cap",
  beanie: "beanie",
  visor: "visor",
  bandana: "bandana",
  headphones: "cap",
};

const GLASSES_ALIAS = {
  none: "none",
  frames: "frames",
  glasses: "frames",
  round_glasses: "frames",
  shades: "shades",
};

const FACIAL_ALIAS = {
  none: "none",
  stubble: "stubble",
  mustache: "mustache",
  beard: "beard",
  goatee: "beard",
};

const TOP_ALIAS = {
  tee: "tee",
  tank: "tank",
  jacket: "jacket",
  hoodie: "hoodie",
  vest: "vest",
};

const HATS_THAT_COVER_HAIR = new Set(["cap", "beanie"]);
const HAIR_THAT_SHAVES = new Set([
  "bald",
  "buzz",
  "fade",
  "afro",
  "mohawk",
  "braids",
]);

const LOOK_QUERY_KEYS = [
  "hair",
  "hat",
  "top",
  "accessory",
  "glasses",
  "facialHair",
  "skinTone",
  "hairColor",
  "outfitColor",
  "background",
];

export function hasLookParams(params) {
  const get = paramGet(params);
  return LOOK_QUERY_KEYS.some((key) => {
    const value = get(key) ?? (key === "skinTone" ? get("skin") : null);
    return typeof value === "string" && value.trim().length > 0;
  });
}

export function lookFromSearchParams(params) {
  const get = paramGet(params);
  return normalizeLook({
    hair: get("hair"),
    hat: get("hat") ?? get("accessory"),
    top: get("top"),
    accessory: get("accessory"),
    glasses: get("glasses"),
    facialHair: get("facialHair"),
    skinTone: get("skinTone") ?? get("skin"),
    hairColor: get("hairColor"),
    outfitColor: get("outfitColor") ?? get("outfit"),
    background: get("background") ?? get("bg"),
  });
}

export function lookToQuery(look) {
  const next = normalizeLook(look);
  return {
    hair: next.hair,
    hat: next.hat,
    top: next.top,
    glasses: next.glasses,
    facialHair: next.facialHair,
    skinTone: next.skinTone.replace("#", ""),
    hairColor: next.hairColor.replace("#", ""),
    outfitColor: next.outfitColor.replace("#", ""),
    background: next.background,
  };
}

export function lookKey(look) {
  const next = normalizeLook(look);
  return [
    next.skinTone,
    next.hairColor,
    next.outfitColor,
    next.hair,
    next.hat,
    next.top,
    next.glasses,
    next.facialHair,
    next.background,
  ].join("|");
}

export function normalizeLook(input) {
  const look = input && typeof input === "object" ? input : {};
  const outfit = typeof look.outfit === "string" ? look.outfit : "";
  const topFromOutfit =
    outfit === "hoodie"
      ? "hoodie"
      : outfit === "blazer"
        ? "jacket"
        : outfit === "varsity"
          ? "vest"
          : outfit === "jersey"
            ? "tank"
            : "tee";
  const rawHair = typeof look.hair === "string" ? look.hair : "";
  const rawHat =
    typeof look.hat === "string"
      ? look.hat
      : typeof look.accessory === "string"
        ? look.accessory
        : "";
  const rawTop = typeof look.top === "string" ? look.top : "";
  const rawGlasses =
    typeof look.glasses === "string" ? look.glasses : "";
  const rawFacial =
    typeof look.facialHair === "string" ? look.facialHair : "";
  return {
    skinTone: clampSkinTone(
      hexOr(look.skinTone, DEFAULT_LOOK.skinTone),
    ),
    hairColor: hexOr(look.hairColor, DEFAULT_LOOK.hairColor),
    outfitColor: hexOr(look.outfitColor, DEFAULT_LOOK.outfitColor),
    hair: HAIR_ALIAS[rawHair] ?? DEFAULT_LOOK.hair,
    top: TOP_ALIAS[rawTop] ?? topFromOutfit,
    hat: HAT_ALIAS[rawHat] ?? DEFAULT_LOOK.hat,
    glasses: GLASSES_ALIAS[rawGlasses] ?? DEFAULT_LOOK.glasses,
    facialHair: FACIAL_ALIAS[rawFacial] ?? DEFAULT_LOOK.facialHair,
    background: WALKER_BACKGROUNDS.includes(look.background)
      ? look.background
      : DEFAULT_LOOK.background,
  };
}

function paramGet(params) {
  if (!params) return () => null;
  if (typeof params.get === "function") {
    return (key) => params.get(key);
  }
  return (key) => params[key] ?? null;
}

function hexOr(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return /^#[0-9a-fA-F]{3,8}$/.test(withHash) ? withHash : fallback;
}

const DARKEST_SKIN = [112, 64, 46];

function clampSkinTone(hex) {
  const rgb = parseHex(hex);
  const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const floor =
    0.2126 * DARKEST_SKIN[0] +
    0.7152 * DARKEST_SKIN[1] +
    0.0722 * DARKEST_SKIN[2];
  if (luma >= floor) return hex;
  return "#70402e";
}

function parseHex(hex) {
  const value = hex.replace("#", "").trim();
  const packed =
    value.length === 3
      ? value
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : value;
  return [
    Number.parseInt(packed.slice(0, 2), 16) || 0,
    Number.parseInt(packed.slice(2, 4), 16) || 0,
    Number.parseInt(packed.slice(4, 6), 16) || 0,
  ];
}

function darker(rgb, amount) {
  return [
    Math.max(0, Math.round(rgb[0] * (1 - amount))),
    Math.max(0, Math.round(rgb[1] * (1 - amount))),
    Math.max(0, Math.round(rgb[2] * (1 - amount))),
  ];
}

function same(data, i, rgb) {
  return data[i] === rgb[0] && data[i + 1] === rgb[1] && data[i + 2] === rgb[2];
}

function write(data, i, rgb) {
  data[i] = rgb[0];
  data[i + 1] = rgb[1];
  data[i + 2] = rgb[2];
  data[i + 3] = 255;
}

function pixelIndex(width, x, y) {
  return (y * width + x) * 4;
}

function inCell(x, y) {
  return x >= 0 && x < CELL && y >= 0 && y < CELL;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load character sprite."));
    image.src = src;
  });
}

function facingOf(index) {
  const map = [
    "down",
    "up",
    "right",
    "left",
    "right",
    "right",
    "left",
    "left",
    "down",
    "down",
    "up",
    "up",
    "down",
    "up",
    "right",
    "left",
  ];
  return map[index] ?? "down";
}

function collect(data, width, ox, oy, skin, hair, shirt) {
  const pts = { skin: [], hair: [], shirt: [], outline: [] };
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const i = pixelIndex(width, ox + x, oy + y);
      if ((data[i + 3] ?? 0) < 10) continue;
      if (same(data, i, skin)) pts.skin.push([x, y]);
      else if (same(data, i, hair)) pts.hair.push([x, y]);
      else if (same(data, i, shirt)) pts.shirt.push([x, y]);
      else if (same(data, i, SRC_OUTLINE)) pts.outline.push([x, y]);
    }
  }
  return pts;
}

function at(data, width, ox, oy, x, y) {
  if (!inCell(x, y)) return null;
  const i = pixelIndex(width, ox + x, oy + y);
  if ((data[i + 3] ?? 0) < 10) return "empty";
  return i;
}

function paint(data, width, ox, oy, x, y, rgb, shirt) {
  if (!inCell(x, y)) return;
  const i = pixelIndex(width, ox + x, oy + y);
  if (same(data, i, shirt) || same(data, i, SRC_SHIRT)) return;
  write(data, i, rgb);
}

function erase(data, width, ox, oy, x, y) {
  if (!inCell(x, y)) return;
  const i = pixelIndex(width, ox + x, oy + y);
  data[i] = 0;
  data[i + 1] = 0;
  data[i + 2] = 0;
  data[i + 3] = 0;
}

function bounds(points) {
  let minX = CELL;
  let maxX = 0;
  let minY = CELL;
  let maxY = 0;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    cx: Math.round((minX + maxX) / 2),
  };
}

function inOval(x, y, cx, cy, rx, ry) {
  if (rx <= 0 || ry <= 0) return false;
  const dx = (x + 0.5 - cx) / rx;
  const dy = (y + 0.5 - cy) / ry;
  return dx * dx + dy * dy <= 1.08;
}

function applyLook(imageData, look) {
  const premadeId = matchPremadeSilhouette(look);
  if (premadeId && PREMADE_FRAMES[premadeId]) {
    paintPremadeSheet(imageData, premadeId);
  }

  const { data, width, height } = imageData;
  const skin = parseHex(look.skinTone);
  const hair = parseHex(look.hairColor);
  const shirt = parseHex(look.outfitColor);
  const sleeve = darker(shirt, 0.28);
  const beard = darker(skin, 0.48);

  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) < 10) continue;
    if (same(data, i, SRC_HAIR)) write(data, i, hair);
    else if (same(data, i, SRC_SKIN)) write(data, i, skin);
    else if (same(data, i, SRC_SHIRT)) write(data, i, shirt);
    else if (same(data, i, SRC_SLEEVE)) write(data, i, sleeve);
    else if (same(data, i, SRC_BEARD)) write(data, i, beard);
  }

  // Authored premades are complete — skip procedural overlays.
  if (!premadeId || !PREMADE_FRAMES[premadeId]) {
    const cols = Math.max(1, Math.floor(width / CELL));
    const rows = Math.max(1, Math.floor(height / CELL));
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        overlayCell(
          data,
          width,
          col * CELL,
          row * CELL,
          row * cols + col,
          look,
          skin,
          hair,
          shirt,
        );
      }
    }
  }

  return imageData;
}

function matchPremadeSilhouette(look) {
  const key = [look.hair, look.hat, look.top, look.glasses, look.facialHair].join(
    "|",
  );
  return PREMADE_SILHOUETTES[key] ?? null;
}

function mirrorRows(rows) {
  return rows.map((row) => [...row].reverse().join(""));
}

function paintPremadeSheet(imageData, premadeId) {
  const frames = PREMADE_FRAMES[premadeId];
  if (!frames) return;
  const { data, width, height } = imageData;
  // Clear sheet, then stamp authored idle cells. Walk frames reuse idle + keep
  // original leg rows from the base sheet already drawn onto the canvas.
  const baseLegs = new Uint8ClampedArray(data);

  for (let i = 0; i < data.length; i += 1) data[i] = 0;

  for (let frame = 0; frame < 16; frame += 1) {
    const facing = FACING_FRAME[frame] ?? "down";
    let rows = frames[facing === "left" ? "right" : facing];
    if (!rows) continue;
    if (facing === "left") rows = mirrorRows(rows);
    const ox = (frame % 8) * CELL;
    const oy = Math.floor(frame / 8) * CELL;
    if (oy + CELL > height || ox + CELL > width) continue;

    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const ch = rows[y]?.[x] ?? ".";
        const rgb = PREMADE_PALETTE[ch];
        if (!rgb) continue;
        write(data, pixelIndex(width, ox + x, oy + y), rgb);
      }
    }

    if (frame >= 4) {
      // Transplant animated legs from the original base sheet copy.
      for (let y = 11; y < CELL; y += 1) {
        for (let x = 0; x < CELL; x += 1) {
          const i = pixelIndex(width, ox + x, oy + y);
          data[i] = baseLegs[i];
          data[i + 1] = baseLegs[i + 1];
          data[i + 2] = baseLegs[i + 2];
          data[i + 3] = baseLegs[i + 3];
        }
      }
    }
  }
}

function overlayCell(
  data,
  width,
  ox,
  oy,
  frameIndex,
  look,
  skin,
  hair,
  shirt,
) {
  const facing = facingOf(frameIndex);
  const pts = collect(data, width, ox, oy, skin, hair, shirt);
  const neckTop = pts.shirt.length
    ? pts.shirt.reduce((m, [, y]) => Math.min(m, y), CELL)
    : 10;
  const coversHair = HATS_THAT_COVER_HAIR.has(look.hat);
  const shaveHair = coversHair || HAIR_THAT_SHAVES.has(look.hair);

  if (shaveHair) {
    shaveToBald(data, width, ox, oy, pts, skin, hair, neckTop);
  }

  const afterShave = collect(data, width, ox, oy, skin, hair, shirt);
  if (!coversHair) {
    drawHairStyle(data, width, ox, oy, look.hair, afterShave, facing, hair, shirt, skin);
  }

  const dressed = collect(data, width, ox, oy, skin, hair, shirt);
  drawTop(data, width, ox, oy, look.top, dressed, facing, skin, shirt, neckTop);

  if (look.hat && look.hat !== "none") {
    drawHat(
      data,
      width,
      ox,
      oy,
      look.hat,
      collect(data, width, ox, oy, skin, hair, shirt),
      shirt,
      facing,
    );
  }

  const facePts = collect(data, width, ox, oy, skin, hair, shirt);
  drawFacialHair(
    data,
    width,
    ox,
    oy,
    look.facialHair,
    facePts,
    facing,
    skin,
    shirt,
    neckTop,
  );
  drawGlasses(
    data,
    width,
    ox,
    oy,
    look.glasses,
    collect(data, width, ox, oy, skin, hair, shirt),
    facing,
    shirt,
  );
}

function drawHairStyle(data, width, ox, oy, style, pts, facing, hair, shirt, skin) {
  if (style === "bald" || style === "short") return;
  if (style === "long") {
    drawLongHair(data, width, ox, oy, pts, facing, hair, shirt);
    return;
  }
  if (style === "bun") {
    drawBun(data, width, ox, oy, pts, facing, hair, shirt);
    return;
  }
  if (style === "ponytail") {
    drawPonytail(data, width, ox, oy, pts, facing, hair, shirt);
    return;
  }
  if (style === "afro") {
    drawAfro(data, width, ox, oy, pts, hair, shirt, skin);
    return;
  }
  if (style === "buzz") {
    drawBuzz(data, width, ox, oy, pts, hair, shirt, skin);
    return;
  }
  if (style === "fade") {
    drawFade(data, width, ox, oy, pts, hair, shirt, skin);
    return;
  }
  if (style === "mohawk") {
    drawMohawk(data, width, ox, oy, pts, hair, shirt, skin);
    return;
  }
  if (style === "braids") {
    drawBraids(data, width, ox, oy, pts, facing, hair, shirt, skin);
  }
}

function faceBox(pts, neckTop = 10) {
  const face = pts.skin.filter(([, y]) => y < neckTop);
  const source = pts.hair.length ? pts.hair : face;
  if (!source.length && !face.length) return null;
  const box = bounds(source.length ? source : face);
  return { ...box, face };
}

function shaveToBald(data, width, ox, oy, pts, skin, hair, neckTop) {
  for (const [x, y] of pts.hair) {
    erase(data, width, ox, oy, x, y);
  }

  for (const [x, y] of pts.outline) {
    if (y >= neckTop) continue;
    let touchesFill = false;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const i = at(data, width, ox, oy, x + dx, y + dy);
      if (typeof i === "number" && !same(data, i, SRC_OUTLINE) && !same(data, i, hair)) {
        touchesFill = true;
        break;
      }
    }
    if (!touchesFill) erase(data, width, ox, oy, x, y);
  }

  const face = pts.skin.filter(([, y]) => y < neckTop);
  const neckXs = pts.shirt
    .filter(([, y]) => y <= neckTop + 1)
    .map(([x]) => x);
  const cx = neckXs.length
    ? Math.round(neckXs.reduce((s, x) => s + x, 0) / neckXs.length)
    : 8;

  if (face.length >= 6) {
    const box = bounds(face);
    const rx = Math.max(3, (box.maxX - box.minX) / 2);
    const top = Math.max(0, box.minY - 3);
    const cy = (top + box.minY) / 2 + 0.5;
    const ry = Math.max(2.2, (box.minY - top) / 2 + 1.1);
    for (let y = top; y <= box.minY; y += 1) {
      for (let x = Math.floor(box.cx - rx - 1); x <= Math.ceil(box.cx + rx + 1); x += 1) {
        if (!inCell(x, y)) continue;
        if (!inOval(x, y, box.cx + 0.5, cy, rx, ry)) continue;
        const i = at(data, width, ox, oy, x, y);
        if (i === "empty" || i == null) {
          write(data, pixelIndex(width, ox + x, oy + y), skin);
        }
      }
    }
  } else {
    const rx = 3.6;
    const ry = 3.8;
    const cy = neckTop - 4;
    for (let y = Math.max(0, Math.floor(cy - ry)); y < neckTop; y += 1) {
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x += 1) {
        if (!inCell(x, y)) continue;
        if (!inOval(x, y, cx + 0.5, cy + 0.5, rx, ry)) continue;
        const i = at(data, width, ox, oy, x, y);
        if (i === "empty" || i == null || (typeof i === "number" && same(data, i, SRC_OUTLINE))) {
          const idx = pixelIndex(width, ox + x, oy + y);
          if (!same(data, idx, SRC_SHIRT)) write(data, idx, skin);
        }
      }
    }
  }

  outlineHead(data, width, ox, oy, skin, neckTop);
}

function outlineHead(data, width, ox, oy, skin, neckTop) {
  const adds = [];
  for (let y = 0; y < neckTop; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const i = pixelIndex(width, ox + x, oy + y);
      if ((data[i + 3] ?? 0) < 10 || !same(data, i, skin)) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inCell(nx, ny)) continue;
        const n = at(data, width, ox, oy, nx, ny);
        if (n === "empty") adds.push([nx, ny]);
      }
    }
  }
  for (const [x, y] of adds) {
    const i = at(data, width, ox, oy, x, y);
    if (i === "empty") write(data, pixelIndex(width, ox + x, oy + y), SRC_OUTLINE);
  }
}

function drawLongHair(data, width, ox, oy, pts, facing, hair, shirt) {
  const source = pts.hair.length ? pts.hair : pts.skin.filter(([, y]) => y < 9);
  if (!source.length) return;
  const box = bounds(source);
  const put = (x, y) => paint(data, width, ox, oy, x, y, hair, shirt);
  const shade = darker(hair, 0.28);
  const putShade = (x, y) => paint(data, width, ox, oy, x, y, shade, shirt);

  // Crown lift so long hair reads fuller than the base crop.
  for (let x = box.minX; x <= box.maxX; x += 1) {
    put(x, box.minY - 1);
    if (x > box.minX && x < box.maxX) put(x, box.minY - 2);
  }

  if (facing === "down" || facing === "up") {
    const leftCols = [box.minX - 1, box.minX, box.minX + 1];
    const rightCols = [box.maxX - 1, box.maxX, box.maxX + 1];
    for (const x of leftCols) {
      for (let n = 1; n <= 5; n += 1) put(x, box.maxY + n);
      putShade(x, box.maxY + 5);
    }
    for (const x of rightCols) {
      for (let n = 1; n <= 5; n += 1) put(x, box.maxY + n);
      putShade(x, box.maxY + 5);
    }
    put(box.minX - 1, box.minY + 1);
    put(box.maxX + 1, box.minY + 1);
    put(box.minX - 1, box.minY + 2);
    put(box.maxX + 1, box.minY + 2);
    return;
  }

  const back = facing === "right" ? box.maxX : box.minX;
  const dir = facing === "right" ? 1 : -1;
  for (let n = 0; n <= 2; n += 1) {
    const x = back - dir * n;
    for (let y = box.minY; y <= box.maxY + 5; y += 1) put(x, y);
  }
  for (let n = 1; n <= 5; n += 1) {
    put(back + dir, box.maxY + n);
    if (n >= 2) put(back + dir * 2, box.maxY + n);
  }
  putShade(back + dir, box.maxY + 5);
  put(back + dir, box.minY);
  put(back + dir, box.minY + 1);
}

function drawBun(data, width, ox, oy, pts, facing, hair, shirt) {
  const source = pts.hair.length ? pts.hair : pts.skin.filter(([, y]) => y < 9);
  if (!source.length) return;
  const box = bounds(source);
  const put = (x, y) => paint(data, width, ox, oy, x, y, hair, shirt);
  const shade = darker(hair, 0.3);
  let cx = box.cx;
  let cy = box.minY - 1;
  if (facing === "right") cx = box.maxX - 1;
  if (facing === "left") cx = box.minX + 1;

  // Round bun stacked above the crown — reads as a distinct head shape.
  for (const [dx, dy] of [
    [0, 0],
    [-1, 0],
    [1, 0],
    [0, -1],
    [-1, -1],
    [1, -1],
    [-2, -1],
    [2, -1],
    [0, -2],
    [-1, -2],
    [1, -2],
    [0, -3],
  ]) {
    put(cx + dx, cy + dy);
  }
  paint(data, width, ox, oy, cx, cy - 1, shade, shirt);
  put(cx - 1, box.minY);
  put(cx + 1, box.minY);
}

function drawPonytail(data, width, ox, oy, pts, facing, hair, shirt) {
  const source = pts.hair.length ? pts.hair : pts.skin.filter(([, y]) => y < 9);
  if (!source.length) return;
  const box = bounds(source);
  const put = (x, y) => paint(data, width, ox, oy, x, y, hair, shirt);
  const shade = darker(hair, 0.28);

  // Small crown peak + long tied tail.
  put(box.cx, box.minY - 1);
  put(box.cx - 1, box.minY - 1);
  put(box.cx + 1, box.minY - 1);
  put(box.cx, box.minY - 2);

  if (facing === "down") {
    for (let n = 1; n <= 5; n += 1) {
      put(box.cx, box.maxY + n);
      if (n >= 2) put(box.cx + 1, box.maxY + n);
    }
    paint(data, width, ox, oy, box.cx, box.maxY + 5, shade, shirt);
    return;
  }
  if (facing === "up") {
    for (let n = 1; n <= 6; n += 1) put(box.cx, box.maxY + n);
    put(box.cx - 1, box.maxY + 4);
    put(box.cx + 1, box.maxY + 5);
    return;
  }

  const back = facing === "right" ? box.maxX : box.minX;
  const dir = facing === "right" ? 1 : -1;
  put(back + dir, box.minY);
  put(back + dir, box.minY + 1);
  for (let n = 1; n <= 5; n += 1) {
    put(back + dir, box.maxY + n);
    if (n >= 2) put(back + dir * 2, box.maxY + n - 1);
  }
  paint(data, width, ox, oy, back + dir, box.maxY + 5, shade, shirt);
}

function drawAfro(data, width, ox, oy, pts, hair, shirt, skin) {
  const box = faceBox(pts);
  if (!box) return;
  const put = (x, y) => {
    if (!inCell(x, y)) return;
    const i = at(data, width, ox, oy, x, y);
    if (typeof i === "number" && same(data, i, skin) && y >= box.minY + 2) return;
    if (typeof i === "number" && same(data, i, shirt)) return;
    paint(data, width, ox, oy, x, y, hair, shirt);
  };
  const cx = box.cx + 0.5;
  const cy = box.minY + 0.4;
  const rx = Math.max(4.6, (box.maxX - box.minX) / 2 + 2.2);
  const ry = 4.2;
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.ceil(cy + ry - 0.5); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      if (!inOval(x, y, cx, cy, rx, ry)) continue;
      // Keep cheeks clear so it reads as hair, not a blob over the face.
      if (y >= box.minY + 3 && Math.abs(x - cx) < rx - 1.6) continue;
      put(x, y);
    }
  }
  // Side flares for volume.
  put(box.minX - 2, box.minY + 1);
  put(box.maxX + 2, box.minY + 1);
  put(box.minX - 2, box.minY + 2);
  put(box.maxX + 2, box.minY + 2);
  put(box.cx, box.minY - 2);
}

function drawBuzz(data, width, ox, oy, pts, hair, shirt, skin) {
  const box = faceBox(pts);
  if (!box) return;
  const put = (x, y) => paint(data, width, ox, oy, x, y, hair, shirt);
  const cx = box.cx + 0.5;
  const top = Math.max(0, box.minY - 1);
  const rx = Math.max(3.4, (box.maxX - box.minX) / 2 + 0.6);
  for (let y = top; y <= top + 2; y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      if (!inOval(x, y, cx, top + 1.4, rx, 2.0)) continue;
      const i = at(data, width, ox, oy, x, y);
      if (typeof i === "number" && same(data, i, skin) && y > top + 1) continue;
      put(x, y);
    }
  }
}

function drawFade(data, width, ox, oy, pts, hair, shirt, skin) {
  const box = faceBox(pts);
  if (!box) return;
  const put = (x, y) => paint(data, width, ox, oy, x, y, hair, shirt);
  const cx = box.cx + 0.5;
  const top = Math.max(0, box.minY - 2);
  const rx = Math.max(2.8, (box.maxX - box.minX) / 2);
  for (let y = top; y <= top + 3; y += 1) {
    const taper = (y - top) * 0.45;
    for (let x = Math.floor(cx - rx + taper); x <= Math.ceil(cx + rx - taper); x += 1) {
      const i = at(data, width, ox, oy, x, y);
      if (typeof i === "number" && same(data, i, skin) && y > top + 1) continue;
      put(x, y);
    }
  }
}

function drawMohawk(data, width, ox, oy, pts, hair, shirt, skin) {
  const box = faceBox(pts);
  if (!box) return;
  const put = (x, y) => paint(data, width, ox, oy, x, y, hair, shirt);
  const shade = darker(hair, 0.25);
  const cx = box.cx;
  const top = Math.max(0, box.minY - 4);
  for (let y = top; y <= box.minY + 1; y += 1) {
    put(cx, y);
    put(cx - 1, y);
    if (y <= top + 2) put(cx + 1, y);
  }
  // Tall crest tip.
  put(cx, top - 1);
  put(cx - 1, top - 1);
  paint(data, width, ox, oy, cx, top, shade, shirt);
}

function drawBraids(data, width, ox, oy, pts, facing, hair, shirt, skin) {
  const box = faceBox(pts);
  if (!box) return;
  const put = (x, y) => paint(data, width, ox, oy, x, y, hair, shirt);
  const top = Math.max(0, box.minY - 1);
  for (let x = box.minX; x <= box.maxX; x += 1) put(x, top);
  put(box.cx, top - 1);
  put(box.cx - 1, top - 1);
  put(box.cx + 1, top - 1);
  const left = box.minX;
  const right = box.maxX;
  const length = facing === "up" ? 5 : 4;
  for (let n = 1; n <= length; n += 1) {
    put(left, box.maxY + n);
    put(right, box.maxY + n);
    if (n % 2 === 0) {
      put(left - 1, box.maxY + n);
      put(right + 1, box.maxY + n);
    } else {
      put(left + 1, box.maxY + n);
      put(right - 1, box.maxY + n);
    }
  }
  if (facing === "right") {
    put(right + 1, box.minY);
    put(right + 1, box.maxY + 2);
  }
  if (facing === "left") {
    put(left - 1, box.minY);
    put(left - 1, box.maxY + 2);
  }
}

function drawTop(data, width, ox, oy, style, pts, facing, skin, shirt, neckTop) {
  if (!pts.shirt.length) return;
  const shirtMinY = pts.shirt.reduce((m, pt) => Math.min(m, pt[1]), CELL);
  const sleeve = darker(shirt, 0.22);
  const shade = darker(shirt, 0.34);
  const edge = darker(shirt, 0.42);

  if (style === "tank") {
    const box = bounds(pts.shirt);
    // Cut a deep scoop so shoulders read as bare skin.
    for (let x = box.minX + 1; x <= box.maxX - 1; x += 1) {
      for (let y = shirtMinY; y <= shirtMinY + 1; y += 1) {
        if (Math.abs(x - box.cx) > 1 && y === shirtMinY + 1) continue;
        const i = at(data, width, ox, oy, x, y);
        if (typeof i === "number" && same(data, i, shirt)) {
          write(data, i, skin);
        }
      }
    }
    return;
  }

  if (style === "vest") {
    const box = bounds(pts.shirt);
    for (const [x, y] of pts.shirt) {
      if (x === box.minX || x === box.maxX || x === box.minX + 1 || x === box.maxX - 1) {
        write(data, pixelIndex(width, ox + x, oy + y), shade);
      }
    }
    // Open center column so it reads as a vest, not a tee.
    for (let y = shirtMinY + 1; y <= shirtMinY + 4; y += 1) {
      const i = at(data, width, ox, oy, box.cx, y);
      if (typeof i === "number" && same(data, i, shirt)) {
        write(data, i, skin);
      }
    }
    return;
  }

  if (style === "jacket" || style === "hoodie") {
    for (const [x, y] of pts.skin) {
      if (y >= shirtMinY) write(data, pixelIndex(width, ox + x, oy + y), sleeve);
    }
    // Lapel / zipper line.
    const box = bounds(pts.shirt);
    for (let y = shirtMinY; y <= Math.min(CELL - 1, shirtMinY + 5); y += 1) {
      const i = at(data, width, ox, oy, box.cx, y);
      if (typeof i === "number" && (same(data, i, shirt) || same(data, i, sleeve))) {
        write(data, i, edge);
      }
    }
  }

  if (style === "hoodie") {
    const head = [...pts.hair, ...pts.skin.filter(([, y]) => y < neckTop)];
    if (!head.length) return;
    const box = bounds(head);
    const put = (x, y) => paint(data, width, ox, oy, x, y, shirt, shirt);
    if (facing === "up" || facing === "down") {
      put(box.minX - 1, box.minY);
      put(box.maxX + 1, box.minY);
      put(box.minX - 1, box.minY + 1);
      put(box.maxX + 1, box.minY + 1);
      put(box.minX - 1, box.minY + 2);
      put(box.maxX + 1, box.minY + 2);
    }
    if (facing === "right") {
      put(box.maxX + 1, box.minY);
      put(box.maxX + 1, box.minY + 1);
      put(box.maxX + 2, box.minY + 1);
      put(box.maxX + 1, box.minY + 2);
    }
    if (facing === "left") {
      put(box.minX - 1, box.minY);
      put(box.minX - 1, box.minY + 1);
      put(box.minX - 2, box.minY + 1);
      put(box.minX - 1, box.minY + 2);
    }
  }
}

function drawHat(data, width, ox, oy, style, pts, shirt, facing) {
  const head = [...pts.hair, ...pts.skin.filter(([, y]) => y < 10)];
  if (!head.length) return;
  const box = bounds(head);
  const put = (x, y, rgb) => paint(data, width, ox, oy, x, y, rgb, shirt);
  const crown = darker(shirt, 0.28);
  const brim = darker(shirt, 0.52);
  const topY = box.minY;

  if (style === "visor") {
    const brimY = Math.min(CELL - 2, topY + 2);
    if (facing === "right" || facing === "left") {
      const dir = facing === "right" ? 1 : -1;
      const edge = facing === "right" ? box.maxX : box.minX;
      for (let step = 0; step <= 3; step += 1) put(edge + dir * step, brimY, brim);
      return;
    }
    for (let x = box.minX - 1; x <= box.maxX + 1; x += 1) put(x, brimY, brim);
    return;
  }

  if (style === "bandana") {
    const wrapY = Math.max(0, topY + 1);
    for (let x = box.minX - 1; x <= box.maxX + 1; x += 1) put(x, wrapY, crown);
    if (facing === "right") put(box.maxX + 2, wrapY + 1, brim);
    if (facing === "left") put(box.minX - 2, wrapY + 1, brim);
    if (facing === "down" || facing === "up") {
      put(box.minX - 1, wrapY + 1, brim);
      put(box.maxX + 1, wrapY + 1, brim);
    }
    return;
  }

  for (let y = Math.max(0, topY - 1); y <= topY + 2; y += 1) {
    for (let x = box.minX - 1; x <= box.maxX + 1; x += 1) {
      if (!inCell(x, y)) continue;
      const inward = x >= box.minX && x <= box.maxX;
      if (y <= topY + 1 || inward) put(x, y, crown);
    }
  }

  if (style === "beanie") {
    put(box.cx, topY - 2, crown);
    put(box.cx - 1, topY - 1, crown);
    put(box.cx + 1, topY - 1, crown);
    return;
  }

  const brimY = Math.min(CELL - 2, topY + 3);
  if (facing === "right" || facing === "left") {
    const dir = facing === "right" ? 1 : -1;
    const edge = facing === "right" ? box.maxX : box.minX;
    for (let step = 0; step <= 3; step += 1) put(edge + dir * step, brimY, brim);
    return;
  }
  for (let x = box.minX - 1; x <= box.maxX + 1; x += 1) put(x, brimY, brim);
}

function drawFacialHair(data, width, ox, oy, style, pts, facing, skin, shirt, neckTop) {
  if (!style || style === "none" || facing === "up") return;
  const face = pts.skin.filter(([, y]) => y < neckTop);
  if (!face.length) return;
  const box = bounds(face);
  const stubble = darker(skin, 0.32);
  const beard = darker(skin, 0.5);
  const put = (x, y, rgb = stubble) => {
    if (!inCell(x, y)) return;
    const i = at(data, width, ox, oy, x, y);
    if (typeof i === "number" && same(data, i, skin)) write(data, i, rgb);
  };

  const midY = box.minY + Math.max(2, Math.round((box.maxY - box.minY) * 0.55));
  if (style === "mustache" || style === "beard") {
    put(box.cx, midY, beard);
    put(box.cx - 1, midY, beard);
    put(box.cx + 1, midY, beard);
    put(box.cx - 1, midY + 1, beard);
    put(box.cx + 1, midY + 1, beard);
  }
  if (style === "stubble") {
    for (const [x, y] of face) {
      if (y < midY) continue;
      if ((x + y) % 2 === 0) put(x, y, stubble);
    }
    return;
  }
  if (style === "beard") {
    for (const [x, y] of face) {
      if (y < midY) continue;
      put(x, y, beard);
    }
    // Chin block so the beard reads as a silhouette, not peppering.
    put(box.minX, box.maxY, beard);
    put(box.maxX, box.maxY, beard);
    put(box.minX, box.maxY + 1, beard);
    put(box.maxX, box.maxY + 1, beard);
    put(box.cx, box.maxY + 1, beard);
    put(box.cx - 1, box.maxY + 1, beard);
    put(box.cx + 1, box.maxY + 1, beard);
    put(box.cx, box.maxY + 2, beard);
  }
}

function drawGlasses(data, width, ox, oy, style, pts, facing, shirt) {
  if (!style || style === "none" || facing === "up") return;
  const face = pts.skin.filter(([, y]) => y < 10);
  if (!face.length) return;
  const box = bounds(face);
  const lens = style === "shades" ? [18, 18, 20] : [28, 36, 42];
  const rim = [18, 22, 26];
  const put = (x, y, rgb) => paint(data, width, ox, oy, x, y, rgb, shirt);
  const eyeY = Math.min(box.maxY - 1, box.minY + 2);
  if (facing === "right" || facing === "left") {
    const dir = facing === "right" ? 1 : -1;
    const x = facing === "right" ? box.cx + 1 : box.cx - 2;
    put(x, eyeY, rim);
    put(x + dir, eyeY, style === "shades" ? lens : rim);
    put(x, eyeY + 1, rim);
    put(x + dir, eyeY + 1, style === "shades" ? lens : rim);
    return;
  }
  const left = box.minX + 1;
  const right = box.maxX - 2;
  put(left, eyeY, rim);
  put(left + 1, eyeY, style === "shades" ? lens : rim);
  put(right, eyeY, rim);
  put(right + 1, eyeY, style === "shades" ? lens : rim);
  put(box.cx, eyeY, rim);
  if (style === "frames") {
    put(left, eyeY + 1, rim);
    put(right + 1, eyeY + 1, rim);
  } else {
    put(left, eyeY + 1, lens);
    put(left + 1, eyeY + 1, lens);
    put(right, eyeY + 1, lens);
    put(right + 1, eyeY + 1, lens);
  }
}

export async function buildCharacterSheetDataUrl(rawLook, spriteUrl = SPRITE_URL) {
  const look = normalizeLook(rawLook);
  const sheet = await loadImage(spriteUrl);
  const canvas = document.createElement("canvas");
  canvas.width = sheet.naturalWidth || sheet.width;
  canvas.height = sheet.naturalHeight || sheet.height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  applyLook(imageData, look);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

export async function loadLookSprite(k, name, rawLook) {
  const dataUrl = await buildCharacterSheetDataUrl(rawLook);
  const asset = k.loadSprite(name, dataUrl, {
    sliceX: 8,
    sliceY: 2,
    anims: CHARACTER_ANIMS,
  });
  if (asset && typeof asset.then === "function") await asset;
  return name;
}

export function retargetSprite(k, obj, spriteName, fallbackAnim = "right-idle") {
  if (!obj) return;
  let anim = fallbackAnim;
  try {
    anim = obj.getCurAnim()?.name ?? fallbackAnim;
  } catch {
    anim = fallbackAnim;
  }
  try {
    obj.unuse("sprite");
  } catch {
    // already missing a sprite component
  }
  obj.use(k.sprite(spriteName, { anim }));
  try {
    if (typeof obj.play === "function") obj.play(anim);
  } catch {
    // some idle frames are static
  }
}

export function bindCharacterLook(k, getObjects) {
  let nonce = 0;
  let spriteName = "characters";
  let lastKey = "";

  const apply = async (rawLook) => {
    if (!rawLook) return;
    const key = lookKey(rawLook);
    if (key === lastKey) return;
    lastKey = key;
    nonce += 1;
    const name = `characters-look-${nonce}`;
    await loadLookSprite(k, name, rawLook);
    spriteName = name;
    for (const obj of getObjects() ?? []) {
      retargetSprite(k, obj, spriteName);
    }
  };

  window.addEventListener("message", (event) => {
    if (event.data?.type !== "set-character") return;
    void apply(event.data.look);
  });

  return { apply, currentName: () => spriteName };
}
