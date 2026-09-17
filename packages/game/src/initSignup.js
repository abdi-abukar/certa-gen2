import kaplay from "kaplay";
import {
  bindCharacterLook,
  hasLookParams,
  lookFromSearchParams,
} from "./character-look";

/**
 * Signup step trail (?mode=signup).
 *
 * Five blocks on a diagonal, top-left down to bottom-right: the Certa journey
 * from buying an evaluation to being paid. The trader walks it, pauses on the
 * last block, then starts over.
 *
 * The canvas draws only the blocks and the trader — no lettering. The step
 * names are HTML in the page above it, so they come out in Certa's own font
 * and a screen reader can read them. The engine says which block he is on:
 *
 *   postMessage { type: "certa:signup-step", index }
 *
 * Geometry rides in the query so the page can lay its labels on the same line:
 *
 *   ?mode=signup&steps=5&path=0.26,0.15,0.74,0.82&layout=rail
 *
 * `path` is x0,y0,x1,y1 as fractions of the frame — first block to last.
 */

const DEFAULT_STEPS = 5;
const DEFAULT_PATH = [0.26, 0.15, 0.74, 0.82];

const HOP_TIME = 0.58;
/** He lingers on the last block before the run starts again. */
const REST_TIME = 0.9;
const END_REST_TIME = 2.2;
const FADE_TIME = 0.45;

/** How high the arc goes, as a share of the gap between two blocks. */
const ARC_RATIO = 0.42;

const LAYOUTS = {
  rail: { designWidth: 430, defaultAspect: 1.05, playerScale: 2.9, blockScale: 1.15 },
  strip: { designWidth: 620, defaultAspect: 2, playerScale: 2.5, blockScale: 1.2 },
};

function parsePath(raw) {
  if (!raw) return DEFAULT_PATH;
  const parts = raw
    .split(",")
    .map((value) => Number.parseFloat(value.trim()))
    .filter((value) => Number.isFinite(value));
  return parts.length === 4 ? parts : DEFAULT_PATH;
}

function parseSteps(raw) {
  const count = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(count) ? Math.max(2, Math.min(9, count)) : DEFAULT_STEPS;
}

function bindEmbedPause(k) {
  const apply = (paused) => {
    if (k.debug) k.debug.paused = paused;
  };
  window.addEventListener("message", (event) => {
    const type = event.data?.type;
    if (type === "certa:pause") apply(true);
    if (type === "certa:resume") apply(false);
  });
  document.addEventListener("visibilitychange", () => apply(document.hidden));
}

/**
 * The canvas is stretched to the frame, so the design aspect has to match the
 * frame's or the trader ends up squashed. Take it from the real embed at boot
 * and reload only if a resize moves it a long way.
 */
function bindAspect(layout) {
  const aspect = () => {
    const width = window.innerWidth || 1;
    const height = window.innerHeight || 1;
    return height > 0 ? width / height : layout.defaultAspect;
  };
  const booted = Math.max(0.35, Math.min(6, aspect())) || layout.defaultAspect;
  let timer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const drift = Math.abs(aspect() - booted) / booted;
      if (drift > 0.18) window.location.reload();
    }, 260);
  });
  return booted;
}

