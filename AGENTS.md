# Certa engineering rules

Read `STRUCTURE.md` before adding or moving files. Read `README.md` for commands
and the current implementation status. These rules apply to this repo only.
Read `CONTRIBUTING.md` for every code/vendor change and `EMAILS.md` for email work.

## Frontend design

- For frontend design, implementation or review, read
  [`.agents/skills/certa-frontend/SKILL.md`](.agents/skills/certa-frontend/SKILL.md)
  and [FRONTEND.md](FRONTEND.md). This applies to web, mobile, staff UI and scene
  integration. Follow the file even when the tool's skill list does not show it.
- `FRONTEND.md` owns the rebuild's visual language. Preserve Certa's illustrated
  mountain world, readable financial UI and consistent typography/state meanings.
  The existing auth shell is a foundation, not the finished design standard.
- Use the skill's plan/critique/render review in proportion to the change. A
  narrow fix stays narrow. User design instructions override aesthetic defaults.
- The parent repo and `certa-website-code 2/` are optional visual references;
  never import their runtime or treat sample financial/compliance data as rules.
  Keep game presentation within `packages/game` and the `AWARDS.md` boundaries.
- Update shared design decisions in `FRONTEND.md` with intentional system changes;
  do not create competing page-specific design guides or token implementations.

## Product direction

- Build a lean Certa product for web, iOS, and Android, plus a separate staff app.
- Supabase is the first integrated vendor. Use the existing Certa project.
- Certa owns email templates/triggers and Resend delivers all emails, including
  customer login codes and password resets. The current phase is foundation/policy;
  do not activate delivery or migrate the full customer 2FA flow implicitly.
- Admin signs in with email/password. Cloudflare Access is the outer deployment gate.
  Do not add another admin MFA flow unless the user requests it.
- Migrate one approved feature or vendor at a time. The old Certa repo is reference
  material, not a directory to copy into this repo.

## Placement and boundaries

- Apps never import another app or the old repository. Shared imports use explicit
  `@certa/*` package exports. No relative paths that escape a workspace.
- Route files compose the screen or handle HTTP. Keep business operations outside routes.
- Begin with a file. Add a folder when multiple related files need an owner.
  Do not create empty feature trees, generic helpers/utils folders, or future-service shells.
- A shared package needs real consumers in at least two workspaces, or an enforced
  runtime/security boundary. Document its purpose in `STRUCTURE.md`.
- Keep platform UI local. Share proven contracts, validation, and operations.
  Extract a business-domain package when shared business rules actually arrive.
- Use narrow package exports. Client code cannot import `@certa/server`, including
  through a shared barrel. Next Server Actions are the deliberate framework exception.
- Keep one implementation of each business rule. No parallel `v2`, `new`, `final`,
  `legacy`, or temporary fallback implementations in the new repo.

## Security from the first change

- One root `.env` only. It is ignored by Git and owner-readable. `.env.example`
  contains placeholders. Never print secret values or copy the old environment wholesale.
- Run apps through `scripts/run.mjs`. Extend its explicit per-app allowlist when a
  vendor is added. Never spread `process.env` into client configuration or export a
  complete environment object through Next config or Expo extra.
- Publishable/anon keys may reach clients. Service-role, secret, database, payment,
  and signing keys stay server-side, and only in a process that needs them.
- Verify identity on the server for every protected operation. Never authorize
  using `getSession()` or editable `user_metadata`.
- Staff checks use fresh, server-confirmed `app_metadata`. Cloudflare identity
  headers alone are not application authorization.
- Cloudflare Access must cover the deployed admin host. Block direct origin bypass
  or validate Access JWTs at the origin. Do not claim this is configured without checking it.
- New exposed database tables need RLS, minimal grants, ownership policies, and
  cross-user denial tests in the same change. Frontend guards do not secure rows.
- Do not apply new-repo migrations to the existing project before reconciling its
  migration baseline. No production resets or automatic seeding.
- Sensitive web sessions use HttpOnly host-only cookies. Native tokens use secure
  storage. No shared caches for private responses, session cookies, or user objects.
- Log operation names and safe error codes, not passwords, tokens, full auth
  payloads, or personal records.
