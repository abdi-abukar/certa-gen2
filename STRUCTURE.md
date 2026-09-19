# Master structure

This is a standalone pnpm workspace repository, currently located inside the old
Certa working directory. It must remain movable without importing its parent.

The scrolling introduction panorama is owned by
`packages/game/public/firm-landscape.webp`; the web host reuses its built
`/game/firm-landscape.webp` as the scene-loading fallback.

## Current directory map

```text
certa-mono-repo/
  AGENTS.md                  Engineering rules for every future agent/change
  FRONTEND.md                Frontend philosophy, visual roles and rebuild defaults
  .agents/skills/certa-frontend/
    SKILL.md                 Frontend design/implementation/review workflow
    agents/openai.yaml       Skill discovery metadata
    references/              Source map and visual/interaction review criteria
  STRUCTURE.md               This map and placement decisions
  README.md                  Setup, commands, vendor status, verification
  ENVIRONMENT.md             Startup requirements and feature-specific configuration
  CONTRIBUTING.md            Required process for code and vendor changes
  EMAILS.md                  Email contracts, templates, triggers and delivery policy
  .env                       One private local environment; never committed
  .env.example               Allowed settings, with placeholders
  package.json               Workspace commands and common development tooling
  pnpm-workspace.yaml        Apps, packages and active worker workspaces
  pnpm-lock.yaml             One dependency lockfile
  tsconfig.base.json         Shared TypeScript checks

  apps/
    web/                     Next.js public site, trader dashboard, shared HTTP API
      app/                   Routes and route-local UI
        page.tsx             Public introduction composition
        layout.tsx           Web root and shared local DM Sans loader
        site-frame.tsx       Home owns its frame; other routes retain the account shell
        globals.css          Client web browser styling, including hidden scrollbars
        _components/         Introduction, navigation, account guide and scoped styles
          responsive-dialog.tsx  Reusable web modal/mobile sheet, focus/scroll/motion owner
          dialog-scroll.ts      Gesture boundary calculations for sheet scroll containment
          auth-dialog.tsx    App-wide auth dialog provider and progressive link entry points
          fonts/             Self-hosted DM Sans Latin variable font and OFL license
          hero-art.md        Provenance and generation prompt for introduction artwork
        api/me/              Verified bearer-token identity endpoint
        auth/                Email-link callback and error route
        account/             Trader shell, selected-evaluation overview and tools
        login/               Email/password sign-in
        signup/              Customer registration
        forgot-password/     Request reset email
        reset-password/      Choose password with a verified session
      public/brand/          Public crest and introduction still artwork
      proxy.ts               Session refresh + response security policy
      next.config.mjs        Framework/build configuration
      instrumentation.ts    Initialize hosted web runtime from canonical settings
      vercel.json           Web-only Vercel install/build configuration

    admin/                   Next.js staff console behind Cloudflare Access
      app/                   Login, account, recovery, forbidden, auth callback
      proxy.ts               Session refresh + response security policy
      next.config.mjs        Framework/build configuration

    mobile/                  Expo Router app for iOS and Android
      app/                   Navigation and screen composition
      lib/auth.tsx           Session lifecycle owner
      lib/supabase.ts        Native storage wiring and API client instance
      lib/styles.ts          Native auth screen styles; currently mobile-only
      app.json               Native identifiers and Expo configuration
      metro.config.cjs       Expo's standard monorepo bundler configuration

  packages/
    supabase/src/            Public-safe vendor clients and auth contracts
      config.ts              Reject privileged keys in client configuration
      native.ts              Native client factory with injected storage
      secure-storage.ts      Chunked secure session storage adapter
      policy.ts              Shared identity type, validation, staff/redirect rules
    server/src/              Server-only Supabase and auth operations
      environment.mjs        Shared setting validation and explicit process allowlists
      environment.d.mts      Types for the Node-compatible environment module
      startup.ts             Hosted web startup; no root .env or client env exports
      supabase.ts            Request-scoped Next cookie client
      auth.ts                Verified identity and staff guards
      actions.ts             Next auth Server Actions
      proxy.ts               Shared Next session refresh and CSP handling
      api.ts                 Bearer verification and origin policy
      email/                 Resend foundation; template and trigger ownership
        schema.ts            Allowlisted user fields and validated template data
        catalog.ts           Template versions, renderers and synthetic fixtures
        templates/           One independently editable file per email
        layout.ts            Shared Certa branding and email-safe layout
        render.ts            Common transactional composition
        resend.ts            Server-only provider adapter
        triggers.ts          Inactive event definitions and server dispatch
    api-client/src/          Typed mobile HTTP client; enforces the public API boundary
    ui-web/src/              Browser-only auth UI and CSS used by web/admin

  scripts/                   Environment launcher and read-only vendor checks
  tests/                     Cross-workspace auth and environment regression tests
  supabase/                  Migration ownership and database security audit SQL
    migrations/              Reserved for reconciled future migrations
  services/
    tradara/                 Tradara streams, account and payout jobs
    discord/                 Leased community jobs, Discord Gateway and public SSE
    contracts/               Durable KYC/signature provider worker
    api-watch/               Existing service inventory; not yet migrated
```

