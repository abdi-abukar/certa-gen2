# Certa monorepo

Standalone Certa workspace for web, mobile and staff. Shared backends cover
customer authentication with email/TOTP verification, Tradara/accounts, compliance,
payouts/affiliates, Discord, content, awards, authenticated checkout, fixed-inventory
scratch tickets and editable transactional emails.

The September 17 migration adapts the functional parent application's checkout,
Authorize.net/NMI/NOWPayments processors, ticket rules and 25 email templates.
Customer purchases require authentication and second-factor completion, with one
active durable checkout per customer. Admin tools live at `/commerce`, `/tickets`
and `/emails`; the trader dashboard is at `/account`, with evaluation pricing at
`/account/evaluations` and existing checkout, tickets and security tools.
See [AUTHENTICATION.md](AUTHENTICATION.md), [EMAILS.md](EMAILS.md) and the feature
implementation guides for setup and deliberate differences from the original.

New migrations, provider credentials, purchase terms and worker deployment require
reviewed activation. Transactional templates are initially inactive and sending
remains disabled by default. No live payment, email, production migration or
hosted provider configuration is performed by local verification. The original
instant-upgrade force-pass behavior is deliberately excluded: Tradara owns passes.

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
landmark for 3 seconds facing it. Tap the character while walking or stopped for
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
hero. The account guide shows evaluation essentials up front, with a left section
menu on desktop and a swipeable top tab bar with arrows on mobile. Signup and
login use existing routes. The scene retains exact-origin/frame
message checks, reduced motion, hidden/offscreen pause and a static panorama
fallback. There is no visible playback strip or hero CTA group.

The earlier introduction passed regression tests, type checks and production
builds. The current village and expanded feature-panel layout have not had a
rendered browser review in this session because browser tooling is unavailable.
Native screens and physical-device behavior are outside this change. See
[art provenance](apps/web/app/_components/hero-art.md) and [AWARDS.md](AWARDS.md).

## Shared footer

Web and admin pages now end with the supplied mountain/campfire footer, including
account tools, authentication pages and standalone checkout. The shared component
uses DM Sans, responsive columns and the original artwork (optimized to WebP),
with the MVP's social, support and legal links. Unmigrated information pages point
to the existing `certafutures.com` site; customer actions stay on the current web
origin. The footer follows the collapsed sidebar and fills the width on phones.

The web newsletter form uses the existing verified-account subscription flow:
explicit unchecked consent, an email matching the signed-in identity, pending,
error and confirmed states, and a sign-in entry for guests. Admin links to the
customer form. There are no identity reads or subscription writes on footer mount.
Validation passed: 164 tests, workspace types, web/admin builds, HTTP access and
newsletter consent/ownership/suppression checks. Synthetic Chrome checks covered
public/auth/account/checkout/admin placement, 1440–320px widths, sidebar collapse,
200% reflow, links, artwork and all subscription UI states. No live email was sent.

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
Customer login completes password and email/TOTP verification in the same dialog.
Expired sessions return to that full sign-in flow; `/verify` only redirects.
Both homepage Dashboard links require completed verification; signup takes legal name, a public @, country,
email/password and a mailbox code before the account exists; see `AUTHENTICATION.md`. Custom delivery
remains disabled until configured, and no live Auth settings were changed.

## Trader dashboard

`/account` opens the Accounts list, with current and previous accounts styled as
compact game-save entries. Each shows its status, name and vendor-reported start
date/age where available. Empty accounts get an illustrated purchase prompt;
pending payment and account setup have separate states. **Purchase account** is
the next navigation item and opens `/checkout`. Selecting an account opens its
existing detailed dashboard, while completed accounts retain their history route.
Verified with 156 tests, workspace type checks and web/admin production builds.
Synthetic browser checks cover desktop (1440px), mobile (390px/320px), current and
previous accounts, empty/returning states, payment/setup, pagination, navigation
and error recovery. These checks do not provision accounts or make payments.

`/account` now combines a cream financial dashboard with the existing Kaplay game
engine. Select an evaluation or reserved slot to see its own balance, objectives,
setup requirement or confirmed result. A pending account does not replace another
account's active view. Account pricing is available beside the tabs and in the
sidebar, using the commerce catalog. Mobile keeps objectives and the selected
day's trades visible; the sidebar becomes a keyboard-accessible drawer.