export default function initSignup() {
  const query = new URLSearchParams(window.location.search);
  const layout =
    LAYOUTS[(query.get("layout") ?? "").toLowerCase()] ?? LAYOUTS.rail;
  const count = parseSteps(query.get("steps"));
  const [x0, y0, x1, y1] = parsePath(query.get("path"));
  const aspect = bindAspect(layout);

  const k = kaplay({
    width: layout.designWidth,
    height: Math.round(layout.designWidth / aspect),
    stretch: true,
    letterbox: false,
    background: [0, 0, 0, 0],
    global: false,
    canvas: document.getElementById("game"),
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
      "right-idle": 2,
      "left-idle": 3,
      right: { from: 4, to: 5, loop: true },
      left: { from: 6, to: 7, loop: true },
      up: { from: 10, to: 11, loop: true },
    },
  });
  k.loadSprite("step-block", createBlockTexture());

  /** Block i sits this far along the diagonal, in canvas pixels. */
  const spotFor = (index) => {
    const t = count === 1 ? 0 : index / (count - 1);
    return {
      x: k.width() * (x0 + (x1 - x0) * t),
      y: k.height() * (y0 + (y1 - y0) * t),
    };
  };

  const blocks = Array.from({ length: count }, (_, index) => {
    const spot = spotFor(index);
    const block = k.add([
      k.sprite("step-block"),
      k.anchor("top"),
      k.pos(spot.x, spot.y),
      k.scale(layout.blockScale),
      k.opacity(1),
      k.z(10 + index),
    ]);
    return { block, lift: 0 };
  });

  const player = k.add([
    k.sprite("characters", { anim: "right-idle" }),
    k.anchor("bot"),
    k.pos(spotFor(0).x, spotFor(0).y + 2),
    k.scale(layout.playerScale),
    k.opacity(1),
    k.z(30),
  ]);
  const binder = bindCharacterLook(k, () => [player]);
  if (hasLookParams(query)) {
    void binder.apply(lookFromSearchParams(query));
  }

  const tellPage = (index) => {
    window.parent?.postMessage({ type: "certa:signup-step", index }, window.location.origin);
  };

  let standing = 0;
  let state = "rest";
  let timer = REST_TIME;
  let hop = null;
  let fade = 0;
  tellPage(0);
  blocks[0].lift = 1;

  const lerp = (a, b, t) => a + (b - a) * t;

  k.onUpdate(() => {
    const dt = k.dt();

    if (state === "rest") {
      timer -= dt;
      if (timer > 0) return placeAll(dt);
      if (standing < count - 1) {
        hop = { elapsed: 0, from: spotFor(standing), to: spotFor(standing + 1) };
        state = "hop";
        player.play("right");
      } else {
        // The whole trail is walked: fade out and begin again from the top.
        state = "fade-out";
        fade = 0;
      }
    } else if (state === "hop") {
      hop.elapsed += dt;
      const t = Math.min(1, hop.elapsed / HOP_TIME);
      const gap = Math.hypot(hop.to.x - hop.from.x, hop.to.y - hop.from.y);
      player.pos.x = lerp(hop.from.x, hop.to.x, t);
      player.pos.y =
        lerp(hop.from.y, hop.to.y, t) + 2 - Math.sin(Math.PI * t) * gap * ARC_RATIO;
      if (t >= 1) {
        standing += 1;
        state = "rest";
        timer = standing === count - 1 ? END_REST_TIME : REST_TIME;
        player.play("right-idle");
        blocks[standing].lift = 1;
        tellPage(standing);
      }
    } else if (state === "fade-out") {
      fade += dt / FADE_TIME;
      player.opacity = Math.max(0, 1 - fade);
      if (fade >= 1) {
        standing = 0;
        const spot = spotFor(0);
        player.pos.x = spot.x;
        player.pos.y = spot.y + 2;
        blocks.forEach((entry, index) => {
          entry.lift = index === 0 ? 1 : 0;
        });
        tellPage(0);
        state = "fade-in";
        fade = 0;
      }
    } else {
      fade += dt / FADE_TIME;
      player.opacity = Math.min(1, fade);
      if (fade >= 1) {
        state = "rest";
        timer = REST_TIME;
      }
    }

    placeAll(dt);
  });

  /** Blocks settle back down after the step he landed on pushes them. */
  function placeAll(dt) {
    blocks.forEach((entry, index) => {
      const spot = spotFor(index);
      entry.lift = Math.max(0, entry.lift - dt / 0.5);
      const dip = Math.sin(entry.lift * Math.PI) * 4;
      entry.block.pos.x = spot.x;
      entry.block.pos.y = spot.y + dip;
      entry.block.opacity = index <= standing ? 1 : 0.55;
    });
  }
}

/**
 * Stepping tile in the dialog's own material: deep green with a gold rim, so
 * the stairs look like part of the page rather than a patch of lawn on it.
 */
function createBlockTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 80;
  canvas.height = 30;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;

  const rect = (x, y, width, height, color) => {
    context.fillStyle = color;
    context.fillRect(x, y, width, height);
  };

  // Gold rim along the top, brightest at the very edge.
  rect(2, 0, 76, 1, "#f2dfae");
  rect(1, 1, 78, 2, "#d8b86d");
  rect(0, 3, 80, 1, "#8a6a2b");

  // Green face, then the darker body below.
  rect(0, 4, 80, 7, "#2b6b46");
  rect(0, 4, 80, 1, "#3f8a5c");
  rect(0, 11, 80, 15, "#123524");
  rect(0, 11, 80, 1, "#1b4a31");
  rect(0, 26, 80, 4, "#081a10");

  // Side bevels and a couple of flecks so it is not a flat slab.
  rect(0, 4, 1, 22, "#0b2416");
  rect(79, 4, 1, 22, "#0b2416");
  rect(14, 16, 8, 2, "#1b4a31");
  rect(52, 20, 11, 2, "#1b4a31");

  return canvas;
}
