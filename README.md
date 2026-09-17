# Certa monorepo

Standalone Certa workspace for web, mobile and staff. Shared backend foundations
cover authentication, Tradara/accounts, compliance, payouts/affiliates, Discord,
content and awards. Checkout processors, coupons and prize tickets have existing
implementations in the parent application awaiting migration/integration here.

Resend now has an email foundation: two independent templates, validated variables,
offline previews and server-only delivery. Triggers/delivery remain disabled; live
Supabase email delivery and customer 2FA have not been switched. See [EMAILS.md](EMAILS.md).

Read [STRUCTURE.md](STRUCTURE.md) for the directory map and placement rules.
[AGENTS.md](AGENTS.md) governs future implementation and migration work.
[CONTRIBUTING.md](CONTRIBUTING.md) defines the code/vendor change process.

Frontend work follows [FRONTEND.md](FRONTEND.md) and the repo-local
[Certa frontend skill](.agents/skills/certa-frontend/SKILL.md), also required by
`AGENTS.md`. The skill contains design, implementation and visual-review guidance
for web, mobile, staff and game UI; it can be invoked as `$certa-frontend` when
discovered, or read directly from its path. These are the rebuild's design defaults,
applied first to the public introduction described below. Other frontend shells
remain foundations awaiting their own scoped design work.

## Public homepage

The web home route has a large centered black title above a continuously repeating
five-landmark village. A separate character walks the path and pauses facing each
landmark for 6 seconds facing it. Tap the character while walking or stopped for
one upright jump; arrival does not trigger a jump. Reduced motion disables jumps. Each stop opens a large feature panel above the village,
with a heading, explanation and three topic points. A pale shade covers the scene
while the panel is visible. Desktop uses two content columns; mobile stacks them.

The five topics are About Certa, Certa Transparency, Certa Community, Affiliates
and Certa Rewards. Topic buttons also expose the content with reduced motion
or an unavailable scene. Hovering a panel or focusing its topic controls holds
animation for reading. Each panel has one CTA to the account guide, Certa Discord or the existing weekly
puzzle dialog. Affiliate rewards are an editorial introduction, not an activated
affiliate workflow. The page makes no identity or vendor reads.

Navigation turns white after scrolling, and the account guide remains below the
hero. Signup and login use existing routes. The scene retains exact-origin/frame
message checks, reduced motion, hidden/offscreen pause and a static panorama
fallback. There is no visible playback strip or hero CTA group.

The earlier introduction passed regression tests, type checks and production
builds. The current village and expanded feature-panel layout have not had a
rendered browser review in this session because browser tooling is unavailable.
Native screens and physical-device behavior are outside this change. See
[art provenance](apps/web/app/_components/hero-art.md) and [AWARDS.md](AWARDS.md).

## Web dialogs

Homepage signup/login links open the reusable `ResponsiveDialog` shell, with
password recovery available inside login. The weekly puzzle uses the same shell.
Desktop places the form left and a borderless editorial community panel right.
On phones the panel compresses into an illustrated card above the bottom sheet with
16px inputs, viewport-aware height, scroll locking and reduced-motion support.
The auth operations and direct signup/login/recovery routes remain available.
DM Sans now loads once in the web root layout, including portal-mounted dialogs.

Verified for this change: regression tests, workspace type checks, production
web/admin builds, and the local HTTP auth/access suite. Isolated Chrome checks
covered 1440px desktop, 390px mobile, 320px reflow, focus trapping/restoration,
Escape/backdrop/close, scroll restoration, auth panel switching, 16px inputs,
reduced motion and the puzzle's mocked empty state. Real phone keyboards and
Safari-specific visual viewport behavior still need device verification.
The parent app's two-page signup (personal details, then credentials/terms),
email-code signup proof and login email/TOTP challenges are not migrated into
these dialogs. Current live auth still uses this repo's existing foundation;
see `EMAILS.md` for the inactive custom delivery and customer 2FA boundary.

## Start locally