Every app and package has its own `package.json` and `tsconfig.json`. Those files
are omitted from the expanded map. Generated directories (`node_modules`, `.next`,
`.expo`, `dist`) are ignored, not source.

## Where the next thing goes

| Change | Location | When to add structure |
| --- | --- | --- |
| Landing page | `apps/web/app/page.tsx` and `app/_components/` | Keep introduction UI, its scene host and scoped styles together |
| One route's UI | Beside its route | Use a private `_components` folder only when grouping several files |
| Feature across multiple routes | `apps/<app>/features/<feature>/` | Only when those routes actually share substantial feature code |
| Shared business rules | A new `packages/domain` with narrow exports | When approved rules are used by two apps/server consumers; not beforehand |
| Supabase adapter | `packages/supabase/src/` or `packages/server/src/` | Decide by browser/native safety versus server-only access |
| Other vendor integration | Server adapter first, near the operation using it | A vendor SDK does not automatically deserve an app or package |
| Email or email trigger | `packages/server/src/email/` | Follow `EMAILS.md`; each template has its own file |
| Shared HTTP endpoint | `apps/web/app/api/<resource>/route.ts` | Route validates HTTP; server operation owns authorization and work |
| Staff operation | `apps/admin` with server authorization | Extract shared server behavior only if another app actually needs it |
| Native UI | `apps/mobile` | No DOM components, CSS files, or Next imports |
| Branding assets | The owning app's asset directory | Share actual reused assets/tokens once both consumers exist |
| Database change | `supabase/migrations/<timestamp>_<purpose>.sql` | Reconcile the existing project baseline first |
| Durable/background job | `services/<name>/` | Only for a real independent process, retry/durability need, or existing service |
| Repeatable developer command | `scripts/` | No business logic or ad-hoc production fixes here |

## Dependency direction

```text
web/admin -> server -> supabase
web/admin -> ui-web
mobile    -> supabase + api-client
api-client -> supabase/policy (types only)
```

Apps never depend on apps. `ui-web/auth-panel` has no server imports. Next auth
forms invoke explicitly exported Server Actions through Next's server boundary;
native code cannot import these actions.

There are four shared packages today. The former palette-only package and empty
business-domain abstraction were removed: they had insufficient independent use.
Tradara and contracts are active worker workspaces. `api-watch` remains an
inventory of an existing service and is not a runnable workspace.

## Migration method

Frontend design ownership lives in `FRONTEND.md` and the repo-local
`.agents/skills/certa-frontend/` skill. `AGENTS.md` routes future frontend work there.
The skill's references map the optional parent app and `certa-website-code 2/`
design package; neither is a workspace or runtime dependency. Runtime tokens and
components stay in their existing app/shared-UI owners. These documents establish
rebuild defaults; they do not imply that current screens already implement them.

For each approved page/vendor: identify the user outcome, inspect the old entry
point and its dependencies, retain necessary rules, build one clean path here,
verify it, and remove any scaffold it replaces. Do not copy old folder trees,
unused visual effects, duplicate policies, or production repair scripts.

Backend feature ownership and activation limits are recorded below. Remaining MVP
frontend flows and checkout processors migrate independently; the parent repository
is reference material only.

## Public introduction ownership

