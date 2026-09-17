import kaplay from "kaplay";

// Approved village panorama. The character is a separate sprite on its path.
const HEIGHT = 600;
const TILE_WIDTH = HEIGHT * 3;
const PATH_Y = HEIGHT * .812;
// Landmark centers in the approved image, ordered along its walking path.
const STOPS = [.132, .298, .5, .697, .888];
// Label anchors sit just above each roof, canopy or fountain.
const LABEL_Y = [.49, .58, .59, .59, .50];
const wrap = value => ((value % TILE_WIDTH) + TILE_WIDTH) % TILE_WIDTH;

export default function initFirm() {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = new URLSearchParams(location.search).get("reduced") === "1" || motion.matches;
  let hostPaused = false;
  let suspended = false;
  let disposed = false;
  let loaded = false;
  let worldX = TILE_WIDTH * .06;
  let nextStop = 0;
  let resting = 0;
  let standing = null;
  let viewWidth = 1400;
  let mobile = false;
  let player;
  let backdrops = [];
  const canvas = document.getElementById("game");
  const k = kaplay({ width: 800, height: 800, stretch: true, letterbox: false,
    background: [0, 0, 0, 0], global: false, canvas, pixelDensity: 1,
    maxFPS: 60, crisp: true, focus: false, debug: false, loadingScreen: false });

  const emit = (type, detail = {}) => {
    if (!disposed) window.parent.postMessage({ type, ...detail }, window.location.origin);
  };
  const updatePause = () => { k.debug.paused = hostPaused || suspended || document.hidden; };
  const characterHeight = () => (mobile ? 64 : 88) / Math.max(1, window.innerHeight);
  const project = () => {
    const sx = 800 / viewWidth;
    const sy = 800 / HEIGHT;
    const runnerX = viewWidth * (mobile ? .5 : .4);
    player.pos = k.vec2(runnerX * sx, PATH_Y * sy);
    const scale = characterHeight() * HEIGHT / 16;
    player.scale = k.vec2(scale * sx, scale * sy);
    // Repeat the approved left-to-right village, never mirror its landmarks.
    const offset = wrap(worldX - runnerX);
    backdrops.forEach((backdrop, index) => {
      backdrop.pos = k.vec2((index * TILE_WIDTH - offset) * sx, 0);
      backdrop.scale = k.vec2(TILE_WIDTH / 2172 * sx, HEIGHT / 724 * sy);
    });
    emit("certa:firm-landmarks", { landmarks: STOPS.map((stop, index) => ({
      index,
      x: (wrap(stop * TILE_WIDTH - offset) / viewWidth),
      y: LABEL_Y[index],
    })).filter(landmark => landmark.x >= 0 && landmark.x <= 1) });
  };
  const caption = () => {
    if (standing === null) { emit("certa:firm-moving"); return; }
    emit("certa:firm-standing", { index: standing, x: mobile ? .5 : .4,
      y: PATH_Y / HEIGHT, characterHeight: characterHeight() });
  };
  const stopAt = index => {
    worldX = STOPS[index] * TILE_WIDTH;
    standing = index;
    nextStop = (index + 1) % STOPS.length;
    resting = 6;
    player.play("up-idle");
    project(); caption();
  };
  const layout = () => {
    mobile = window.innerWidth < 700;
    viewWidth = window.innerWidth / Math.max(1, window.innerHeight) * HEIGHT;
    if (loaded) {
      while (backdrops.length < Math.ceil(viewWidth / TILE_WIDTH) + 2) {
        backdrops.push(k.add([k.sprite("firm-landscape"), k.pos(0, 0), k.scale(1), k.z(-10)]));
      }
      project(); caption();
    }
  };
  layout();
  const setReduced = value => {
    reduced = value;
    if (loaded) player.play(standing !== null ? "up-idle" : reduced ? "right-idle" : "right");
  };
  const receive = event => {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "certa:pause") { hostPaused = true; updatePause(); }
    if (data.type === "certa:resume") { hostPaused = false; updatePause(); }
    if (data.type === "certa:firm-motion" && typeof data.reduced === "boolean") setReduced(data.reduced);
    if (data.type === "certa:firm-replay" && loaded) { stopAt(0); }
    if (data.type === "certa:firm-focus" && loaded && Number.isInteger(data.index) && data.index >= 0 && data.index < STOPS.length) {
      stopAt(data.index);
    }
  };
  const onMotion = event => setReduced(event.matches);
  const onHide = event => { if (event.persisted) { suspended = true; updatePause(); } else dispose(); };
  const onShow = event => { if (event.persisted && !disposed) { suspended = false; layout(); updatePause(); } };
  const onError = () => { emit("certa:firm-error", { code: "scene-unavailable" }); canvas.style.visibility = "hidden"; dispose(); };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener("message", receive);
    window.removeEventListener("pagehide", onHide);
    window.removeEventListener("pageshow", onShow);
    document.removeEventListener("visibilitychange", updatePause);
    motion.removeEventListener("change", onMotion);
    canvas.removeEventListener("webglcontextlost", onError);
    k.quit();
  };
  window.addEventListener("message", receive);
  window.addEventListener("pagehide", onHide);
  window.addEventListener("pageshow", onShow);
  document.addEventListener("visibilitychange", updatePause);
  motion.addEventListener("change", onMotion);
  canvas.addEventListener("webglcontextlost", onError);
  k.onError(onError);
  k.onResize(layout);
  updatePause();

  k.loadSprite("firm-landscape", "./firm-landscape.webp");
  k.loadSprite("characters", "./characters-black-hair.png", { sliceY: 2, sliceX: 8,
    anims: { "right-idle": 2, "up-idle": 1,
      right: { from: 4, to: 5, loop: true, speed: 9 } } });
  k.onLoad(() => {
    if (disposed) return;
    backdrops = Array.from({ length: Math.ceil(viewWidth / (HEIGHT * 3)) + 2 }).map(() => k.add([k.sprite("firm-landscape"), k.pos(0, 0), k.scale(1), k.z(-10)]));
    player = k.add([k.sprite("characters", { anim: "right-idle" }), k.anchor("bot"), k.pos(0, 0), k.scale(1), k.z(10)]);
    loaded = true;
    emit("certa:firm-ready", { count: STOPS.length });
    player.play(standing !== null ? "up-idle" : reduced ? "right-idle" : "right");
    project(); caption();
  });
  k.onUpdate(() => {
    if (!loaded || disposed || reduced) return;
    const dt = Math.min(k.dt(), .05);
    if (standing !== null) {
      resting -= dt;
      if (resting > 0) return;
      standing = null;
      player.play("right");
      caption();
    }
    const remaining = wrap(STOPS[nextStop] * TILE_WIDTH - worldX);
    const step = dt * (mobile ? 48 : 60);
    if (remaining <= step) { stopAt(nextStop); return; }
    worldX = wrap(worldX + step);
    project();
  });
  return dispose;
}
