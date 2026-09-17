# Local environment and browser startup

All paths and commands here belong to the **new `certa-mono-repo/`** workspace.
The client browser application is `apps/web`; the staff application is `apps/admin`.

## 1. Minimum `.env` to start web and admin

Use one file: **`certa-mono-repo/.env`**. Keep an existing file; copy
[.env.example](.env.example) only if creating a new one. Do not put `.env` files in
`apps/web`, `apps/admin` or `apps/mobile`—the launcher rejects app-level files.

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_LEGACY_ANON_KEY
WEB_ORIGIN=http://localhost:3200
ADMIN_ORIGIN=http://localhost:3201
API_ORIGIN=http://localhost:3200
```

Replace the first two placeholders with the project's actual public configuration.
These five variables are validated at startup, including `API_ORIGIN` when starting
only the browser apps. A publishable key normally starts with `sb_publishable_`;
the legacy `anon` JWT is also supported. A service-role/secret key cannot go in
`SUPABASE_PUBLISHABLE_KEY`.

Origins contain only scheme, hostname and optional port—no route/query/fragment.
Use the addresses above with the existing dev scripts. Keep `localhost` consistent
between the browser and origins; changing only `.env` does not change the scripts'
ports. Remote origins require HTTPS; loopback/private LAN origins may use HTTP.

Basic startup and Supabase password authentication do not need payment keys,
vendor worker credentials or the privileged database key. Actual sign-in still
needs a reachable Supabase project and an existing user or enabled signup flow.

## 2. Start both browser apps

From the parent Certa folder:

```sh
cd certa-mono-repo
nvm use
pnpm install --frozen-lockfile
pnpm dev:browser
```

Node is pinned to **22.23.1**, pnpm to **9.6.0**. If dependencies are already installed,
skip the install. Use your Node version manager's equivalent if not using nvm.

- Client website: **http://localhost:3200**
- Staff admin: **http://localhost:3201**

The command runs web/admin in parallel through their existing environment launchers.
Both build their local game assets before Next starts. Ctrl+C stops the command.
It does not open a browser automatically, apply database migrations or start vendor
workers. Open the addresses after the terminal reports that Next is ready.

For separate terminals, run `pnpm dev:web` and `pnpm dev:admin` from this directory.
If one app is already running, start only the other. A second process on the same
port will fail; changing the browser origin to an accidental alternate port would
also break the configured origin/callback assumptions.

For production-mode testing, run `pnpm build` first, then run these in separate terminals:

```sh
pnpm --filter @certa/web start
pnpm --filter @certa/admin start
```

## 3. Database-backed backend features

Add this when exercising the trading, compliance, payout, Discord, content or awards
APIs that use privileged server database operations:

```dotenv
SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SUPABASE_SECRET_OR_SERVICE_ROLE_KEY
```

The variable name is exactly `SUPABASE_SECRET_KEY`. The launcher does not substitute
`SUPABASE_SERVICE_ROLE_KEY` from the old application. It sends this credential only
to the approved server processes; never use a `NEXT_PUBLIC_` or `EXPO_PUBLIC_` name.

The corresponding tables/functions/storage must also exist. Adding the key does not
install schemas. Follow [supabase/README.md](supabase/README.md) and reconcile the
existing project baseline before applying target migrations. Missing configuration
or schema may make a feature return 503 while the applications themselves start normally.

## 4. Feature-specific requirements

All names below already exist in `.env.example` and the launcher's allowlist.
Only configure a feature when testing or enabling that feature. Optional health
keys are separate from credentials that perform business operations.

| Feature | Settings | Runtime/activation notes |
| --- | --- | --- |
| Tradara account/payout worker | `TRADARA_API_BASE_URL`, `TRADARA_FIRM_API_KEY`, `TRADARA_FIRM_ID` | Firm write key goes to the Tradara service. API origin is the explicitly selected sandbox or production origin. Requires server DB key and reconciled account/payout schemas. |
| Tradara webhook | `TRADARA_WEBHOOK_SECRET`, `TRADARA_FIRM_ID` | Web verifies callbacks; a configured secret alone does not create a vendor webhook subscription. |
| Tradara customer links/live updates | `TRADARA_LOGIN_URL`, `TRADARA_LIVE_URL`, `TRADARA_SERVICE_PORT` | Login URL must use HTTPS. Local live URL defaults to `ws://localhost:3210/v1/live`; hosted uses WSS. Service port defaults to 3210. |
| DocuSeal signing | `DOCUSEAL_API_KEY`, `DOCUSEAL_API_ORIGIN`, `DOCUSEAL_WEBHOOK_SECRET` | API key is contracts-worker only; HMAC callback secret is web only. Default API origin: `https://api.docuseal.com`. Publish verified template versions before starting requests. |
| Veriff identity | `VERIFF_API_KEY`, `VERIFF_SHARED_SECRET`, `VERIFF_API_ORIGIN` | Web and contracts worker receive required verification credentials. Default API origin: `https://stationapi.veriff.com`. |
| Payout destinations | `PAYOUT_DESTINATION_KEY` | Web/admin only; 32 random bytes encoded as 64 hex characters. Required to encrypt/decrypt destinations; back up the key and use a reviewed rotation process for existing records. |
| Discord linking/interactions | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID`, `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_INVITE_URL` | Linking, guild operations and signature-verified interactions have distinct consumers. Configure provider callback/permissions per `DISCORD.md`. |
| Discord worker/delivery | `DISCORD_DELIVERY_ENABLED`, `DISCORD_MILESTONES_CHANNEL_ID`, `DISCORD_PNL_CHANNEL_ID`, `DISCORD_STAFF_CHANNEL_ID`, `DISCORD_VOICE_CHANNEL_ID`, `DISCORD_FOUNDER_IDS`, `DISCORD_MEMBER_EVENTS` | Enable only the configured delivery/features. Role mappings live in the database. Member events need corresponding provider configuration. |
| Discord live feed | `DISCORD_SERVICE_PORT`, `DISCORD_STREAM_ORIGIN` | Local service: 3211; web proxy origin: `http://127.0.0.1:3211`. Requires the Discord service running separately. |
| Transactional email foundation | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_DELIVERY_MODE` | Web receives these. Keep delivery `disabled` for local non-sending development. The current auth triggers also remain disabled in code; setting `live` does not wire them up. |
| Newsletter publication/delivery | `NEWSLETTER_POSTAL_ADDRESS`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `RESEND_API_KEY`, `NEWSLETTER_DELIVERY_MODE`, `RESEND_NEWSLETTER_WEBHOOK_SECRET` | Admin freezes sender/content; content worker sends; web verifies provider delivery events. Marketing delivery has its own switch. |
| Weekly puzzles | `PUZZLE_ANSWER_KEY` | Web/admin; random secret at least 32 characters. Keep stable for existing puzzles. Real prize issuance still needs the ticket adapter. |
| Optional newsletter AI drafts | `ANTHROPIC_API_KEY`, `ANTHROPIC_NEWSLETTER_MODEL` | Admin only. Use a model configured for your account. Not required for manual content or basic startup. |
| Awards/render worker | No extra vendor key beyond the server DB key | Needs awards tables/private storage; renders run inside the content service. |
| Optional admin probes | `RESEND_HEALTH_API_KEY`, `TRADARA_HEALTH_API_KEY`, `DOCUSEAL_HEALTH_API_KEY`, `VERIFF_HEALTH_ENABLED`, `DISCORD_HEALTH_ENABLED`, `ANTHROPIC_HEALTH_ENABLED` | Missing optional settings report unconfigured health. These do not prevent browser startup or prove business workflows work. |

For local work that should not send outbound messages:

```dotenv
EMAIL_DELIVERY_MODE=disabled
NEWSLETTER_DELIVERY_MODE=disabled
DISCORD_DELIVERY_ENABLED=false
```

Worker commands are independent of `dev:browser`:

```sh
pnpm dev:tradara
pnpm dev:contracts
pnpm dev:discord
pnpm dev:content
```

These are real backend workers and can process queued work against the configured
database/provider accounts. Start only the worker needed for the configured test
environment. Message-delivery switches do not disable Tradara provisioning or
contract creation.

Current checkout processor work remains in the parent app. Authorize.net/NMI/
NOWPayments settings and `CERTA_PAYMENT_WORKER_SECRET` are not consumed by the new
monorepo's environment launcher. Adding them here does not connect that payment
backend. Migrate its adapter/configuration boundary before adding its variables.

## 5. Admin access and auth callbacks

Admin uses the same Supabase project but a separate session. It has no `.env`
admin-password setting. An existing user needs server-managed `app_metadata` with
`role: admin`, `certa_admin` or `super_admin`, or boolean `certa_admin: true`.
A fresh `role: super_admin` is the master role and has full feature access.
Other staff roles require their documented feature permissions (with the trading
read gap recorded in the backend audit). Editable `user_metadata` cannot grant access.

Master-only `/staff` uses the existing server-only `SUPABASE_SECRET_KEY` to list
Auth users and update existing staff app metadata. The initial master must be set
through a trusted Supabase administrative channel after confirming the exact
account; an email string in browser code or environment is never an access grant.
The UI can promote other staff to master and remove ordinary staff access, but
cannot demote/remove masters or change its own access. No invitations are sent.

Each directory request makes one fresh identity check and one Auth Admin list call
(maximum 100 underlying accounts); only staff records and approved display fields
are returned. Continue pagination to find all staff; search filters loaded records.
Each update performs fresh actor/target checks and one update, preserving unrelated
app metadata. A revision detects already-stale edits, but Auth Admin has no atomic
compare-and-swap: concurrent editors can still overwrite each other. Coordinate
staff edits. Metadata records the latest actor/time, not an immutable audit ledger.
Requests are private/no-store, provider calls have a 15-second timeout, mutations
have Origin checks, and unknown writes require reloading before retrying.

For email confirmation/recovery, configure the project's redirect allowlist:

```text
http://localhost:3200/auth/callback
http://localhost:3200/auth/callback?next=/reset-password
http://localhost:3201/auth/callback
http://localhost:3201/auth/callback?next=/reset-password
```

Use HTTPS equivalents when hosted. Local admin does not require Cloudflare Access;
the hosted admin must use the documented outer access control. No role or hosted
auth setting is changed by the startup commands.

## 6. How settings are loaded

`scripts/environment.mjs` reads the monorepo root `.env`. Approved process/deployment
variables override values from that file. `scripts/run.mjs` passes only the per-app
allowlist. Validation and projection live in `packages/server/src/environment.mjs`
so hosted web startup uses the same rules. With `VERCEL=1`, the loader ignores the
local `.env` entirely and requires deployment settings. Restart processes after changing settings.

Do not manually duplicate derived `CERTA_*`, `EXPO_PUBLIC_*` or `NEXT_PUBLIC_*`
variables. Native gets only the public Supabase values and API origin. For a physical
phone, set `API_ORIGIN` to the computer's reachable LAN origin; browser web/admin
origins still need to match the addresses used to access those apps.

The requirements above were checked against the current loader and backend owners;
they describe configured code, not verified live vendor accounts or deployed schemas.

## 7. Vercel web preview deployment

Import **`abdi-abukar/certa-gen2`** into a new Vercel project. Use a temporary
`*.vercel.app` project domain; no custom domain is required.

| Setting | Value |
| --- | --- |
| Root Directory | `apps/web` |
| Include source files outside Root Directory | Enabled (shared packages, game, lockfile and launcher) |
| Framework | Next.js |
| Node.js | 22.x |
| Install Command | `corepack pnpm install --frozen-lockfile` (in `apps/web/vercel.json`) |
| Build Command | `corepack pnpm run build` (in `apps/web/vercel.json`) |
| Output Directory | Leave the Next.js default |

The repository pins pnpm 9.6.0 through `packageManager`. The web build first builds
the game into `apps/web/public/game`, then invokes the existing allowlisted launcher.
Do not select the repository root as the app root or use the root `pnpm build`,
which also builds the separate staff application.

Add these **canonical** variables in Vercel for the environment you will deploy:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Existing Certa project's HTTPS URL |
| `SUPABASE_PUBLISHABLE_KEY` | Existing project's publishable/anon key, never a service-role key |
| `WEB_ORIGIN` | Exact HTTPS test domain, e.g. `https://YOUR_PROJECT.vercel.app` |
| `API_ORIGIN` | Same test domain as `WEB_ORIGIN` |
| `ADMIN_ORIGIN` | `https://admin.invalid` until a separate staff deployment exists |

