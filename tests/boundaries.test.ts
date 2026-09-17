import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', '.next', '.expo', 'dist', '.git'].includes(entry.name)) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sources(path) : /\.(ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [path] : [];
  });
}

test('workspaces cannot import other apps or escape into the old repo; clients cannot import server code', () => {
  for (const category of ['apps', 'packages']) for (const name of readdirSync(resolve(root, category), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)) {
    const directory = resolve(root, category, name);
    const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      assert.ok(!['@certa/web', '@certa/admin', '@certa/mobile'].includes(dependency), `${manifest.name} depends on an app`);
    }
    for (const file of sources(directory)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/(?:from\s*|import\s*\(?|require\s*\()\s*['"]([^'"]+)['"]/g)) {
        const target = match[1];
        if (target.startsWith('.')) assert.ok(resolve(dirname(file), target).startsWith(`${directory}/`), `${file} imports outside its workspace`);
        if (['mobile', 'supabase', 'api-client', 'ui-web'].includes(name)) {
          assert.ok(!target.startsWith('@certa/server') && !target.startsWith('next/'), `${file} imports a server framework`);
        }
      }
    }
  }
});