The calendar reads canonical trading sessions. Selecting a day changes the trade
ledger, with bounded pagination and refresh recovery. History remains available
after pass/failure acknowledgement. Compliance has one generic overview action;
its detailed page and trading setup use their existing authenticated operations.
Financial data and outcomes are server-owned. Animation checkpoints and result
acknowledgements are local browser preferences, not cross-device account state.

This implementation does not activate providers or import production history.
It depends on the configured account, commerce, awards and worker projections;
missing data is shown explicitly. High-volume trade indexes and mixed-format
historical timestamp normalization need review before rollout (see `TRADARA.md`).
Native Expo screens and real mobile GPU/Safari behavior remain outside this web
implementation. See `DASHBOARD-PLAN.md` for the remaining feature roadmap.

Dashboard verification: 140 regression tests, all workspace type checks, web/admin
production builds and the isolated HTTP authentication/access suite pass. Browser
review uses synthetic account/catalog fixtures with real built pages and WebGL;
Desktop 1440px and mobile 390px/320px checks cover account-state isolation,
calendar day selection, result dismissal/focus, sidebar navigation and catalog-to-
checkout selection. They do not verify production vendor data or perform purchases.

## Checkout experience

Overview now saves a creator code for future evaluations. The cream checkout
supports server-priced creator/coupon/ticket discounts, billing and agreement
consent, NMI/Authorize.net card tokenization, NOWPayments invoices, free orders,
saved checkout history and per-purchase account issuance. The server chooses the
card processor; only an explicit retry after a confirmed decline can try another.
Payment confirmation never implies the evaluation has already been issued.