`apps/web/app/page.tsx` composes the introduction and loads local DM Sans with
`next/font/local`. `app/_components/intro.tsx` owns navigation, marketing copy and
four readable topic controls; `use-intro-journey.ts` owns the automatic tour,
scroll selection, visibility and same-origin iframe coordination.
`weekly-puzzle-dialog.tsx`, its CSS module and `weekly-puzzle-contract.ts` own
the customer clue/answer dialog, gold foil presentation and validated API reads.
`weekly-puzzle-countdown.tsx` and `weekly-puzzle-schedule.ts` own the local,
DST-aware display countdown; actual puzzle availability stays with the content API.
`village-graphic.tsx` owns the five lightweight SVG landmark illustrations in the stop panels.
`intro.module.css` owns the scoped sky landscape composition. `app/site-frame.tsx`
lets the home route occupy the viewport while retaining the existing account
shell on other routes. No shared component or native design migration is implied.

`app/_components/account-guide.tsx` and its CSS module own the four-chapter public
account guide below the hero. Its labeled design-preview copy is adapted from the
parent `components/certa/core-offering.tsx`, `rules-board.tsx` and `lib/certa.ts`;
it is not the approved plan registry, checkout pricing or eligibility authority.
The guide reuses public game artwork with finite CSS character movement and no
additional game instance, vendor reads or account operations.

`apps/web/public/brand/` owns the crest and public landscape; provenance is in
`app/_components/hero-art.md`. `packages/game/src/initFirm.js` owns the decorative
character, four ledges and connecting trail. It receives presentation commands
from the host and never reads or changes account state. `/game/` is generated
by the existing per-host game build; it remains ignored build output.

## Vendor operations

- `VENDORS.md`: registry, health and credential policy.
- `TRADARA.md`: official-docs audit, complete proposed route inventory, streaming architecture and usage budgets.
- `packages/server/src/vendors/registry.ts`: typed vendor schema and inventory.
- `packages/server/src/vendors/health.ts`: server-only read probes and bounded deduplication.
- `apps/admin/app/vendors/`: staff vendor screen and local styles.
- `apps/admin/app/api/vendors/[vendor]/health/route.ts`: authenticated health contract.

The Tradara plan proposes `services/tradara/` only when implementing the long-lived
collector/gateway, with shared server operations under `packages/server/src/tradara/`.
Both now contain the backend implementation; see `TRADARA.md` for the activation boundary.

## Tradara backend ownership

`packages/server/src/tradara/` owns contracts, the HTTP adapter, canonical event parsing,
operations, store/RPC access and thin HTTP dispatch. `services/tradara/` is a real pnpm
workspace owning persistent sockets and job execution. The web/admin route entrypoints
are `app/api/trading/[...path]/route.ts`; web owns `api/webhooks/tradara/route.ts`.
The additive `ct_*` migration and isolated database tests live under `supabase/migrations/`
and `tests/tradara-db.sql`. No old-repo imports or automatic production migrations.

## Account allocation ownership

`ACCOUNTS.md` owns slot/compliance/admin-workflow policy and route contracts.
`packages/server/src/tradara/allocation-http.ts` validates allocation API requests;
`http.ts` supplies verified identity and permissions. Transactional business rules
live in `supabase/migrations/20260915190000_account_slots.sql`; the existing worker
coordinates changed customers and issues eligible entitlements. No new service or
package is introduced. `tests/account-slots-db.sql` and `tests/account-slots.test.ts`
cover the new behavior; the DB runner also checks concurrent checkout transactions.

## Contracts and KYC ownership

`CONTRACTS.md` owns the provider-extension policy, contracts schema and API inventory.
`packages/server/src/contracts/` contains the Veriff/DocuSeal adapters, sanitized
webhook receiver, standard request APIs, private store and worker operations.
`packages/server/src/request.ts` supplies shared fresh identity, permissions and
Origin/no-store handling for trading and compliance HTTP boundaries.

`services/contracts/` is now a real workspace with one durable leased worker; it
uses the shared launcher with its own environment allowlist. The application routes
are `apps/{web,admin}/app/api/compliance/[...path]/route.ts`; provider webhook entrypoints
live only in web under `api/webhooks/{veriff,docuseal}`. Database ownership is
`20260915220000_contracts.sql`; tests are `contracts.test.ts`, `contracts-db.sql` and
the shared HTTP smoke suite. No signing UI or separate client provider SDK was added.

## Payout backend ownership

