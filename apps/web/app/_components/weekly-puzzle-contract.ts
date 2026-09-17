export type LivePuzzle = { id: string; prompt: string; answerLength: number; image: string | null; startsAt: string; endsAt: string; capacity: number; claimed: number };
export type PuzzleReward = { puzzle_id: string; state: 'pending' | 'granted' | 'failed'; ticket_grant_id: string | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid puzzle response');
  return value as Record<string, unknown>;
};
export function readPuzzle(value: unknown): LivePuzzle | null {
  const { item } = record(value);
  if (item === null) return null;
  const p = record(item);
  if (typeof p.id !== 'string' || !uuid.test(p.id) || typeof p.prompt !== 'string' || p.prompt.length > 2000
    || typeof p.answer_mask !== 'string' || !/^_{1,24}$/.test(p.answer_mask)
    || typeof p.starts_at !== 'string' || typeof p.ends_at !== 'string'
    || !Number.isFinite(Date.parse(p.starts_at)) || !Number.isFinite(Date.parse(p.ends_at)) || Date.parse(p.ends_at) <= Date.parse(p.starts_at)
    || !Number.isSafeInteger(p.reward_cap) || Number(p.reward_cap) < 1 || Number(p.reward_cap) > 10000
    || !Number.isSafeInteger(p.claimed) || Number(p.claimed) < 0 || Number(p.claimed) > Number(p.reward_cap)) throw new Error('Invalid puzzle response');
  let image: string | null = null;
  if (p.image_id !== null) {
    const candidate = record(p.images)[String(p.image_id)];
    if (typeof candidate !== 'string' || !candidate.startsWith('https://')) throw new Error('Invalid clue image');
    image = candidate;
  }
  return { id: p.id, prompt: p.prompt, answerLength: p.answer_mask.length, image, startsAt: p.starts_at, endsAt: p.ends_at, capacity: Number(p.reward_cap), claimed: Number(p.claimed) };
}
export function readReward(value: unknown, puzzleId: string): PuzzleReward {
  const r = record(value);
  if (r.puzzle_id !== puzzleId || !['pending', 'granted', 'failed'].includes(String(r.state))
    || (r.ticket_grant_id !== null && (typeof r.ticket_grant_id !== 'string' || !r.ticket_grant_id))) throw new Error('Invalid reward');
  if (r.state === 'granted' && !r.ticket_grant_id) throw new Error('Unconfirmed ticket grant');
  return { puzzle_id: puzzleId, state: r.state as PuzzleReward['state'], ticket_grant_id: r.ticket_grant_id as string | null };
}
export function readRewards(value: unknown, puzzleId: string): PuzzleReward | null {
  const { items } = record(value);
  if (!Array.isArray(items) || items.length > 50) throw new Error('Invalid rewards');
  const match = items.find(item => record(item).puzzle_id === puzzleId);
  return match ? readReward(match, puzzleId) : null;
}
