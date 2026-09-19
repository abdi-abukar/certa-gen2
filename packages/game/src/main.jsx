// Reject cross-origin and non-parent messages before scene listeners see them.
window.addEventListener('message',event=>{if(event.origin!==window.location.origin||event.source!==window.parent)event.stopImmediatePropagation();},true);
import "./index.css";

const query = new URLSearchParams(window.location.search);
const mode = (query.get("mode") ?? "").toLowerCase();
const climbMode = mode === "climb";
const cabinetMode = mode === "cabinet";
const customizeMode = mode === "customize";
const heroMode = mode === "hero" || query.get("hero") === "1";
const firmMode = mode === "firm";
const signupMode = mode === "signup";

void bootstrap();

async function bootstrap() {
  if(mode==='trinket'){const {showTrinket}=await import('./trinket.js');await showTrinket(query.get('model'));return;}
  if (mode === "dashboard") {
    document.documentElement.classList.add("climb-mode", "dashboard-mode");
    document.body.classList.add("climb-mode", "dashboard-mode");
    try {
      const { default: initDashboard } = await import("./initDashboard.js");
      initDashboard();
    } catch {
      window.parent.postMessage({ type: "certa:dashboard-error", code: "scene-unavailable" }, window.location.origin);
    }
    return;
  }
  if (climbMode) {
    // Keep the marketing embed lean: load Kaplay climb code only.
    document.documentElement.classList.add("climb-mode");
    document.body.classList.add("climb-mode");
    const { default: initClimb } = await import("./initClimb.js");
    initClimb();
    return;
  }

  if (firmMode) {
    // Marketing hero: the firm's sections as a climbable trail. Kaplay only,
    // no game UI — the surrounding page owns the panels.
    document.documentElement.classList.add("climb-mode");
    document.body.classList.add("climb-mode");
    const { default: initFirm } = await import("./initFirm.js");
    initFirm();
    return;
  }

  if (signupMode) {
    // Signup panel artwork: transparent perk climb, no game UI.
    document.documentElement.classList.add("climb-mode");
    document.body.classList.add("climb-mode");
    const { default: initSignup } = await import("./initSignup.js");
    initSignup();
    return;
  }

  if (customizeMode) {
    document.documentElement.classList.add("customize-mode");
    document.body.classList.add("customize-mode");
    const { default: initCustomize } = await import("./initCustomize.js");
    initCustomize();
    return;
  }

  if (cabinetMode) {
    document.documentElement.classList.add("climb-mode");
    document.body.classList.add("climb-mode");
    const { default: initCabinet } = await import("./initCabinet.js");
    initCabinet({
      counts: {
        trophy: countParam("trophy"),
        bronze: countParam("bronze"),
        crown: countParam("crown"),
        ribbon: countParam("ribbon"),
      },
    });
    return;
  }

  const [
    { StrictMode, createElement },
    { createRoot },
    { Provider },
    { store, characterLookAtom },
    { default: ReactUI },
    { default: initGame },
    { hasLookParams, lookFromSearchParams },
  ] = await Promise.all([
    import("react"),
    import("react-dom/client"),
    import("jotai"),
    import("./store.js"),
    import("./ReactUI.jsx"),
    import("./initGame.js"),
    import("./character-look.js"),
  ]);
  if (hasLookParams(query)) {
    store.set(characterLookAtom, lookFromSearchParams(query));
  }
  const fromDay = clampDay(query.get("fromDay") ?? query.get("from"), 0);
  const toDay = clampDay(
    query.get("toDay") ?? query.get("to"),
    heroMode ? 5 : fromDay,
  );
  const claimAlreadyDone = heroMode
    ? false
    : ["1", "true", "yes"].includes(
        (query.get("claimAlreadyDone") ?? query.get("claimed") ?? "").toLowerCase(),
      );

  createRoot(document.getElementById("ui")).render(
    createElement(
      StrictMode,
      null,
      createElement(
        Provider,
        { store },
        createElement(ReactUI, {
          from: fromDay,
          to: toDay,
          claimAlreadyDone,
        }),
      ),
    ),
  );

  initGame();
}

function clampDay(value, fallback) {
  const day = Number.parseInt(value, 10);
  return Number.isFinite(day) ? Math.max(0, Math.min(5, day)) : fallback;
}

function countParam(key) {
  const count = Number.parseInt(query.get(key) ?? "0", 10);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}
