import kaplay from "kaplay";

/**
 * Trophy cabinet — 3-board shelf (top / middle / bottom) with 2 award rows × 3.
 * (?mode=cabinet&trophy=N&bronze=N&crown=N&ribbon=N)
 *
 * Top row:   trophy · bronze · crown
 * Middle:    ribbon · empty · empty
 * Bottom board is decorative (no awards).
 * Click posts certa:trophy-select to the parent dashboard.
 */

const COMPACT = window.matchMedia("(max-width: 700px)").matches;
const WIDTH = COMPACT ? 980 : 1600;
const HEIGHT = COMPACT ? 900 : 1080;

const COLS = COMPACT ? [160, 490, 820] : [280, 800, 1320];
const ROW_YS = COMPACT ? [250, 560] : [300, 660];
const SHELF_OFFSET = COMPACT ? 12 : 16;
const SHELF_SCALE = COMPACT ? 2.05 : 3.35;
const PLATE_SCALE = COMPACT ? 1.7 : 2.4;
const AWARD_SCALE = COMPACT ? 5.2 : 6.8;

/** Three horizontal boards: above top row, under middle row, bottom trim. */
const SHELF_YS = COMPACT
  ? [ROW_YS[0] + SHELF_OFFSET, ROW_YS[1] + SHELF_OFFSET, 820]
  : [ROW_YS[0] + SHELF_OFFSET, ROW_YS[1] + SHELF_OFFSET, 980];

const SIGN_FONT = "sign";

const NAME_COLOR = [255, 248, 230];
const COUNT_COLOR = [117, 211, 145];
const LOCKED_COLOR = [150, 160, 152];
const PLATE_TEXT_SHADOW = [24, 14, 6];

const AWARDS = [
  {
    id: "trophy",
    name: "SUMMIT",
    glow: [214, 224, 236],
    sprite: "award-trophy",
    scale: AWARD_SCALE,
    row: 0,
    col: 0,
  },
  {
    id: "bronze",
    name: "BRONZE",
    glow: [222, 148, 84],
    sprite: "award-bronze",
    scale: AWARD_SCALE,
    row: 0,
    col: 1,
  },
  {
    id: "crown",
    name: "CROWN",
    glow: [244, 202, 92],
    sprite: "award-crown",
    scale: AWARD_SCALE * 0.95,
    row: 0,
    col: 2,
  },
  {
    id: "ribbon",
    name: "BETA",
    glow: [244, 202, 92],
    sprite: "award-ribbon",
    scale: AWARD_SCALE,
    row: 1,
    col: 0,
  },
];

/** Empty middle-row slots so the shelf reads as 2 × 3. */
const EMPTY_SLOTS = [
  { row: 1, col: 1 },
  { row: 1, col: 2 },
];

export default function initCabinet({ counts = {} } = {}) {
  const k = kaplay({
    width: WIDTH,
    height: HEIGHT,
    stretch: true,
    letterbox: false,
    background: [0, 0, 0, 0],
    global: false,
    canvas: document.getElementById("game"),
    pixelDensity: devicePixelRatio,
    crisp: true,
  });

  k.loadSprite("award-trophy", pixelSprite(TROPHY_ROWS, PALETTE));
  k.loadSprite("award-bronze", pixelSprite(BRONZE_ROWS, PALETTE));
  k.loadSprite("award-crown", pixelSprite(CROWN_ROWS, PALETTE));
  k.loadSprite("award-ribbon", pixelSprite(GOLD_RIBBON_ROWS, PALETTE));
  k.loadSprite("shelf-board", createShelfTexture());
  k.loadSprite("plate", createPlateTexture());
  k.loadSprite("empty-slot", createEmptySlotTexture());
  AWARDS.forEach((award) => {
    k.loadSprite(`glow-${award.id}`, createGlowTexture(award.glow));
  });
  k.loadFont(
    SIGN_FONT,
    "./game-font.ttf",
  );

  SHELF_YS.forEach((shelfY, index) => {
    // Shadow line under each board.
    k.add([
      k.rect(WIDTH, 4),
      k.pos(0, shelfY + 58),
      k.color(58, 40, 22),
      k.opacity(index === 2 ? 0.55 : 0.9),
      k.z(2),
    ]);
    k.add([
      k.sprite("shelf-board"),
      k.anchor("top"),
      k.pos(WIDTH / 2, shelfY),
      k.scale(SHELF_SCALE),
      k.z(4),
    ]);
  });

  const slots = AWARDS.map((award) => {
    const count = Math.max(0, Number(counts[award.id]) || 0);
    const x = COLS[award.col];
    const shelfY = ROW_YS[award.row];
    return makeSlot(k, award, x, shelfY, count);
  });

  EMPTY_SLOTS.forEach(({ row, col }) => {
    makeEmptySlot(k, COLS[col], ROW_YS[row]);
  });

  let time = 0;
  k.onUpdate(() => {
    const dt = k.dt();
    time += dt;
    slots.forEach((slot) => slot.update(dt, time));
  });
}

