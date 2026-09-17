import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { settingNames } from '../packages/server/src/environment.mjs';
export { environmentFor, validateSettings } from '../packages/server/src/environment.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));

export function readSettings(overrides = process.env) {
  const path = new URL('../.env', import.meta.url);
  const local = overrides.VERCEL !== '1' && existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {};
  return Object.fromEntries(settingNames.map(key => [key, overrides[key] ?? local[key] ?? '']));
}
