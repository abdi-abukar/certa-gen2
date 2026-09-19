const PHASES = new Set(["empty", "pending", "evaluation", "practice", "funded", "passed", "failed", "locked"]);
const isProgress = value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

/** Presentation input only. No scene value can establish an account outcome. */
export function readDashboardState(value) {
  if (!value || typeof value !== "object" || value.type !== "certa:dashboard-state"
    || typeof value.accountId !== "string" || !value.accountId || value.accountId.length > 200
    || !PHASES.has(value.phase) || !isProgress(value.progress)
    || typeof value.reducedMotion !== "boolean"
    || (value.previousProgress !== undefined && !isProgress(value.previousProgress))) return null;
  return { accountId: value.accountId, phase: value.phase, progress: value.progress,
    previousProgress: value.previousProgress, reducedMotion: value.reducedMotion };
}

/** One displayed account, with replaceable motion and an exactly-once settlement. */
export function createDashboardMotion() {
  let state = null;
  let origin = 0;
  let elapsed = 0;
  let duration = 0;
  let settlement = null;
  const settle = () => {
    state.progress = state.target;
    state.moving = false;
    settlement = { accountId: state.accountId, progress: state.target };
  };
  return {
    get state() { return state ? { ...state } : null; },
    receive(input, systemReduced = false) {
      const next = readDashboardState(input);
      if (!next) return false;
      const first = state === null;
      const changed = !first && state.accountId !== next.accountId;
      const firstObservation = state?.phase === "pending" && ["evaluation", "practice", "funded"].includes(next.phase);
      const reduced = next.reducedMotion || systemReduced;
      // A saved observation is valid on first mount only. Selection must never
      // travel from a different account's money or replay a stale stored position.
      origin = first ? next.previousProgress ?? next.progress : changed || firstObservation ? next.progress : state.progress;
      if (state && !changed && state.target === next.progress && state.phase === next.phase && state.reducedMotion === reduced) return true;
      elapsed = 0;
      duration = Math.min(1.9, .45 + Math.abs(next.progress - origin) * 2.4);
      state = { accountId: next.accountId, phase: next.phase, progress: origin,
        target: next.progress, moving: origin !== next.progress, direction: next.progress >= origin ? 1 : -1,
        reducedMotion: reduced };
      settlement = null;
      if (changed || reduced || !state.moving || ["empty", "pending", "locked"].includes(next.phase)) settle();
      return true;
    },
    step(seconds) {
      if (!state?.moving || !Number.isFinite(seconds) || seconds <= 0) return;
      elapsed = Math.min(duration, elapsed + seconds);
      const t = elapsed / duration;
      const ease = t * t * (3 - 2 * t);
      state.progress = origin + (state.target - origin) * ease;
      if (elapsed >= duration) settle();
    },
    takeSettlement() { const value = settlement; settlement = null; return value; },
  };
}
