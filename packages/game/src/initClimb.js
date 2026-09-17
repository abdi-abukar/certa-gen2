import kaplay from "kaplay";
import {
  bindCharacterLook,
  hasLookParams,
  lookFromSearchParams,
} from "./character-look";
import { createWoodSignTexture } from "./wood-sign-texture";

/**
 * Marketing climb loop (?mode=climb).
 *
 * Transparent-canvas treadmill: the trader hops in place while ledges with
 * day signs scroll past underneath, so it reads as an endless climb without
 * showing the whole trail. Every 5th day a payout award pops, then the loop
 * keeps going.
 */

const WIDTH = 900;
const HEIGHT = 1200;
const SPACING = 300;
// Keep the active jump central, with one extra ledge visible below it.
const BASE_Y = HEIGHT - SPACING - 120;
const LEDGE_COUNT = 7;
const HOP_TIME = 0.74;
const REST_TIME = 0.6;
const SUMMIT_REST = 1.9;
const JUMP_HEIGHT = 175;
const LANDING_DURATION = 0.16;

const PLAYER_SCALE = 5;
const PLAYER_STAND_X = 96;
const PLAYER_STAND_Y = -38;

const SIGN_FONT = "sign";
const SIGN_SCALE = 3;
const SIGN_X = -108;
const SIGN_Y = -72;
// Keep both lines comfortably inside the sign planks after the canvas scales
// down for the narrow marketing-hero embed.
const SIGN_DAY_Y = -108;
const SIGN_PNL_Y = -68;

const DAY_COLOR = [255, 248, 230];
const SUMMIT_COLOR = [255, 226, 148];
const SIGN_SHADOW_COLOR = [28, 16, 8];
const PNL_COLOR = [117, 211, 145];

// First payout earns Bronze; every payout after that earns the Crown.
const AWARD_TIERS = [
  {
    id: "bronze",
    label: "BRONZE - $1K PAYOUT",
    ring: [141, 87, 46],
    face: [205, 132, 66],
  },
  {
    id: "crown",
    label: "CROWN - $2K PAYOUT",
    ring: [190, 144, 38],
    face: [244, 202, 92],
  },
];

const DAYS_PER_CYCLE = 5;

const ledgeX = (seq) => (((seq % 2) + 2) % 2 === 0 ? 560 : 336);
const dayForSeq = (seq) => ((((seq - 1) % DAYS_PER_CYCLE) + DAYS_PER_CYCLE) % DAYS_PER_CYCLE) + 1;
const labelForSeq = (seq) =>
  seq < 0 ? " " : seq === 0 ? "START" : `DAY ${dayForSeq(seq)}`;
const isSummitSeq = (seq) => seq > 0 && dayForSeq(seq) === DAYS_PER_CYCLE;

function bindEmbedPause(k) {
  const apply = (paused) => {
    if (k.debug) k.debug.paused = paused;
  };

  window.addEventListener("message", (event) => {
    const type = event.data?.type;
    if (type === "certa:pause") apply(true);
    if (type === "certa:resume") apply(false);
  });

  document.addEventListener("visibilitychange", () => {
    apply(document.hidden);
  });

  window.parent?.postMessage({ type: "certa:embed-ready" }, window.location.origin);
}

