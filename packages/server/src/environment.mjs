export const settingNames = ['ANTHROPIC_API_KEY','ANTHROPIC_NEWSLETTER_MODEL','ANTHROPIC_HEALTH_ENABLED','PUZZLE_ANSWER_KEY','NEWSLETTER_POSTAL_ADDRESS','NEWSLETTER_DELIVERY_MODE','RESEND_NEWSLETTER_WEBHOOK_SECRET','DISCORD_CLIENT_ID','DISCORD_CLIENT_SECRET','DISCORD_BOT_TOKEN','DISCORD_GUILD_ID','DISCORD_PUBLIC_KEY','DISCORD_INVITE_URL','DISCORD_DELIVERY_ENABLED','DISCORD_MILESTONES_CHANNEL_ID','DISCORD_PNL_CHANNEL_ID','DISCORD_STAFF_CHANNEL_ID','DISCORD_VOICE_CHANNEL_ID','DISCORD_FOUNDER_IDS','DISCORD_MEMBER_EVENTS','DISCORD_SERVICE_PORT','DISCORD_STREAM_ORIGIN','DISCORD_HEALTH_ENABLED','PAYOUT_DESTINATION_KEY','SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'WEB_ORIGIN', 'ADMIN_ORIGIN', 'API_ORIGIN', 'RESEND_API_KEY', 'EMAIL_FROM', 'EMAIL_REPLY_TO', 'EMAIL_DELIVERY_MODE', 'RESEND_HEALTH_API_KEY', 'TRADARA_HEALTH_API_KEY', 'SUPABASE_SECRET_KEY', 'TRADARA_API_BASE_URL', 'TRADARA_FIRM_API_KEY', 'TRADARA_FIRM_ID', 'TRADARA_WEBHOOK_SECRET', 'TRADARA_LOGIN_URL', 'TRADARA_LIVE_URL', 'TRADARA_SERVICE_PORT', 'DOCUSEAL_API_KEY', 'DOCUSEAL_API_ORIGIN', 'DOCUSEAL_WEBHOOK_SECRET', 'DOCUSEAL_HEALTH_API_KEY', 'VERIFF_API_KEY', 'VERIFF_SHARED_SECRET', 'VERIFF_API_ORIGIN', 'VERIFF_HEALTH_ENABLED'];

export function settingsFromEnvironment(environment) {
  return Object.fromEntries(settingNames.map(name => [name, environment[name] ?? ""]));
}

export function validateSettings(settings) {
  if (settings.TRADARA_API_BASE_URL && !['https://api.tradara.com','https://api.sandbox.tradara.com'].includes(settings.TRADARA_API_BASE_URL)) throw new Error('Invalid Tradara API environment.');
  for (const name of ['TRADARA_LOGIN_URL','TRADARA_LIVE_URL']) {
    if (!settings[name]) continue;
    let url; try { url = new URL(settings[name]); } catch { throw new Error(`Invalid ${name}.`); }
    const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    const valid = name === 'TRADARA_LOGIN_URL' ? url.protocol === 'https:' : url.protocol === 'wss:' || local && url.protocol === 'ws:';
    if (!valid || url.username || url.password || url.hash) throw new Error(`Invalid ${name}.`);
  }

  for (const name of ['SUPABASE_URL', 'WEB_ORIGIN', 'ADMIN_ORIGIN', 'API_ORIGIN']) {
    let url;
    try { url = new URL(settings[name]); } catch { throw new Error(`Set a valid ${name} in the root .env.`); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) {
      throw new Error(`${name} must be an HTTPS origin (HTTP is allowed for local development).`);
    }
  }
  const key = settings.SUPABASE_PUBLISHABLE_KEY;
  if (key?.startsWith('sb_publishable_') && key.length > 20) return settings;
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
    if (key.split('.').length === 3 && payload.role === 'anon') return settings;
  } catch { /* Invalid public key. Never print key material. */ }
  throw new Error('SUPABASE_PUBLISHABLE_KEY must be a publishable key or legacy anon key; privileged keys are forbidden.');
}