`PAYOUTS.md` owns the payout policy, API contract, recovery and activation steps.
`packages/server/src/payouts/` contains the shared server operations behind web/admin
`app/api/payouts/[...path]/route.ts`. The additive `cp_*` migration owns earnings,
calendar sessions, payout decisions/checkpoints and audit history. Existing
`services/tradara/` executes payout jobs and checks sessions once per minute.
`tests/payouts.test.ts`, `tests/payouts-db.sql` and the HTTP fixture cover the boundary.
No imports from the old repository and no new worker deployment are introduced.

## Discord ownership

`DISCORD.md` defines link uniqueness, event delivery, managed roles, permissions and
activation. `packages/server/src/discord/` owns the adapter, HTTP APIs, signed commands,
verified result rendering and job execution. `services/discord/` owns the persistent
Gateway/SSE process. Web `app/community/` owns customer settings and the live feed;
admin `app/discord/` owns staff link/recovery/configuration UI. The shared HTTP routes
are `api/community/[...path]`; web also owns `api/community/stream` and signed
`api/discord/interactions`. Database tables/RPCs are the additive `cd_*` namespace.
No avatar feature, old-repo support bridge or new dependency vendor was introduced.

## Newsletter and weekly puzzle ownership

`CONTENT.md` documents content API contracts, weekly schedule, delivery evidence and
the ticket-agent handoff. `packages/server/src/content/` owns shared web/admin APIs,
Claude drafting, image normalization, puzzle claims, reward outbox and newsletter
delivery. `email/templates/newsletter.tsx` owns the saved React layouts;
`content/render.tsx` serializes the same preview/published HTML.
`services/content/` is a durable marketing-delivery worker; it reuses `email/resend.ts`.
Web owns the signature-verified newsletter webhook. New tables/RPCs use `cn_*`;
existing `newsletter_subscribers` remains the single subscriber audience.
`tests/content.test.ts`, `tests/content-db.sql`, and the HTTP smoke suite verify it.
Admin `app/puzzles/` owns the staff draft/editor, animated clue preview, ticket-ID
link and release controls. Image normalization remains in the shared server
content owner; animated GIFs are re-encoded to bounded WebP.
The ticket owner supplies exact prize inventory and the idempotent issuer. New
puzzle rewards allocate atomically; the `puzzle-rewards` export recovers historical
pending rewards with isolated retries. See `TICKETS.md`.

## Awards and scenes

- `packages/server/src/awards/` owns the shared issuance/render API, contracts and
  worker. `packages/server/assets/awards/` holds original plates and local fonts.
- `packages/game/` is a browser-only scene package consumed by both web and admin.
  It builds same-origin, credential-free assets into each host's ignored public/game.
  It is not a trading application or a source of financial/account truth.
- `apps/admin/app/awards/` owns staff editing/previews/history; `apps/web/app/awards/`
  owns the customer cabinet/journey. Both compose `/api/awards/[...path]`.
- `services/content/` executes durable render jobs with independent failure handling
  alongside newsletter jobs. `scripts/import-awards.mts` reconciles legacy aliases.
- `AWARDS.md` defines the catalog, source events, versioning, routes and activation.

## Staff access and navigation

Admin `app/auth-form.tsx` and `auth-form.module.css` own staff login/recovery/reset
controls. Auth-page styling belongs to `admin-shell.module.css`; `app/fonts/`
contains the local DM Sans font and its OFL license, matching client typography
without importing another app's runtime.

`apps/admin/app/admin-shell.tsx` and its CSS module own the desktop sidebar and
mobile navigation accordion. `app/staff/` owns the staff directory and permission
editor; `app/api/staff/route.ts` delegates to the server-only `staff.ts` operation.
`packages/supabase/src/staff-policy.ts` owns the public-safe permission catalog and
master-role predicate, used by both admin UI and server authorization. There is
no browser Auth Admin client or new staff table.

Admin `app/traders/` owns customer search, pagination and the private-window
sign-in link UI; `app/api/traders/route.ts` delegates to server-only `traders.ts`.
`packages/server/src/support-access.ts` owns support permissions, target checks,
encrypted grants and session proofs. `support-http.ts` owns the web-only redemption
boundary, composed by `web/app/api/auth/support/route.ts` and `app/auth/support/`.
Existing auth/second-factor guards validate the proof and fresh staff permission;
the customer shell owns its visible support banner and local sign-out. No new
workspace or database table is introduced. See `AUTHENTICATION.md` for limits,
credential handling and the separate support authorization path.