Set origins to the hostname you will actually use. For a branch preview, scope
the origin variables to that branch's chosen preview hostname. Do not use a
wildcard origin; cookies, callbacks and mutation checks rely on exact origins.
Vercel calls a deployment from `main` “Production” even when its hostname is a
temporary test domain: configure variables in that scope if deploying `main`.

Use `.env.example` as a reference, **not the private root `.env` as a bulk upload**.
Basic public rendering and password auth only need the five values above. Optional
DB features, puzzles and community data can remain unavailable without their
specific keys/schemas. Keep email/newsletter/Discord delivery disabled and do not
add worker, vendor-write or service-role credentials merely to preview the site.

Hosted functions initialize derived `CERTA_*` values at startup using the same
validation and allowlists as the local launcher. No secrets are exported through
Next's `env` option or public-prefixed variables. Supply canonical names only;
do not manually duplicate `CERTA_*` in Vercel.

Before testing confirmation/password recovery, add the exact test-domain callback
URLs to the existing Supabase redirect allowlist (including the reset-password
variant from section 5). After deployment, verify `/`, `/game/`, login, the callback
and protected-account redirects. Vercel account setup, a hosted build and real-domain
auth callbacks have not been verified by local preparation alone.

This project deploys only web. Staff still requires its separate Cloudflare Access
gate. Tradara, contracts, Discord and content workers are long-running services;
they are not activated or deployed by this Vercel configuration.

Official references: [Vercel monorepos](https://vercel.com/docs/monorepos),
[build configuration](https://vercel.com/docs/builds/configure-a-build), and
[environment variables](https://vercel.com/docs/environment-variables).