function makeSlot(k, award, x, shelfY, count) {
  const unlocked = count > 0;
  const baseY = shelfY - 8;

  const glow = k.add([
    k.sprite(`glow-${award.id}`),
    k.anchor("center"),
    k.pos(x, baseY - 118),
    k.opacity(unlocked ? 0.55 : 0),
    k.z(3),
  ]);

  const trophy = k.add([
    k.sprite(award.sprite),
    k.anchor("bot"),
    k.pos(x, baseY),
    k.scale(award.scale),
    k.z(10),
    ...(unlocked ? [] : [k.color(52, 68, 58), k.opacity(0.92)]),
  ]);

  k.add([
    k.sprite("plate"),
    k.anchor("center"),
    k.pos(x, shelfY + 88),
    k.scale(PLATE_SCALE),
    k.z(6),
  ]);
  const addPlateLine = (text, y, size, color) => {
    k.add([
      k.text(text, { font: SIGN_FONT, size, align: "center" }),
      k.anchor("center"),
      k.pos(x + 2, y + 2),
      k.color(...PLATE_TEXT_SHADOW),
      k.z(7),
    ]);
    k.add([
      k.text(text, { font: SIGN_FONT, size, align: "center" }),
      k.anchor("center"),
      k.pos(x, y),
      k.color(...color),
      k.z(8),
    ]);
  };
  addPlateLine(award.name, shelfY + 78, COMPACT ? 20 : 22, NAME_COLOR);
  addPlateLine(
    unlocked ? `x${count}` : "—",
    shelfY + 104,
    COMPACT ? 15 : 16,
    unlocked ? COUNT_COLOR : LOCKED_COLOR,
  );

  const hit = k.add([
    k.rect(COMPACT ? 200 : 280, 360),
    k.anchor("bot"),
    k.pos(x, shelfY + 140),
    k.opacity(0),
    k.area(),
    k.z(20),
  ]);

  let hovered = false;
  hit.onHover(() => {
    hovered = true;
    k.setCursor("pointer");
  });
  hit.onHoverEnd(() => {
    hovered = false;
    k.setCursor("default");
  });
  hit.onClick(() => {
    window.parent?.postMessage(
      {
        type: "certa:trophy-select",
        award: award.id,
        count,
      },
      window.location.origin,
    );
  });

  const sparkles = [];
  let sparkleTimer = 1 + Math.random() * 2;

  const update = (dt, time) => {
    const bob = unlocked ? Math.sin(time * 1.7 + x) * 3 : 0;
    const lift = hovered ? 10 : 0;
    trophy.pos.y = baseY + bob - lift;
    const targetScale = award.scale * (hovered ? 1.06 : 1);
    trophy.scale.x += (targetScale - trophy.scale.x) * Math.min(1, dt * 12);
    trophy.scale.y = trophy.scale.x;

    if (unlocked) {
      glow.opacity = (hovered ? 0.85 : 0.55) + Math.sin(time * 2.2 + x) * 0.1;
      glow.pos.y = baseY - 118 + bob - lift;

      sparkleTimer -= dt;
      if (sparkleTimer <= 0) {
        sparkleTimer = 1.6 + Math.random() * 2.4;
        spawnSparkle(k, sparkles, x, baseY);
      }
    }

    for (let index = sparkles.length - 1; index >= 0; index -= 1) {
      const sparkle = sparkles[index];
      sparkle.life += dt;
      const fade = 1 - sparkle.life / 0.7;
      sparkle.parts.forEach((part) => {
        part.opacity = Math.max(0, fade * 0.9);
      });
      sparkle.root.pos.y -= 14 * dt;
      if (sparkle.life >= 0.7) {
        sparkle.root.destroy();
        sparkles.splice(index, 1);
      }
    }
  };

  return { update };
}

