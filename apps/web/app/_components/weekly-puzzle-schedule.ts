const toronto = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function civilTime(date: Date) {
  const parts = Object.fromEntries(toronto.formatToParts(date).map(part => [part.type, part.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second));
}

/** Display-only weekly schedule. Actual puzzle availability remains server-owned. */
export function nextPuzzleSunday(now: Date): number {
  const local = new Date(civilTime(now));
  const target = new Date(local);
  target.setUTCDate(local.getUTCDate() + (7 - local.getUTCDay()) % 7);
  target.setUTCHours(17, 0, 0, 0);
  if (target.getTime() <= local.getTime()) target.setUTCDate(target.getUTCDate() + 7);
  // Resolve the offset at the target Sunday, which may differ across DST.
  let instant = target.getTime();
  for (let i = 0; i < 3; i++) instant += target.getTime() - civilTime(new Date(instant));
  return instant;
}

