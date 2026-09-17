import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { root, readSettings, environmentFor } from './environment.mjs';

const [app, command, ...args] = process.argv.slice(2);
try {
  if (!['next', 'expo'].includes(command)) throw new Error('Unsupported workspace command.');
  const cwd = join(root, 'apps', app);
  if (readdirSync(cwd).some(name => name === '.env' || name.startsWith('.env.'))) {
    throw new Error('App-level .env files are forbidden. Use the single root .env.');
  }
  const environment = environmentFor(app, readSettings());
  const child = spawn(command, args, { cwd, env: environment, stdio: 'inherit', shell: false });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('error', () => { console.error('Could not start workspace command. Run pnpm install first.'); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