export default function initClimb() {
  const k = kaplay({
    width: WIDTH,
    height: HEIGHT,
    stretch: true,
    letterbox: false,
    background: [0, 0, 0, 0],
    global: false,
    canvas: document.getElementById("game"),
    // Pixel-art stretch looks sharper at 1x and is much cheaper while scrolling.
    pixelDensity: 1,
    maxFPS: 30,
    crisp: true,
    focus: false,
    debug: false,
  });
  bindEmbedPause(k);

  k.loadSprite("characters", "./characters-black-hair.png", {
    sliceY: 2,
    sliceX: 8,
    anims: {
      "down-idle": 0,
      "up-idle": 1,
      "right-idle": 2,
      "left-idle": 3,
      right: { from: 4, to: 5, loop: true },
      left: { from: 6, to: 7, loop: true },
      down: { from: 8, to: 9, loop: true },
      up: { from: 10, to: 11, loop: true },
    },
  });
  k.loadSprite("wood-sign", createWoodSignTexture());
  k.loadSprite("ledge", createLedgeTexture());
  k.loadSprite("award-crown", pixelSprite(CROWN_ROWS, CROWN_PALETTE));
  k.loadFont(
    SIGN_FONT,
    "./game-font.ttf",
  );

  // --- Ledges: ring buffer covering the screen plus a buffer above/below ---
  const ledges = [];
  let maxSeq = LEDGE_COUNT - 2;
  for (let seq = -1; seq <= LEDGE_COUNT - 2; seq += 1) {
    ledges.push(makeLedge(k, seq));
  }

  const player = k.add([
    k.sprite("characters", { anim: "right-idle" }),
    k.anchor("center"),
    k.pos(ledgeX(0) + PLAYER_STAND_X, BASE_Y + PLAYER_STAND_Y),
    k.scale(PLAYER_SCALE),
    k.color(255, 255, 255),
    k.z(20),
  ]);
  const binder = bindCharacterLook(k, () => [player]);
  const lookQuery = new URLSearchParams(window.location.search);
  if (hasLookParams(lookQuery)) {
    void binder.apply(lookFromSearchParams(lookQuery));
  }

  const medals = [];
  let hopCount = 0;
  let state = "rest";
  let timer = REST_TIME * 1.6;
  let hop = null;
  let landing = 0;

  const beginHop = () => {
    hop = {
      elapsed: 0,
      fromX: ledgeX(hopCount) + PLAYER_STAND_X,
      toX: ledgeX(hopCount + 1) + PLAYER_STAND_X,
    };
    if (player.getCurAnim()?.name !== "up") player.play("up");
  };

  const spawnMedal = () => {
    const cycle = Math.floor((hopCount - 1) / DAYS_PER_CYCLE);
    const tier = AWARD_TIERS[cycle === 0 ? 0 : 1];
    // Offset right of the trader so the pop never covers the day sign.
    const root = k.add([k.pos(player.pos.x + 72, player.pos.y - 96), k.z(30)]);
    const parts =
      tier.id === "crown"
        ? [
            root.add([
              k.sprite("award-crown"),
              k.anchor("center"),
              k.scale(3.4),
              k.opacity(1),
            ]),
          ]
        : [
            root.add([k.circle(30), k.color(...tier.ring), k.opacity(1)]),
            root.add([k.circle(23), k.color(...tier.face), k.opacity(1)]),
          ];
    parts.push(
      root.add([
        k.text(tier.label, {
          font: SIGN_FONT,
          size: 20,
          align: "center",
        }),
        k.anchor("center"),
        k.pos(0, 58),
        k.color(...SUMMIT_COLOR),
        k.opacity(1),
      ]),
    );
    medals.push({ root, parts, life: 0 });
  };

  const updateMedals = (dt, scrollStep) => {
    for (let index = medals.length - 1; index >= 0; index -= 1) {
      const medal = medals[index];
      medal.life += dt;
      medal.root.pos.y += scrollStep - 34 * dt;
      if (medal.life > 0.9) {
        const fade = Math.max(0, 1 - (medal.life - 0.9) / 0.5);
        medal.parts.forEach((part) => {
          part.opacity = fade;
        });
      }
      if (medal.life >= 1.4) {
        medal.root.destroy();
        medals.splice(index, 1);
      }
    }
  };

  k.onUpdate(() => {
    const dt = k.dt();

    if (state === "rest") {
      updateMedals(dt, 0);
      if (landing > 0) {
        landing = Math.max(landing - dt, 0);
        const settle = Math.sin((landing / LANDING_DURATION) * Math.PI) * 0.24;
        player.scale.x = PLAYER_SCALE + settle;
        player.scale.y = PLAYER_SCALE - settle;
      }
      timer -= dt;
      if (timer <= 0) {
        state = "hop";
        beginHop();
      }
      return;
    }

    hop.elapsed += dt;
    const progress = Math.min(hop.elapsed / HOP_TIME, 1);
    const scrollStep = (SPACING * dt) / HOP_TIME;

    ledges.forEach((ledge) => {
      ledge.root.pos.y += scrollStep;
    });
    updateMedals(dt, scrollStep);

    const arc = Math.sin(progress * Math.PI);
    player.pos.x = hop.fromX + (hop.toX - hop.fromX) * progress;
    player.pos.y = BASE_Y + PLAYER_STAND_Y - arc * JUMP_HEIGHT;
    const stretch = arc * 0.22;
    player.scale.x = PLAYER_SCALE - stretch;
    player.scale.y = PLAYER_SCALE + stretch;

    if (progress < 1) return;

    // Landed on the next ledge.
    hopCount += 1;
    state = "rest";
    hop = null;
    landing = LANDING_DURATION;
    player.play("right-idle");
    player.pos.x = ledgeX(hopCount) + PLAYER_STAND_X;
    player.pos.y = BASE_Y + PLAYER_STAND_Y;

    // Snap out per-frame scroll drift so ledges never wander off baseline.
    const landedLedge = ledges.find((ledge) => ledge.seq === hopCount);
    if (landedLedge) {
      const drift = landedLedge.root.pos.y - BASE_Y;
      ledges.forEach((ledge) => {
        ledge.root.pos.y -= drift;
      });
    }

    if (isSummitSeq(hopCount)) {
      spawnMedal();
      timer = SUMMIT_REST;
    } else {
      timer = REST_TIME;
    }

    // Recycle ledges that scrolled out below to the top of the ring.
    ledges.forEach((ledge) => {
      if (ledge.root.pos.y > HEIGHT + 260) {
        maxSeq += 1;
        ledge.seq = maxSeq;
        ledge.root.pos.y -= LEDGE_COUNT * SPACING;
        ledge.root.pos.x = ledgeX(maxSeq);
        applyLedgeLabel(k, ledge);
      }
    });
  });
}

