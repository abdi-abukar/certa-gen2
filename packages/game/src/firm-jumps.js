// Every variation is one upright arc; the sprite keeps its original proportions.
export const FIRM_JUMPS = [
  { name: "small", duration: .45, height: .45 },
  { name: "quick", duration: .5, height: .8 },
  { name: "classic", duration: .65, height: .85 },
  { name: "high", duration: .85, height: 1.25 },
  { name: "float", duration: 1, height: 1 },
];

export function chooseFirmJump(previous, random = Math.random) {
  const choices = FIRM_JUMPS.filter(jump => jump !== previous);
  return choices[Math.floor(random() * choices.length)];
}

export function sampleFirmJump(jump, elapsed) {
  if (!jump || elapsed === null || elapsed <= 0 || elapsed >= jump.duration) return 0;
  const t = elapsed / jump.duration;
  return jump.height * 4 * t * (1 - t);
}