- New emails require a typed/runtime-validated data contract, their own template,
  a synthetic preview, a documented trigger owner, and safe idempotency/retry rules.
  No sends from page renders and no raw Supabase user objects in template context.

## Keep usage and complexity under control

- Public pages must not fetch auth or user data merely to render marketing content.
- Use request-scoped deduplication for server session reads. Native refresh runs
  while the app is active; unsubscribe listeners when their owner unmounts.
- Paginate growing lists; select required columns; index ownership/filter columns.
  Do not add polling, Realtime channels, or exact counts without a product need.
- Use transactions and idempotency for financial/account mutations when migrated.
  Long jobs belong in a worker only when they actually need durable execution.
- Prefer installed dependencies. Add a library only for a concrete requirement.
  Keep React/React Native versions compatible with the installed Expo SDK.
- No task runner, queue, cache vendor, ORM, or additional auth provider by default.
- Remove superseded code, unused exports, abandoned assets, and dependencies in the
  same change. Do not leave cleanup for an unspecified later pass.

## Verification and handoff

- Read the relevant installed Next.js guide before changing Next code:
  `apps/web/node_modules/next/dist/docs/` or the corresponding admin path.
  Next 16 uses `proxy.ts`; verify current APIs rather than assuming old conventions.
- Use Node from `.nvmrc` and pnpm from `packageManager`. Preserve the lockfile.
- Run `pnpm test`, `pnpm typecheck`, and builds for changed apps. Auth/environment
  changes also need negative access and secret-boundary tests.
- Run `pnpm --filter @certa/mobile export` after native dependency/routing changes.
  A JavaScript export is not a simulator/device or signed app-store build.
- Test behavior rather than implementation details. Avoid snapshot churn and tests
  for trivial presentation edits.
- Update `STRUCTURE.md` when ownership changes. Update README verification status
  when a limitation is resolved or a new one appears.
- Report what works, what was tested, and external setup still needed. Do not call
  a vendor production-ready just because its SDK is installed.

Every vendor addition must follow `VENDORS.md`, declare a health endpoint in the typed registry and test failure/credential boundaries. Tradara migration scope is in `TRADARA.md`.

## Tradara changes

Read `TRADARA.md` before any Tradara feature. Its route inventory and budgets are
implementation constraints, not permission to activate all planned features.
Every new operation must declare its data source, trigger, maximum call count,
shared rate budget, authorization, freshness and ambiguous-result behavior.
Do not add per-user Tradara polling, per-app firm collectors, generic vendor proxy
routes, or non-order automatic write retries. Use documented stream filters and
checkpoints; keep financial/lifecycle events durable and user delivery authorized.

Tradara account truth is vendor-owned. Do not implement a Certa pass/force-pass,
local balance edit, embed session mint, or accept-on-behalf route. Apply vendor
account/pass/risk/MLL events through the canonical projection pipeline. Supported
staff mutations go through the durable operation ledger and vendor adapter.

Read `ACCOUNTS.md` before account, purchase, compliance or provisioning changes. All
issuance must use the slot coordinator and verified evidence. A staff grant is not
a synthetic evaluation pass; a closure request is not confirmed vendor closure.

Read `CONTRACTS.md` before KYC, signatures, tax forms, templates or compliance-provider
changes. Veriff and DocuSeal use one request lifecycle. Provider IDs and template
versions are immutable evidence; browser completion is never approval. Verified
provider results feed the existing account compliance coordinator, not a parallel flag.

Read `DISCORD.md` before community identity, roles, messages or presence changes.
No avatar/token synchronization. One-to-one links stay reserved until durable role
cleanup succeeds. Messages consume canonical events, never initiate Tradara reads.
Unknown message delivery requires recovery evidence before retry. Keep public live
feeds anonymous and personal sharing opt-in; permissions belong to fresh Certa identity.

Read `AWARDS.md` before awards, certificates, trinkets or embedded game work. Earned
records come from canonical account/payout evidence. Never grant from animation,
page load, template edits or client PnL. Preserve immutable certificate revisions,
private artifacts, same-origin scene messages and shared Discord award truth.