function makeLedge(k, seq) {
  const root = k.add([k.pos(ledgeX(seq), BASE_Y - seq * SPACING), k.z(5)]);
  root.add([k.sprite("ledge"), k.anchor("top"), k.pos(0, -2), k.scale(3)]);
  root.add([
    k.sprite("wood-sign"),
    k.anchor("center"),
    k.pos(SIGN_X, SIGN_Y),
    k.scale(SIGN_SCALE),
  ]);

  const addLine = (y, size) => {
    const textOptions = { font: SIGN_FONT, size, align: "center", width: 190 };
    const shadow = root.add([
      k.text(" ", textOptions),
      k.anchor("center"),
      k.pos(SIGN_X + 3, y + 3),
      k.color(...SIGN_SHADOW_COLOR),
    ]);
    const front = root.add([
      k.text(" ", textOptions),
      k.anchor("center"),
      k.pos(SIGN_X, y),
      k.color(...DAY_COLOR),
    ]);
    return { front, shadow };
  };

  const day = addLine(SIGN_DAY_Y, 26);
  const pnl = addLine(SIGN_PNL_Y, 28);

  const ledge = { root, day, pnl, seq };
  applyLedgeLabel(k, ledge);
  return ledge;
}

function applyLedgeLabel(k, ledge) {
  const label = labelForSeq(ledge.seq);
  ledge.day.front.text = label;
  ledge.day.shadow.text = label;
  ledge.day.front.color = k.rgb(
    ...(isSummitSeq(ledge.seq) ? SUMMIT_COLOR : DAY_COLOR),
  );

  // Random green day PnL under the label; the start ledge has no PnL yet.
  const pnlLabel =
    ledge.seq <= 0 ? " " : `+$${150 + Math.floor(Math.random() * 16) * 50}`;
  ledge.pnl.front.text = pnlLabel;
  ledge.pnl.shadow.text = pnlLabel;
  ledge.pnl.front.color = k.rgb(...PNL_COLOR);
}

const CROWN_PALETTE = {
  Y: "#e0b040",
  y: "#b8862a",
  G: "#f4ca5c",
  J: "#c03434",
  j: "#3a62b8",
  D: "#241a10",
};

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

function createLedgeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 136;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;

  const rect = (x, y, width, height, color) => {
    context.fillStyle = color;
    context.fillRect(x, y, width, height);
  };

  // Grass cap.
  rect(0, 2, 136, 8, "#4f9e63");
  rect(0, 2, 136, 2, "#7cc47f");
  rect(0, 8, 136, 2, "#3c7a4c");
  rect(8, 0, 12, 2, "#7cc47f");
  rect(52, 0, 16, 2, "#7cc47f");
  rect(102, 0, 11, 2, "#7cc47f");

  // Dirt body tapering into rock.
  rect(5, 10, 126, 11, "#6b4a2e");
  rect(13, 21, 110, 6, "#57381f");
  rect(27, 27, 82, 4, "#3c2715");

  // Speckle detail.
  rect(24, 13, 3, 2, "#7d5836");
  rect(66, 16, 4, 2, "#4a2f1a");
  rect(106, 12, 3, 2, "#7d5836");
  rect(46, 23, 4, 2, "#3f2817");
  rect(84, 24, 3, 2, "#6b4a2e");

  return canvas.toDataURL();
}
