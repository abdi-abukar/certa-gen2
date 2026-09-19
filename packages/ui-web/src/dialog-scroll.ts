/** Whether this scroll area can consume a gesture rather than chain to the page. */
export function canScrollInDirection(position: number, extent: number, visible: number, delta: number) {
  const end = Math.max(0, extent - visible);
  const current = Math.min(end, Math.max(0, position));
  if (delta > 0) return current < end - 1;
  if (delta < 0) return current > 1;
  return false;
}