The public village character’s tap-triggered decorative hop is sampled by
`packages/game/src/firm-jumps.js`; `initFirm.js` owns their lifecycle, pause and
reduced-motion behavior. These animations have no account or award authority.

## September 17 backend migration owners

- `packages/server/src/commerce/`: authenticated persistent checkout, original
  processor adapters, provider callbacks, payment recovery and canonical settlement.
  Web `/checkout`, admin `/commerce`, API `/api/commerce/[...path]`, and web-only
  `/api/internal/payment-worker` compose this owner.
- `packages/server/src/tickets/`: exact staff-selected finite prize inventory,
  shared/individual codes, claims, scratch reveal, redemption and puzzle issuer.
  Web and admin each have `/tickets` and protected ticket APIs.
- `packages/server/src/email/`: original transactional catalog, editable versioned
  copy, AI drafting, preview and durable delivery. Admin `/emails` owns editing;
  the existing content service processes its outbox. Auth code bodies stay ephemeral.
- `packages/server/src/signup/`: guest signup rules (username, accepted countries),
  pre-account mailbox proof and confirmed account creation with a verified first
  session. Web `/api/auth/signup/[...path]`, the auth dialog and `/signup`, `/login`,
  `/forgot-password` route fallbacks compose it; the admin app never registers customers.
- `packages/server/src/second-factor.ts` and `second-factor-http.ts`: customer
  verification admission, email challenge lifecycle and Supabase TOTP operations.
  Shared auth/API guards enforce this boundary; `/verify` and `/account/security`
  provide web flows, and native account sign-in completes existing factors.
- `services/content/src/main.ts`: existing content and awards work plus bounded
  puzzle ticket delivery, transactional delivery and expired-auth-data cleanup.

Each migration has a unique version. New `cm_*`, `tk_*`, `ce_*`, `cf_*` and `cu_*` domain
storage is service-only; existing `cc_*` remains the compliance owner. All apps
continue to import narrow `@certa/server` exports, never the parent repository.

## Trader dashboard

`apps/web/app/account/session-recorder.tsx` owns local screen-recording controls in
the identity-keyed customer shell. Its context lets the opened dashboard report a
resolved account; only then is the idle recording prompt available. Active capture
and retained footage remain controllable during account-route navigation.
`session-recording.ts` owns browser capture,
VP8 encoding and WebM export; `recording-buffer.ts` owns bounded, key-frame-aligned
retention. Capture persists between account routes, stops on shell teardown, and
never sends footage to an API. The muxer is loaded only after a user chooses a source.

`apps/web/app/account/customer-shell.tsx` owns the protected cream navigation,
responsive drawer and customer profile. `dashboard.tsx` composes selected account
states; `dashboard-model.ts` derives presentation from confirmed projections.
`accounts.tsx` and `accounts.module.css` own the `/account` three-slot card grid and
previous-account list. `account-slot-stack.tsx` and its CSS module own the responsive
grid/mobile swipe stack, adapted from GodUI Card Swap's rank-based springs using
the workspace's existing Framer Motion version. One card tree serves both layouts;
inactive mobile cards are inert, keyboard/screen-reader selection remains available,
and reduced motion disables the spring and pointer tilt. Swipes make no API reads.
`dashboard-model.ts` derives displayed occupied, available
and checking cards from the confirmed allocation, preserving pending purchases and
over-capacity accounts. An explicit account/slot query opens the existing detailed
dashboard; previous accounts link to their historical view. The grid makes one
owner-scoped dashboard read per load, manual refresh or pagination request, without
live subscriptions or per-account summary reads. Navigation places Purchase account
directly below Accounts and opens the standalone `/checkout` page.
`account/trading-launch.tsx` owns the customer sidebar's bounded availability read
and branded “Trade on Tradara” action, which links to checkout without an active
account. The T vector is adapted from the parent
`components/certa/tradara-mark.tsx` without a runtime import; its green matches
the existing `public/t_logo.svg`. The shared shell accepts an optional action slot
for desktop/mobile and pairs it with an icon-only sign-out button. It also owns
the edge collapse control and banknote navigation icon.
The first empty card is adapted from the user-supplied `certa_first_segment`
reference; its original illustration remains at `apps/web/public/account/first-visit-art.png`.
The other empty cards share `new-slot-art.png` from `certa_account_blocks_html`;
funded, preparing, invitation and delayed illustrations live in the same public
account asset directory. The evaluation card reuses the first-visit illustration
because the reference's cropped evaluation image includes a sample dollar value.
Only markup/styles and selected artwork migrate; sample financial metrics and
global reference CSS do not enter the app. No extra provider or per-account reads.
`use-account-dashboard.ts` owns bounded initial/refresh reads, selected account
requests and live invalidation. `trading-activity.tsx` owns the selected session and
paginated trades. `history/` includes direct reads for accounts beyond the first
archive page. `evaluations/` shows the commerce catalog and links into the existing
checkout owner. `account-tools.tsx` serves compliance, terminal setup, rules and
support; detailed compliance remains off the overview.