For the first web-only Vercel deployment, import `abdi-abukar/certa-gen2` and set
the Root Directory to **`apps/web`**. Follow the settings and five required
environment variables in [the deployment guide](ENVIRONMENT.md#7-vercel-web-preview-deployment).
The admin app and durable workers need separate deployments.

Use Node 22.23.1 (`nvm use`) and pnpm 9.6.0, as pinned in this repository.
Run these commands from `certa-mono-repo/`, not the parent application.

```sh
nvm use
pnpm install --frozen-lockfile
# On a fresh checkout only: copy .env.example to .env and fill in its settings.
pnpm dev:browser
```

This starts the client website at `http://localhost:3200` and staff admin at
`http://localhost:3201`. It runs the existing per-app launchers and does not start
background vendor workers. Stop both with Ctrl+C.

See [ENVIRONMENT.md](ENVIRONMENT.md) for the five required startup variables,
feature-specific server credentials, staff access and callback setup. The complete
placeholder template is [.env.example](.env.example). Keep existing private `.env`
values when updating requirements; do not replace them with the template.

Alternatively run each app in a separate terminal:

| Command | App | Local address |
| --- | --- | --- |
| `pnpm dev:browser` | Web + admin together | Both addresses below |
| `pnpm dev:web` | Next.js public site + dashboard + API | `http://localhost:3200` |
| `pnpm dev:admin` | Next.js staff console | `http://localhost:3201` |
| `pnpm dev:mobile` | Expo iOS/Android app | Expo's terminal/QR instructions |

The mobile account screen calls the web app's `/api/me`, so run web
alongside it. A physical phone needs `API_ORIGIN` set to your computer's reachable
LAN address in the root `.env`; localhost on a phone is the phone itself. Restart
the apps after changing configuration. Native identifiers are initial defaults
(`com.certafutures.mobile`), not registered app-store records.

## One environment, explicit access

`scripts/environment.mjs` reads only the root `.env` and approved injected deployment
settings. `scripts/run.mjs` starts each app with an allowlisted environment.

- Web/admin receive server configuration. Authentication happens through Server
  Actions with HttpOnly host-only cookies. No browser Supabase key is needed there yet.
- Mobile receives only the three required `EXPO_PUBLIC_*` values.
- Publishable/legacy anon keys are accepted. Privileged keys are rejected as public keys.
- App-level `.env*` files are rejected. Expo automatic dotenv loading is disabled;
  No environment files are copied into apps.

Deployment uses the same canonical names from `.env.example`, injected by the
deployment platform. Run the workspace build/start commands from the monorepo.
Do not upload a master `.env` to a static host or place it in Expo `extra`.
Cloud Expo builds and signed store releases have not been configured in this phase.

## Supabase/auth status

Implemented:

- Web sign-in, signup, sign-out, password recovery, email-code callback, and protected account shell.
- Admin sign-in/recovery and fresh server-side staff authorization. No app MFA or staff signup page.
- Native sign-in/sign-out, session restoration, and authenticated API access.
- Mobile Keychain/Keystore token storage with bounded chunks and serialized updates.
- Native refresh only while the app is active; listener cleanup on unmount.
- Verified JWT identity API with an origin allowlist, bounded tokens, and private/no-store responses.
- Next CSP nonces, security headers, host-only cookies, and cross-origin Server Action protection.

Staff access preserves the existing server-managed `app_metadata` policy:
`role` is `admin`, `certa_admin`, or `super_admin`, or `certa_admin` is boolean true.
User-editable metadata cannot grant access. Each future staff operation must call
the guard; protecting the account page alone does not protect new endpoints.

All apps share users and the project, not one automatically shared browser session.
Web, admin, and mobile have separate session storage. Sign-out is local to
that session; it does not sign the user out of every device.

### Existing project settings and remaining hosted setup

The read-only Auth check on 2026-09-15 confirmed: reachable, email login enabled,
signup enabled, email confirmation currently **not required**. The signup flow
handles either immediate sessions or email confirmation. No project settings were changed.

Before email-link flows are used at a new hostname, verify Supabase's redirect
allowlist includes the exact callback URLs. Local examples:

```text
http://localhost:3200/auth/callback
http://localhost:3200/auth/callback?next=/reset-password
http://localhost:3201/auth/callback
http://localhost:3201/auth/callback?next=/reset-password
```

Use corresponding HTTPS URLs for deployed apps. This phase uses PKCE callbacks:
open the email link in the same browser that requested it. Mobile currently
provides existing-account sign-in; signup/recovery UI is provided on web. Native
email deep links and social sign-in are not implemented.

Cloudflare Access is the intended outer gate for hosted admin. Its deployed policy
has **not** been configured or verified here. Protect the full admin hostname,
including callbacks and actions, and block direct origin bypass using a private
origin/Tunnel with Access validation or verified Access JWTs at the origin. Do not
trust a plain identity header. The local admin app deliberately works without Cloudflare.

Supabase owns auth rate limits and session policies; this phase does not alter them
or add an in-memory rate limiter. Before public launch, verify provider limits,
email delivery, and edge abuse controls. Server-side auth requests can share an
egress IP; validate limits against expected traffic rather than guessing capacity.

No tables or database policies were changed. Existing RLS has not been certified
by this work. See [supabase/README.md](supabase/README.md) before migrating data access.

## Usage choices

- Public visitors trigger no Supabase session request in the proxy without an auth cookie.
- `getClaims()` verifies JWTs; the SDK caches signing keys when asymmetric keys are used.
  Legacy symmetric projects can still require Auth network validation.
- Staff authorization deliberately fetches fresh user metadata so revocations take effect.
- React request-scoped caching deduplicates server auth reads without sharing user data.
- No polling, Realtime subscriptions, background jobs, analytics SDKs, ORM, or cache vendor.
- Auth responses are never publicly cached. The current Next shells render dynamically
  for CSP nonces, including the public introduction. Static marketing rendering
  remains a separate optimization requiring the same security guarantees.

These are implementation choices, not a claim that the project has passed a load test.

## Verification

The shared web bottom sheet now contains scrolling within an opaque surface and
tracks the keyboard visual viewport, with regression coverage for scroll-edge
containment. Native iOS keyboard/accessory-toolbar behavior still needs an iPhone
check; automated tests and a web build do not establish device compatibility.

Vercel preparation (2026-09-16): environment validation/allowlists are shared by
the launcher and web runtime startup. Local builds can run with `VERCEL=1` and
synthetic deployment settings without reading the root `.env`. Ignore rules omit
secrets, generated outputs, Vercel state and reference-only nested checkouts.
Verified: frozen-lockfile installation with Corepack/pnpm 9.6.0, 88 regression
tests, all workspace type checks, production web/admin builds using synthetic
deployment settings, and HTTP auth/access tests with web launched from canonical
runtime variables. No live accounts or provider writes were used for these checks.
The hosted project and its real-domain callbacks still require the setup in
[ENVIRONMENT.md](ENVIRONMENT.md#7-vercel-web-preview-deployment).

```sh
pnpm test                          # Environment, key, role, redirect, secure-storage regressions
pnpm typecheck                     # All app/package TypeScript checks
pnpm build                         # Production web and admin builds
pnpm test:http                     # Built Next apps + local auth fixture, no live users
pnpm --filter @certa/mobile export  # iOS/Android JS bundles + Expo web export
pnpm supabase:check                # Read-only live Auth health/configuration check
pnpm email:preview                 # Offline HTML/text/variable schemas for every template
```

The HTTP suite starts temporary localhost servers and exercises actual Next login/
logout forms, session refresh, CSP, forged-token rejection, origin restrictions,
staff denial, and role revocation. It needs `pnpm build` first.

Verified on 2026-09-15: 18 regression tests (including email contracts, mocked Resend
delivery and secret isolation), all workspace type checks, production
web/admin builds, local HTTP auth tests, iOS/Android/web exports, and the
read-only live Supabase Auth check. No live user accounts were created for testing.

Passing JavaScript exports do not establish native device behavior. A real-account
sign-in on a simulator/phone, live reset-email delivery, Cloudflare policy checks,
database policy audit, and signed native builds remain deployment/integration checks.

## Backend migration status

Feature-specific sections below document the implemented server domains. Contracts,
Tradara, Discord and content have runnable worker services. API-watch is still an
inventory placeholder. The parent application's payment APIs, checkout sessions,
coupons and ticket logic are existing work to adapt to this workspace's account and
event model; they are not connected by starting the browser apps. UI completeness
is separate from backend implementation status.

## References

- [Supabase Next.js session setup](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Supabase React Native authentication](https://supabase.com/docs/guides/auth/quickstarts/react-native)
- [Expo monorepo guidance](https://docs.expo.dev/guides/monorepos/)
- [Cloudflare Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)

## Vendors

Admin `/vendors` lists Supabase, Resend and Tradara with protected health endpoints.
See `VENDORS.md` for optional admin-only health credentials and probe limitations,
and `TRADARA.md` for the proposed migration routes/cadence. No uptime history or
Tradara business routes are active; health checks do not send email or provision accounts.

Vendor validation: unit checks, all workspace type checks, admin production build,
and local HTTP fixtures cover staff authorization and inactive probes. Live Resend/Tradara
credentials and end-to-end delivery/trading health remain unverified.

Tradara planning was revised against official docs and AsyncAPI on 2026-09-15.
`TRADARA.md` defines shared filtered streams, lifecycle webhooks, product routes,
call budgets, replay/recovery policy and explicit contract gaps. This is a documented
proposal; no live WebSocket, worker, gateway or business integration is activated.

## Tradara backend implementation

The backend now includes customer/admin routes, signed event ingestion, a shared
stream worker, snapshots, operation audit/recovery and an additive RLS migration.
Run `pnpm dev:tradara` for the worker after activation setup. `TRADARA.md` is the
current implementation/route contract and supersedes the earlier planning notes.
The optional vendor health adapter now probes the official API firm-profile endpoint.
Production migration, identity/entitlement import, vendor credentials/subscriptions
and deployment have not been activated. See the explicit activation steps there.

## Account slots and compliance backend

Implemented three-slot allocation, first-evaluation/KYC gates, same-slot funded
upgrades, versioned compliance evidence, customer reservation/status APIs and audited
admin grants, replacements, cancellation and recovery. See [ACCOUNTS.md](ACCOUNTS.md)
for routes, examples, tests and activation requirements. Account closure currently
requires staff action in Tradara; Certa waits for vendor confirmation. No customer/admin
UI or payment/KYC/signature vendor callback integration was added. Both new-repo
migrations remain unapplied to the existing Supabase project.

## KYC and contracts backend

Veriff + DocuSeal now share a versioned request lifecycle, durable worker, signed
webhook inbox, provider-ID storage and customer/admin APIs. The Sim Funded agreement,
W-9 and W-8BEN template IDs are seeded disabled. Verified results feed the existing
slot/compliance coordinator. See [CONTRACTS.md](CONTRACTS.md) for routes and the
mandatory policy for adding document types/providers. Start the worker with
`pnpm dev:contracts` after configuring its server-only credentials and reviewed migrations.

No production migration, credential copying, provider subscription or template
activation occurred. PDFs remain with DocuSeal; an independent private archive and
signing screens are not implemented. Provider health scopes distinguish DocuSeal
API reads from Veriff's optional public status report.

## Affiliate and trader payout backend

Implemented customer requests/status, creator-code and content review, manual
commission approval, 1st/15th affiliate sessions, encrypted payout destinations,
separate approval/payment records, and Tradara cap-before-withdrawal execution with
reconciliation. The first-payout contract increase is a manual, audited staff step.
See [PAYOUTS.md](PAYOUTS.md) for routes, permissions, rules and deployment order.
The existing Tradara worker owns scheduled processing. This is a backend change;
frontends, historical data import and live vendor/transfer acceptance remain separate.
The additive migration is not applied to the existing project. Configure
`PAYOUT_DESTINATION_KEY` on web/admin before accepting payout methods.

Payout validation: all 52 unit/worker tests, isolated PostgreSQL migration and
concurrency checks, workspace type checks, web/admin builds, and the local HTTP
ownership/permission suite passed. Vendor sandbox writes remain unverified.

## Discord community

The customer page is `/community` on web; staff use `/discord` on admin. One-to-one
linking, durable disconnect cleanup, event-driven roles, confirmed pass/payout posts,
verified trade/day/month sharing, optional daily/weekly recaps, private commands and live
presence/feed are implemented. Avatar synchronization is omitted. See
[DISCORD.md](DISCORD.md) for the API and activation policy.

Start the worker with `pnpm dev:discord` after configuring credentials and reconciling
migrations. Delivery defaults off. No migration, bot setup or live message send was
performed by this change. Native linking currently opens the signed-in web flow.

Discord verification: 64 unit tests, isolated PostgreSQL workflow/concurrency/RLS tests,
real Next HTTP authorization/signature fixtures, all workspace type checks and web/admin
production builds pass. Gateway tests use a fake transport. Live Discord delivery,
production deployment and visual browser testing have not been performed.

## Newsletter and weekly puzzle backend

Implemented in [CONTENT.md](CONTENT.md): saved React email templates, preview/render
APIs, normalized storage image uploads, staff-triggered Claude drafting, immutable
Go live audience queue, Resend worker, signed delivery webhooks and unsubscribe.
Weekly Sunday 5 PM Toronto puzzles have atomic limited claims and a durable ticket
reward outbox; the ticket agent plugs its issuer into `@certa/server/puzzle-rewards`.
Run `pnpm newsletter:preview` for synthetic files and `pnpm dev:content` for the
worker. Sending defaults off. UI editors, ticket issuer connection, production
migration baseline reconciliation and live vendor activation remain external setup.

Content verification: the current 82-test suite, workspace typechecks, both production
builds and local HTTP authorization fixtures pass. Puzzle customer/staff flows were
also checked in desktop/mobile browser fixtures. See `CONTENT.md` for deployment
and ticket-issuance limitations.

## Awards migration

Admin `/awards` now contains the collectible catalog, 3D/game previews, certificate
copy drafts/publishing and audited issuance history/corrections. Customer `/awards`
reads the same award ledger and private PNGs. See [AWARDS.md](AWARDS.md) for routes,
permissions, the existing content worker command and reviewed historical imports.
No production migration or historical customer-data import has been applied.

Awards verification: 77 tests passed; all workspace type checks and web/admin
production builds passed. Isolated PostgreSQL checks cover shared award evidence,
replay deduplication, render leases, immutable corrections, legacy references and
privacy copies. Built-app HTTP fixtures verify ownership, staff permissions, PNG
previews and iframe headers. Representative PNG designs were visually inspected.
Interactive browser/WebGL and native-device QA remain unverified; the original
large models are preserved and loaded on demand.

## Weekly puzzle interfaces

Staff `/puzzles` now supports draft clues, GIF/image upload, ticket-definition IDs,
claim caps and Sunday scheduling/cancellation through the existing content API.
The homepage puzzle dialog reads live clues and handles verified-user answers and
pending/confirmed rewards with a new foil-ticket design.

The local API currently reports `content_not_configured`; content credentials,
reviewed migration baseline and puzzle publication remain deployment setup. No
legacy puzzle or ticket data was imported. The ticket issuance adapter and actual
scratch/prize reveal remain unconnected; a correct answer is not shown as an
issued ticket until the backend confirms it.

## Staff management

Admin `/staff` lets master administrators browse existing staff, edit feature
permissions, promote a staff member to master, or remove ordinary staff access.
`super_admin` now has full feature access; ordinary staff still need the existing
domain permissions. Desktop navigation uses a sidebar and mobile uses a top-bar
accordion. Master accounts are protected from removal/demotion in this editor.

Requires the server-only `SUPABASE_SECRET_KEY`. The current local environment lacks
that key, so no live account was promoted. The intended master email also needs
confirmation; no email-based authorization bypass was added. See `ENVIRONMENT.md`.
Validation: 84 unit tests, workspace typechecks, both app builds, and real Next
HTTP fixtures pass, including master revocation, denied role updates, protected
masters and content access. No production roles or database migrations changed.

Staff browser verification used synthetic accounts against the real Auth Admin
fixture: saving permissions, revocation, desktop and 390px/320px layouts, and mobile
menu Escape/focus behavior passed. Live role administration remains unverified.