Checkout includes compact recording/refund disclosures and an expandable $1,500
end-of-day MLL explanation before Continue. The connected database still needs
the checkout-experience migration, products, approved plans and enabled processor
routing; see [the checkout activation diagnosis](COMMERCE.md#required-environment-and-activation-checklist).
This disclosure/error update passes 155 tests, workspace type checks, the web
production build and disposable database/concurrency tests. An isolated browser
preview verified 1440px, 390px and 320px layouts, keyboard expansion, retained form
values and missing-schema recovery using synthetic responses, without payments.

Verification: 145 tests, workspace type checks, web/admin builds, isolated HTTP
authorization checks and the full disposable PostgreSQL/concurrency fixture pass.
Browser review covers 1440px desktop, 390px/320px mobile, 200% equivalent reflow,
creator persistence, better-discount retention, both mocked card tokenizers,
declines, pending Crypto, free purchases, reload and mixed issuance states.
Processor responses are fixtures; merchant sandbox, physical-device and production
payment/issuance verification remain external. No real charges or new live
migration were performed. See [COMMERCE.md](COMMERCE.md#required-environment-and-activation-checklist)
for the required environment, new migration and worker/processor activation.

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
inventory placeholder. Checkout, payment processors, coupons and fixed-inventory
tickets are now adapted into shared owners; read `COMMERCE.md`, `TICKETS.md`,
`EMAILS.md` and `AUTHENTICATION.md`. Apply the reviewed migrations and configure
providers/workers before activation. Starting browser apps alone does not activate
background payment recovery or email delivery.

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
reward ledger; the ticket migration now issues from exact inventory atomically and
`@certa/server/puzzle-rewards` recovers historical pending grants idempotently.
Run `pnpm newsletter:preview` for synthetic files and `pnpm dev:content` for the
worker. Sending defaults off. The UI editors and ticket issuer are connected in
code; production migration baseline reconciliation and live vendor activation
remain external setup.

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

Admin `/staff` uses the production staff lookup and honors existing production
page grants alongside newer domain permissions. Staff managers can edit existing
accounts in their original permission format; saves affect production. Only masters
can promote to master, and self/master accounts are protected in this editor.
The server-only `SUPABASE_SECRET_KEY` and deployed `work_staff_lookup` RPC are
required. See `ENVIRONMENT.md` for permission compatibility and revision limits.
No production account is automatically promoted and no email grants access.

Staff browser verification used synthetic accounts against the real Auth Admin
fixture: saving permissions, revocation, desktop and 390px/320px layouts, and mobile
menu Escape/focus behavior passed. Live role administration remains unverified.

Staff login, recovery and reset pages now use cream surfaces, local DM Sans and
dialog-style inputs with a password visibility control. Verification passed for
152 tests, workspace typechecks, the admin build and HTTP auth fixtures. Browser
checks covered desktop/390px/320px layouts, invalid-password feedback, recovery
navigation and successful sign-in using synthetic staff credentials.

Admin `/traders` now supports paginated customer search and **Log in as user**.
The action copies a five-minute, single-use link to paste into an Incognito/private
window, where it opens a 30-minute customer support session. Browsers require the
operator to open the private window manually. Existing customer cookies are never
replaced, the admin stays signed in, and the customer shell identifies support
access with an end-session action. Password and authenticator changes are blocked.
Master admins, compatible legacy Users grants, or explicit `support:read` and
`support:login` permissions authorize this flow. See `AUTHENTICATION.md` for the
fresh permission checks, session binding and logging boundaries. No new migration
or environment key is required and no production role was changed.

Support access verification: 159 tests, workspace typechecks, both application
builds and the real Next HTTP fixture suite passed. Synthetic Chromium checks
cover search, copy, keyboard focus, 1440/390/320px layouts, private-context login,
security restrictions, local logout, preserved admin login and single-use replay
rejection. Real customer impersonation has not been performed.

## Local session recording

Opening an account places Start recording below its overview and trading activity.
The account list, no-account welcome and unissued slots do not offer recording;
an already-started capture keeps its controls when navigating within the account area.
Buy account and its expandable creator-code control sit at
the top beside Overview, keeping the balance and game journey in focus. The browser asks the user
to select a tab, window or screen; the dashboard shows elapsed time and retains
up to ten minutes of video locally. Save clip exports the available last 1, 5 or
10 minutes as a WebM, with a download link and preview. Saving continues capture;
Stop releases capture and keeps the buffer available until Clear recording.

Desktop Chrome/Edge with WebCodecs and Window track processing is the initial
target. This version is video-only. Keep the dashboard tab open: navigating
between `/account` pages preserves capture, but leaving the account area, signing
out, refreshing or closing the tab releases it and clears undownloaded footage.
Retention starts on key frames and is capped at 128 MiB, so clips may be slightly
shorter than the selected duration. Browser or OS suspension can interrupt capture.
No recordings are uploaded, stored in the database or sent to Tradara.

Overview layout verification: synthetic browser checks passed at 1440, 900, 700,
390 and 320px, including creator-code add/error/remove, long codes, full-slot and
resumed-checkout states, enlarged layout, and recording persistence across routes.
The 155 tests, workspace typechecks and web production build also passed.

Verification: 152 tests, workspace typechecks, web/admin builds and the real Next
HTTP fixture suite passed. Chromium checks covered real VP8 encoding, WebM
playback, permission cancellation, account-route persistence, stop/save, external
capture termination, teardown and 1440/390/320px layouts. A timestamped 12-minute
synthetic session produced 600-second and 60-second clips that fully decoded in
FFmpeg. The authenticated built dashboard also passed local preview playback under
its CSP. Native OS source selection and a real Tradara session remain manual checks;
automated capture used synthetic video and synthetic authenticated accounts.

### Shared client and staff account menu

Both workspaces now use the same cream sidebar and responsive navigation drawer.
Their pixel-character account entry opens a common profile dialog with the saved
avatar, production username, identity/sanctions status and character colour editing.
Compliance, Discord, security and support continue through their existing customer
routes; staff links use the configured client origin and its own sign-in session.
This does not add staff MFA, migrate signing flows or change compliance decisions.
The profile endpoint reads the actor’s username and compliance status, plus one
latest owned trading account and its latest statistics snapshot per opened dialog;
colour saves read and update only the authenticated actor's Auth user metadata.
Unavailable records produce an error, never a fabricated approved status.

Validation for shared navigation/profile: 155 tests, workspace types, both builds,
HTTP ownership/mutation checks and Chromium at 1440/390/320px passed. Browser checks
covered collapse persistence, character saves/reloads, mobile drawer and nested
profile Escape/focus restoration. Production table/column availability was checked
read-only; all test mutations used the local synthetic Auth fixture.

The account dialog now opens on a welcome overview with a compact tab sidebar.
Session details, compliance, character, security, Discord and support have separate
panels. Desktop keeps navigation left/content right; mobile uses a bottom sheet
with horizontally scrollable tabs. P&L is the latest recorded total for one named,
owned account, with its snapshot timestamp—not a live/session total or a portfolio
sum. Missing or invalid statistics display an unavailable state rather than zero.

The account landing page uses the supplied three-card layout on desktop and a
swipeable perspective stack on phones. Swipe left/right to cycle the slots; small
dots show the position, with no arrow buttons or autoplay. Reduced motion makes
swaps instant. Keyboard arrows and an accessible native slot picker provide
alternatives to swiping, and only the front card's actions are focusable on phones.
With no accounts,
the first slot has the journey welcome and purchase/rules controls; the other two
use identical plus-sign artwork. Issued and reserved accounts replace those cards
using confirmed status and allocation. Unknown capacity has a checking state,
previous evaluations stay below, and financial details remain inside Open account.
The header omits a duplicate purchase action and recording stays inside an opened
account. No reference balances, returns or payout-day examples are shown as real data.
The artwork lives in `apps/web/public/account/`; scoped markup/styles and slot
presentation remain beside the account list, with no extra API or vendor reads.
The earlier root `certa_first_segment` source was removed after rendered review.
Validation: 164 tests, workspace typechecks and the web build passed. Synthetic
Chrome checks cover 1440/900/760/390/320px, zero through three accounts, setup and
capacity updates, touch swipes in both directions, wraparound, native vertical
scroll, purchase taps, swipe-on-link suppression, keyboard selection, reduced
motion, live resizing and 200% reflow. Earlier card checks covered invitations,
history and load errors. No extra dashboard reads occur when cycling slots.
Physical-phone and Safari behavior have not been verified.

The customer sidebar places Trophy Cabinet after Affiliates and uses a banknote
icon for Trader Payouts. An icon-only midpoint control collapses the desktop rail.
The “Trade on Tradara” action uses the original mark and green: active accounts
open `https://terminal.tradara.com`; no active accounts lead to checkout. A compact
sign-out icon sits beside it in the sidebar and mobile drawer; the collapsed rail
stacks the two icons. Trading Terminal and Merch Store are removed from customer
navigation.
An unavailable lookup leads to Accounts. The authenticated launch check reads only
one owned active account from the local database, without vendor calls.
Validation: 164 tests, workspace typechecks and web/admin builds passed. Synthetic
browser checks covered navigation order, collapse keyboard/persistence, desktop
and 390/320px mobile layouts, loading/live/empty/error launch states, checkout
navigation, and the inline sign-out button ending synthetic sessions on desktop
and mobile. The staff footer retains its profile and labelled sign-out control.
No real payment or terminal actions were performed.
The launch hook keeps its request key internal. A React development-mode check
reproduced the former JSX key-spread warning and verified its removal across live,
empty and unavailable states, focus refreshes and user/navigation changes.

The supplied “Trade together. Go further.” masthead appears on every customer/staff
sidebar page and standalone checkout. Customer pages align it with the saved
character and a personalized welcome, with a divider beneath. On Accounts, this
replaces the separate heading below the artwork. The portrait opens the existing
account dialog and replaces the desktop sidebar's profile entry; the mobile drawer
retains its profile entry. The greeting uses the verified identity already loaded
by the route, with a handle or generic welcome when a name is absent.
The original artwork lives in each app's `public/brand/`, with one shared component
in `@certa/ui-web/page-masthead`. At 800px and below only the decorative artwork
disappears; the welcome and character remain. There are no new API reads or fonts.
Validation: 164 tests, workspace typechecks and web/admin builds passed. Synthetic
Chrome checks covered the inline banner at 1440/1024/900/801/800/390/320px, saved
character updates and reloads, keyboard dialog access and focus restoration,
mobile drawer access, sidebar collapse, checkout/account tools, long/missing names
and 200% zoom. Earlier checks covered nine customer/checkout routes and ten staff
routes, checkout loading errors and back navigation. No payment was submitted.
