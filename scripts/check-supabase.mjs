import { readSettings, validateSettings } from './environment.mjs';

try {
  const settings = validateSettings(readSettings());
  const response = await fetch(`${settings.SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: settings.SUPABASE_PUBLISHABLE_KEY },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Supabase Auth health check failed (${response.status}).`);
  const body = await response.json();
  console.log(JSON.stringify({ reachable: true, emailAuthEnabled: body.external?.email === true, signupDisabled: body.disable_signup === true, emailConfirmationRequired: body.mailer_autoconfirm === false }, null, 2));
  console.log('Read-only check. No users, policies, or project settings were changed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
