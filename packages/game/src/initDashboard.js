import kaplay from "kaplay";
import { createDashboardMotion, readDashboardState } from "./dashboard-motion.js";

// Existing Certa mountain panorama and character. Ordinary HTML owns every
// account fact, action, status and accessible equivalent outside this canvas.
const HEIGHT = 360;
const WORLD = 1200;
const START = 100;
const END = 1100;
const TERRACES = [306, 306, 300, 294, 294, 288, 282, 282, 276, 270, 264, 258];
const pathY = x => {
  const part = Math.max(0, Math.min(TERRACES.length - 1, x / 100));
  const lower = Math.floor(part);
  const fraction = part - lower;
  return TERRACES[lower] + ((TERRACES[lower + 1] ?? TERRACES[lower]) - TERRACES[lower]) * fraction;
};

export default function initDashboard() {
  const canvas = document.getElementById("game");
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const model = createDashboardMotion();
  let reduced = preference.matches || new URLSearchParams(window.location.search).get("reduced") === "1";
  let lastInput = null;
  let hostPaused = false;
  let suspended = false;
  let disposed = false;
  let loaded = false;
  let elapsed = 0;
  let resultTime = 2;
  let viewWidth = WORLD;
  let characterSize = 64;
  const k = kaplay({ width: 1200, height: HEIGHT, stretch: true, letterbox: false,
    background: [0, 0, 0, 0], global: false, canvas, pixelDensity: 1,
    maxFPS: 30, crisp: true, focus: false, debug: false, loadingScreen: false });
  const emit = (type, detail = {}) => {
    if (!disposed) window.parent.postMessage({ type, ...detail }, window.location.origin);
  };
  const emitSettlement = () => {
    if (!loaded || hostPaused || suspended || document.hidden) return;
    const settled = model.takeSettlement();
    if (settled) emit("certa:dashboard-settled", settled);
  };
  const updatePause = () => {
    k.debug.paused = hostPaused || suspended || document.hidden;
    emitSettlement();
  };
  const layout = () => {
    const height = Math.max(1, window.innerHeight);
    viewWidth = Math.max(340, window.innerWidth / height * HEIGHT);
    characterSize = (window.innerWidth < 600 ? 44 : 52) / height * HEIGHT;
  };
  const receive = event => {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "certa:pause") { hostPaused = true; updatePause(); return; }
    if (data.type === "certa:resume") { hostPaused = false; updatePause(); return; }
    const next = readDashboardState(data);
    if (!next) return;
    const before = model.state;
    lastInput = { type: "certa:dashboard-state", ...next };
    model.receive(lastInput, reduced);
    if (before?.accountId !== next.accountId || before?.phase !== next.phase) resultTime = 0;
    emitSettlement();
  };
  const onMotion = event => {
    reduced = event.matches;
    if (lastInput) model.receive(lastInput, reduced);
    if (reduced) resultTime = 2;
    emitSettlement();
  };
  const onHide = event => {
    if (event.persisted) { suspended = true; updatePause(); } else dispose();
  };
  const onShow = event => {
    if (event.persisted && !disposed) { suspended = false; layout(); updatePause(); }
  };
  const onError = () => {
    emit("certa:dashboard-error", { code: "scene-unavailable" });
    canvas.style.visibility = "hidden";
    dispose();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener("message", receive);
    window.removeEventListener("resize", layout);
    window.removeEventListener("pagehide", onHide);
    window.removeEventListener("pageshow", onShow);
    document.removeEventListener("visibilitychange", updatePause);
    preference.removeEventListener("change", onMotion);
    canvas.removeEventListener("webglcontextlost", onError);
    k.quit();
  };
  window.addEventListener("message", receive);
  window.addEventListener("resize", layout);
  window.addEventListener("pagehide", onHide);
  window.addEventListener("pageshow", onShow);
  document.addEventListener("visibilitychange", updatePause);
  preference.addEventListener("change", onMotion);
  canvas.addEventListener("webglcontextlost", onError);
  k.onError(onError);
  k.onResize(layout);
  layout();
  updatePause();
  k.loadSprite("dashboard-landscape", "./world-background.png");
  k.loadSprite("dashboard-character", "./characters-black-hair.png", { sliceY: 2, sliceX: 8 });
  k.onLoad(() => {
    if (disposed) return;
    loaded = true;
    emit("certa:dashboard-ready");
    emitSettlement();
  });
  k.onUpdate(() => {
    if (!loaded || disposed || hostPaused || suspended || document.hidden) return;
    const dt = Math.min(k.dt(), .05);
    elapsed += dt;
    model.step(dt);
    if (!model.state?.moving) resultTime = Math.min(2, resultTime + dt);
    emitSettlement();
  });
  k.onDraw(() => {
    if (!loaded || disposed) return;
    const state = model.state;
    const phase = state?.phase ?? "empty";
    const motionOff = reduced || state?.reducedMotion;
    // Reaching a numerical target does not place an unconfirmed evaluation on
    // the finish flag. Only the explicit passed phase can complete this trail.
    const progress = phase === "passed" ? state?.progress ?? 1 : Math.min(.94, state?.progress ?? 0);
    const worldX = START + (END - START) * progress;
    const camera = Math.max(0, Math.min(Math.max(0, WORLD - viewWidth), worldX - viewWidth * .4));
    const sx = 1200 / viewWidth;
    const point = (x, y) => k.vec2((x - camera) * sx, y);
    const color = hex => k.rgb(hex);
    const rectangle = (x, y, width, height, fill, opacity = 1) => k.drawRect({ pos: point(x, y),
      width: width * sx, height, color: color(fill), opacity });
    const line = (x1, y1, x2, y2, width, fill, opacity = 1) => k.drawLine({
      p1: point(x1, y1), p2: point(x2, y2), width, color: color(fill), opacity });

    // A very slow parallax only follows real progress; the world never drifts
    // forward while the account is idle. The original mountain remains intact.
    k.drawSprite({ sprite: "dashboard-landscape", pos: k.vec2((-330 - camera * .24) * sx, 0),
      width: 1600 * sx, height: HEIGHT, opacity: .66 });
    k.drawRect({ pos: k.vec2(0, 0), width: 1200, height: HEIGHT,
      color: color("#F6F3E9"), opacity: .12 });

    // A shallow, continuous ascent: hand-sized stone courses and moss edge,
    // built as scene geometry rather than another raster asset or UI panel.
    for (let x = -100; x <= WORLD + 100; x += 20) {
      const y = Math.round(pathY(x) / 3) * 3;
      rectangle(x, y + 8, 21, HEIGHT - y, "#748377");
      rectangle(x, y + 8, 21, 17, (Math.floor(x / 20) % 3 === 0) ? "#AFB69D" : "#BFC4AA");
      rectangle(x, y, 21, 8, "#91A483");
      rectangle(x, y - 2, 21, 3, "#BAC7A1");
      if (Math.floor(x / 20) % 2 === 0) rectangle(x + 2, y + 28, 16, 9, "#8F9B8C", .6);
      if (Math.floor(x / 20) % 4 === 0) rectangle(x + 7, y + 2, 6, 2, "#D5D7B4", .75);
    }

    // Small trees are scenery, not interactive rewards or financial indicators.
    for (const [x, size] of [[35, 25], [244, 16], [640, 22], [934, 18], [1170, 27]]) {
      const y = pathY(x);
      rectangle(x - 2, y - size, 4, size, "#657461");
      for (let tier = 0; tier < 3; tier++) {
        const top = y - size * (1.65 - tier * .35);
        const half = size * (.25 + tier * .1);
        k.drawPolygon({ pts: [point(x, top), point(x + half, top + size * .6), point(x - half, top + size * .6)],
          color: color(tier === 1 ? "#657F68" : "#789174") });
      }
    }

    // Quiet milestones connect the visible path to the objectives outside it.
    for (const fraction of [.25, .5, .75]) {
      const x = START + (END - START) * fraction;
      const y = pathY(x);
      const reached = progress >= fraction && !["empty", "pending"].includes(phase);
      rectangle(x - 4, y - 12, 8, 12, reached ? "#D8B86D" : "#D4D8C8");
      rectangle(x - 2, y - 15, 4, 3, reached ? "#E9D298" : "#E9EADC");
    }
    const flagY = pathY(END);
    line(END + 19, flagY, END + 19, flagY - 69, 3, "#697D67");
    const flagLift = phase === "passed" ? 0 : 7;
    k.drawPolygon({ pts: [point(END + 20, flagY - 68 + flagLift), point(END + 54, flagY - 61 + flagLift), point(END + 20, flagY - 47 + flagLift)],
      color: color(phase === "passed" ? "#D8B86D" : "#7D967B") });

    const baseY = pathY(worldX) - 1;
    const moving = state?.moving && !motionOff;
    const frame = moving ? (state.direction < 0 ? 6 : 4) + Math.floor(elapsed * 8) % 2
      : phase === "passed" ? 1 : phase === "failed" ? 0 : 2;
    const celebration = phase === "passed" && !motionOff && !moving && resultTime < 1.1
      ? Math.sin(Math.min(1, resultTime / 1.1) * Math.PI) * 13 : 0;
    k.drawEllipse({ pos: point(worldX, baseY + 1), radiusX: characterSize * .22 * sx,
      radiusY: 3, anchor: "center", color: color("#344B37"), opacity: .18 });
    k.drawSprite({ sprite: "dashboard-character", frame, pos: point(worldX, baseY - celebration),
      anchor: "bot", width: characterSize * sx, height: characterSize,
      opacity: phase === "failed" ? motionOff ? .65 : 1 - Math.min(1, resultTime / .7) * .35
        : phase === "empty" ? .82 : 1 });

    if (phase === "passed" && !motionOff && !moving && resultTime < 1.7) {
      for (let index = 0; index < 9; index++) {
        const angle = index / 9 * Math.PI * 2;
        const radius = 12 + resultTime * 35;
        rectangle(worldX + Math.cos(angle) * radius, baseY - characterSize * .7 + Math.sin(angle) * radius,
          3, 3, index % 2 ? "#D8B86D" : "#F6F3E9", Math.max(0, 1 - resultTime / 1.7));
      }
    }
    // A stopped lantern is an honest locked/pending presentation; it does not
    // advance the character or imply a compliance/issuance decision.
    if (["pending", "locked"].includes(phase)) {
      const x = worldX + characterSize * .6;
      line(x, baseY, x, baseY - 24, 2, "#697D67");
      rectangle(x - 5, baseY - 28, 10, 12, phase === "locked" ? "#AFB69D" : "#D8B86D");
      rectangle(x - 3, baseY - 26, 6, 7, "#F6F3E9", .75);
    }
  });
  return dispose;
}
