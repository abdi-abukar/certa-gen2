import 'server-only';
import { environmentFor, settingsFromEnvironment, type Environment } from './environment.mjs';

// Hosted Next functions start without scripts/run.mjs. Derive the same server
// configuration from canonical deployment settings, never from request headers.
export function initializeWebEnvironment(environment: Environment = process.env) {
  if (environment.CERTA_APP) {
    if (environment.CERTA_APP !== 'web') throw new Error('Unexpected server app configuration.');
    return;
  }
  const configured = environmentFor('web', settingsFromEnvironment(environment), {});
  Object.assign(environment, configured);
}
