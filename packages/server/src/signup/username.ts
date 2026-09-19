/** Public @username rules, ported from the original `lib/trader/username.ts`. Client-safe. */
export const USERNAME_MAX = 12;
const PATTERN = /^[a-z][a-z0-9]{0,11}$/;
const BRAND = ['certa', 'tradara', 'abdi'];
const RESERVED = new Set(['admin','staff','owner','help','root','mod','ops','bot','api','www','app','null','true','test','demo','guest','user','login','signup','team','ceo','cfo','cto','nsa','fbi','cia','irs','god','sex','cum','tit','ass','fag','kkk']);
const PROFANITY = ['fuck','shit','dick','cock','cunt','piss','nigg','rape','porn','slut','whore','bitch','nazi','kike','spic','retard','faggot'];
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '$': 's', '@': 'a' };
function foldLeet(value: string) { return value.toLowerCase().replace(/[0134578$@]/g, char => LEET[char] ?? char); }
export function normalizeUsername(raw: string) { return raw.trim().toLowerCase().replace(/[^a-z0-9]/g, ''); }
export function validateUsername(raw: string): { ok: true; username: string } | { ok: false; error: string } {
  const username = normalizeUsername(raw);
  if (username.length < 1 || username.length > USERNAME_MAX) return { ok: false, error: `Usernames must be 1–${USERNAME_MAX} characters.` };
  if (!PATTERN.test(username)) return { ok: false, error: 'Use a letter first, then letters or numbers. No spaces or symbols.' };
  const folded = foldLeet(username);
  if (BRAND.some(token => username.includes(token) || folded.includes(token)) || RESERVED.has(username) || RESERVED.has(folded)) return { ok: false, error: 'That name is reserved.' };
  if (PROFANITY.some(token => username.includes(token) || folded.includes(token))) return { ok: false, error: 'Choose a different username.' };
  return { ok: true, username };
}