function makeEmptySlot(k, x, shelfY) {
  k.add([
    k.sprite("empty-slot"),
    k.anchor("bot"),
    k.pos(x, shelfY - 8),
    k.scale(COMPACT ? 2.4 : 3.2),
    k.opacity(0.55),
    k.z(5),
  ]);
  k.add([
    k.sprite("plate"),
    k.anchor("center"),
    k.pos(x, shelfY + 88),
    k.scale(PLATE_SCALE),
    k.opacity(0.55),
    k.z(6),
  ]);
  k.add([
    k.text("—", { font: SIGN_FONT, size: COMPACT ? 18 : 20, align: "center" }),
    k.anchor("center"),
    k.pos(x, shelfY + 88),
    k.color(...LOCKED_COLOR),
    k.opacity(0.7),
    k.z(8),
  ]);
}

function spawnSparkle(k, sparkles, x, baseY) {
  const offsetX = (Math.random() - 0.5) * 150;
  const offsetY = -40 - Math.random() * 180;
  const root = k.add([k.pos(x + offsetX, baseY + offsetY), k.z(15)]);
  const size = 3 + Math.random() * 3;
  const parts = [
    root.add([
      k.rect(size * 3, size),
      k.anchor("center"),
      k.color(255, 250, 224),
      k.opacity(0.9),
    ]),
    root.add([
      k.rect(size, size * 3),
      k.anchor("center"),
      k.color(255, 250, 224),
      k.opacity(0.9),
    ]),
  ];
  sparkles.push({ root, parts, life: 0 });
}

/* ----------------------------- pixel sprites ----------------------------- */

const PALETTE = {
  R: "#b8402f",
  r: "#8f2c20",
  B: "#8d572e",
  O: "#c9783a",
  F: "#e8ab6b",
  S: "#c8d0d8",
  s: "#9aa4b0",
  W: "#eef2f7",
  Y: "#e0b040",
  y: "#b8862a",
  G: "#f4ca5c",
  J: "#c03434",
  j: "#3a62b8",
  D: "#241a10",
  C: "#6a4a28",
};

const TROPHY_ROWS = [
  "...s........s...",
  "..sS........Ss..",
  ".sSSWWWWWWWWSsS.",
  "sSSWWWWWWWWWWSSs",
  "SSWWWWWWWWWWWWSS",
  "SSWWWjjjjjjWWWSS",
  "SSWWWWWWWWWWWWSS",
  ".SSWWWWWWWWWWSS.",
  "..SSWWWWWWWWSS..",
  "...SSWWWWWWSS...",
  "....SSWWWWSS....",
  ".....SSWWSS.....",
  "......sSSs......",
  ".......ss.......",
  "......sSSs......",
  ".....sSSSSs.....",
  "....sSSSSSSs....",
  "...CCCCCCCCCC...",
  "..CCCCCCCCCCCC..",
  "...CCCCCCCCCC...",
];