export function environmentFor(app, settings, inherited = process.env) {
  if (!['web', 'admin', 'mobile', 'tradara', 'contracts', 'discord', 'content'].includes(app)) throw new Error('Unknown app.');
  validateSettings(settings);
  // Allowlisted OS/tool settings only. Never spread process.env into app processes.
  const environment = {};
  for (const name of ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'SHELL', 'TERM', 'LANG', 'LC_ALL', 'CI', 'NODE_ENV', 'PORT', 'NO_COLOR', 'FORCE_COLOR', 'DEVELOPER_DIR', 'ANDROID_HOME', 'ANDROID_SDK_ROOT', 'JAVA_HOME', 'REACT_NATIVE_PACKAGER_HOSTNAME', 'EXPO_OFFLINE', 'EXPO_NO_TELEMETRY', 'NEXT_TELEMETRY_DISABLED', 'VERCEL', 'VERCEL_ENV', 'VERCEL_TARGET_ENV', 'VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_DEPLOYMENT_ID']) {
    if (inherited[name] !== undefined) environment[name] = inherited[name];
  }
  if (app === 'web' || app === 'admin' || app === 'tradara' || app === 'contracts' || app === 'discord' || app === 'content') {
    Object.assign(environment, {
      CERTA_APP: app,
      CERTA_SUPABASE_URL: settings.SUPABASE_URL,
      CERTA_SUPABASE_PUBLISHABLE_KEY: settings.SUPABASE_PUBLISHABLE_KEY,
      CERTA_APP_ORIGIN: settings[app === 'web' ? 'WEB_ORIGIN' : 'ADMIN_ORIGIN'],
      CERTA_ALLOWED_ORIGINS: [settings.WEB_ORIGIN, settings.ADMIN_ORIGIN].join(','),
    });
  } else {
    const prefix = 'EXPO_PUBLIC_';
    environment[`${prefix}SUPABASE_URL`] = settings.SUPABASE_URL;
    environment[`${prefix}SUPABASE_PUBLISHABLE_KEY`] = settings.SUPABASE_PUBLISHABLE_KEY;
    environment[`${prefix}API_ORIGIN`] = settings.API_ORIGIN;
  }
  // Email delivery has one server owner. Never project these settings to native
  // or Next public variables. Admin auth delivery will use the same hook.
  if (app === 'web') {
    for (const name of ['RESEND_API_KEY', 'EMAIL_FROM', 'EMAIL_REPLY_TO', 'EMAIL_DELIVERY_MODE']) {
      if (settings[name]) environment[name] = settings[name];
    }
  }
  if (app === 'admin') {
    for (const name of ['RESEND_HEALTH_API_KEY', 'TRADARA_HEALTH_API_KEY', 'TRADARA_API_BASE_URL', 'DOCUSEAL_HEALTH_API_KEY', 'DOCUSEAL_API_ORIGIN', 'VERIFF_HEALTH_ENABLED']) {
      if (settings[name]) environment[name] = settings[name];
    }
  }
  if (['web', 'admin', 'tradara', 'contracts', 'discord', 'content'].includes(app)) {
    for (const name of ['SUPABASE_SECRET_KEY', 'TRADARA_FIRM_ID', 'TRADARA_LOGIN_URL', 'TRADARA_LIVE_URL']) if (settings[name]) environment[name] = settings[name];
  }
  if (['web', 'admin'].includes(app) && settings.PAYOUT_DESTINATION_KEY) environment.PAYOUT_DESTINATION_KEY = settings.PAYOUT_DESTINATION_KEY;
  if (app === 'web' && settings.TRADARA_WEBHOOK_SECRET) environment.TRADARA_WEBHOOK_SECRET = settings.TRADARA_WEBHOOK_SECRET;
  if (app === 'tradara') {
    for (const name of ['TRADARA_API_BASE_URL', 'TRADARA_FIRM_API_KEY', 'TRADARA_SERVICE_PORT']) if (settings[name]) environment[name] = settings[name];
  }
  if (app === 'contracts') {
    for (const name of ['DOCUSEAL_API_KEY','DOCUSEAL_API_ORIGIN','VERIFF_API_KEY','VERIFF_SHARED_SECRET','VERIFF_API_ORIGIN']) if(settings[name]) environment[name]=settings[name];
  }
  if (app === 'web') {
    for (const name of ['DOCUSEAL_WEBHOOK_SECRET','VERIFF_API_KEY','VERIFF_SHARED_SECRET']) if(settings[name]) environment[name]=settings[name];
  }
  if (['web','admin','discord'].includes(app)) {
    environment.CERTA_WEB_ORIGIN=settings.WEB_ORIGIN;
    for(const name of ['DISCORD_CLIENT_ID','DISCORD_GUILD_ID','DISCORD_INVITE_URL','DISCORD_DELIVERY_ENABLED']) if(settings[name]) environment[name]=settings[name];
  }
  if (['web','discord'].includes(app)) {
    if(settings.DISCORD_BOT_TOKEN) environment.DISCORD_BOT_TOKEN=settings.DISCORD_BOT_TOKEN;
  }
  if(app==='web') for(const name of ['DISCORD_CLIENT_SECRET','DISCORD_PUBLIC_KEY','DISCORD_STREAM_ORIGIN']) if(settings[name]) environment[name]=settings[name];
  if(app==='admin' && settings.DISCORD_HEALTH_ENABLED) environment.DISCORD_HEALTH_ENABLED=settings.DISCORD_HEALTH_ENABLED;
  if(app==='discord') for(const name of ['DISCORD_MILESTONES_CHANNEL_ID','DISCORD_PNL_CHANNEL_ID','DISCORD_STAFF_CHANNEL_ID','DISCORD_VOICE_CHANNEL_ID','DISCORD_FOUNDER_IDS','DISCORD_MEMBER_EVENTS','DISCORD_SERVICE_PORT']) if(settings[name]) environment[name]=settings[name];
  if(['web','admin'].includes(app)) {
    environment.CERTA_WEB_ORIGIN=settings.WEB_ORIGIN;
    for(const name of ['PUZZLE_ANSWER_KEY','NEWSLETTER_POSTAL_ADDRESS']) if(settings[name]) environment[name]=settings[name];
  }
  if(app==='admin') for(const name of ['ANTHROPIC_API_KEY','ANTHROPIC_NEWSLETTER_MODEL','ANTHROPIC_HEALTH_ENABLED','EMAIL_FROM','EMAIL_REPLY_TO']) if(settings[name]) environment[name]=settings[name];
  if(app==='web' && settings.RESEND_NEWSLETTER_WEBHOOK_SECRET) environment.RESEND_NEWSLETTER_WEBHOOK_SECRET=settings.RESEND_NEWSLETTER_WEBHOOK_SECRET;
  if(app==='content') for(const name of ['SUPABASE_SECRET_KEY','RESEND_API_KEY','NEWSLETTER_DELIVERY_MODE']) if(settings[name]) environment[name]=settings[name];
  environment.EXPO_NO_DOTENV = '1';
  return environment;
}