`packages/server/src/tradara/dashboard.ts` owns read-only dashboard and calendar
composition behind the existing authenticated trading HTTP boundary. It uses
Certa projections and allocation evidence with no Tradara provider calls.
`packages/game/src/initDashboard.js` owns the lazy dashboard Kaplay mode;
`dashboard-motion.js` bounds presentation movement. `account/journey.tsx` embeds
same-origin output and stores the last observed scene progress per user/account.
Result acknowledgements are presentation preferences in browser storage, keyed by
canonical transition IDs. They do not change account lifecycle or reserve slots.

Checkout experience ownership: `apps/web/app/checkout/model.ts` holds local UI
contracts/API errors; `secure-payment.tsx` owns browser tokenization and teardown;
`checkout.tsx` composes review, payment, saved order history and per-purchase issuance.
`account/creator-code.tsx` saves the buyer preference through the commerce owner.
`cm_creator_preferences`, quote/configuration RPCs and creator discount rates belong
to `20260917060000_checkout_experience.sql`; fulfillment stays in the existing slot
coordinator and Tradara worker. `tests/checkout-experience-db.sql` covers discounts,
immutable attribution, owner isolation and duplicate/free issuance.

### Shared account navigation and profile

`packages/ui-web/src/site-footer.tsx` and its CSS module own the shared illustrated
footer for web and admin. The supplied `certa_footer_html (1)` landscape and logo
are optimized into each app's `public/brand/certa-footer-*.webp`. The component
keeps the MVP's social, support, public information and legal destinations; pages
not migrated here link to the existing `certafutures.com` site. Customer routes
use the local origin, or the configured customer origin from admin. No legacy
runtime is imported. Web `_components/site-footer.tsx` supplies the newsletter
form through the existing content subscription endpoint. It requires unchecked
explicit consent and an email matching the authenticated, verified customer;
anonymous submission offers sign-in. The footer performs no mount-time identity
reads. Admin links to the customer form instead of posting with staff credentials.
`SiteFrame` owns the full-width footer, while customer/admin adapters supply the
shared shell's footer slot so it follows the content and the sidebar's width.

`packages/ui-web/src/account-shell.tsx` owns the client/staff sidebar, responsive
navigation drawer, collapse preference and sign-out presentation. App adapters
supply their route lists, pathname, Link component and server action; shared UI
has no Next/server imports. `page-masthead.tsx` and its CSS module own the shared
top-right decorative header, rendered once by the sidebar shell and directly by
the standalone checkout. Its optional content slot aligns the customer welcome
beside the illustration with a divider below. Web `_components/customer-masthead.tsx`
owns the first-name/handle greeting and saved-character account entry for the
customer shell and checkout, using the verified identity already supplied by their
routes. The Accounts index moves its heading into this banner. The shared account
menu's portrait variant reuses its existing character renderer and settings dialog;
the shell can omit its desktop profile entry while preserving mobile drawer access
and sign-out. Both apps serve the supplied `certa_masthead_component`
PNG from `public/brand/certa-masthead-brand.png`; its handwritten text is part of
the image, with no font, request or animation dependency. The source reference's
800px artwork-hiding breakpoint is preserved; meaningful welcome content stays
visible. `account-menu.tsx` owns the pixel-character entry and
personal account dialog. `responsive-dialog.tsx` and its scroll helper are shared
by account settings and the web auth/puzzle dialogs. Game character drawing stays
in `@certa/game/character-look`; both apps serve the existing game sprite asset.

`packages/server/src/account-profile.ts` serves each app's `/api/account/profile`.
It reads the actor's production username and identity/sanctions status and updates
only the actor's avatar colours in Auth user metadata. It never accepts a target
user, returns private compliance documents, or grants staff/compliance permissions.