const BRONZE_ROWS = [
  "...RRR....RRR...",
  "...RRR....RRR...",
  "...rRRR..RRRr...",
  "....RRRRRRRR....",
  "....rRRRRRRr....",
  ".....BBBBBB.....",
  "....BBBOOBBB....",
  "...BBOOOOOOBB...",
  "..BBOOOFFOOOBB..",
  "..BOOOFFFFOOOB..",
  ".BBOOFFFFFFOOBB.",
  ".BBOOFFFFFFOOBB.",
  "..BOOOFFFFOOOB..",
  "..BBOOOFFOOOBB..",
  "...BBOOOOOOBB...",
  "....BBBOOBBB....",
  ".....BBBBBB.....",
];

const GOLD_RIBBON_ROWS = BRONZE_ROWS.map((row) =>
  [...row]
    .map(
      (pixel) =>
        ({
          R: "Y",
          r: "y",
          B: "y",
          O: "Y",
          F: "G",
        })[pixel] ?? pixel,
    )
    .join(""),
);

const CROWN_ROWS = [
  ".Y.....Y.....Y..",
  "YGY...YGY...YGY.",
  "YGY...YGY...YGY.",
  "YGGY..YGY..YGGY.",
  "YGGGY.YGY.YGGGY.",
  "YGGGGYYGYYGGGGY.",
  "YGGGGGGGGGGGGGY.",
  "YyyyyyyyyyyyyyY.",
  "YGGGGGGGGGGGGGY.",
  "YGJGGGYjYGGGJGY.",
  "YGGGGGGGGGGGGGY.",
  ".DDDDDDDDDDDDD..",
];

function pixelSprite(rows, palette) {
  const height = rows.length;
  const width = rows[0].length;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const key = rows[y][x];
      const color = palette[key];
      if (!color) continue;
      context.fillStyle = color;
      context.fillRect(x, y, 1, 1);
    }
  }

  return canvas.toDataURL();
}

function createShelfTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 22;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;

  const rect = (x, y, width, height, color) => {
    context.fillStyle = color;
    context.fillRect(x, y, width, height);
  };

  rect(0, 0, 480, 3, "#8a5a33");
  rect(0, 3, 480, 8, "#6b4a2e");
  rect(0, 11, 480, 7, "#57381f");
  rect(0, 18, 480, 4, "#3c2715");
  for (let x = 40; x < 480; x += 80) {
    rect(x, 3, 2, 12, "#4a2f1a");
  }
  rect(22, 6, 8, 2, "#7d5836");
  rect(150, 8, 10, 2, "#4a2f1a");
  rect(260, 5, 9, 2, "#7d5836");
  rect(380, 9, 8, 2, "#4a2f1a");
  rect(430, 6, 7, 2, "#7d5836");

  return canvas.toDataURL();
}

function createEmptySlotTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 20;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.strokeStyle = "#3a4a40";
  context.lineWidth = 1;
  context.strokeRect(2, 2, 12, 16);
  context.fillStyle = "#2a3830";
  context.fillRect(4, 4, 8, 12);
  return canvas.toDataURL();
}

function createGlowTexture([red, green, blue]) {
  const canvas = document.createElement("canvas");
  canvas.width = 280;
  canvas.height = 280;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(140, 140, 10, 140, 140, 140);
  gradient.addColorStop(0, `rgba(${red}, ${green}, ${blue}, 0.28)`);
  gradient.addColorStop(0.6, `rgba(${red}, ${green}, ${blue}, 0.1)`);
  gradient.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 280, 280);
  return canvas.toDataURL();
}

function createPlateTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 78;
  canvas.height = 26;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;

  const rect = (x, y, width, height, color) => {
    context.fillStyle = color;
    context.fillRect(x, y, width, height);
  };

  rect(1, 1, 76, 24, "#3c2715");
  rect(2, 2, 74, 22, "#a8843c");
  rect(3, 3, 72, 20, "#8a6a2c");
  rect(4, 4, 70, 18, "#6d5322");
  rect(3, 3, 72, 2, "#c9a24e");
  rect(4, 5, 3, 3, "#c9a24e");
  rect(71, 5, 3, 3, "#c9a24e");
  rect(4, 18, 3, 3, "#3c2715");
  rect(71, 18, 3, 3, "#3c2715");

  return canvas.toDataURL();
}
