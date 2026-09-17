/** GLBs live in `public/` (trophy.glb, bronze.glb, crown.glb), not `/awards/`. */
export function awardModelUrl(file) {
  const base = import.meta.env.BASE_URL || "./";
  return new URL(file, new URL(base, window.location.href)).href;
}
