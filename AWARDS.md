# Awards, certificates and embedded scenes

## Owners

- `packages/server/src/awards/`: authenticated APIs, catalog/design contracts, pure
  canvas rendering, durable jobs, read-only game progress.
- `packages/server/assets/awards/`: private original plates and local fonts. No
  executable legacy HTML editors or network font fetches. Winning-card rasterizer
  is extracted into `winning.js`; other coordinates/material effects are in `layouts.ts`.
- `packages/game/`: presentation-only Kaplay/React/Three scenes, models, characters,
  original material treatments and fonts. Built independently into each host's
  ignored `public/game/`; no trading app, credentials, database or vendor client.
- Admin `/awards`: catalog, 3D previews, template drafts/publishing, issued records,
  audited corrections/retries, verified cohort coins, game previews.
- Web `/awards`: owned cabinet, private certificate downloads and account journey.
- Existing `services/content` process: awards rendering alongside its newsletter
  worker, with separate failure handling. `pnpm dev:content` starts both.

## Catalog and evidence

Four earned collectibles: Summit Trophy (`trophy`), Bronze Ascent (`bronze`), Gold
Continuity Crown (`crown`), Beta Tester Coin (`ribbon`, legacy key retained).
Five additional display designs: bronze/silver/gold ribbon medals, Champion's Cup,
and Certa Crown. They are previewable but have no automatic earning rules.

`ca_issues` is the sole issuance ledger. `pass:<account UUID>` follows a confirmed
Tradara evaluation passed/upgraded projection. `payout:<payout UUID>` follows a paid
trader payout; first payout **per account** receives Bronze, subsequent ones Crown.
The account row lock serializes cycle allocation. Paid arrival order governs new
live grants; verified history is seeded in paid-time order. Replayed events do not
create new grants, certificates or messages. Browser animations never grant anything.

`beta:<user UUID>` is once per trader. Preserve verified prior cohort evidence;
new grants need a staff reason and explicit permission. There is no invented cohort
cutoff or automatic coin for every future purchaser. Descriptions do not control
eligibility. Staff account grants are not synthetic evaluation passes.

The former Discord `cd_awards` table becomes a read-only compatibility view over
this ledger. Discord roles consume these same awards. Existing pass/payout message
outboxes still consume their canonical events and retain their dedupe keys, opt-ins
and privacy. No historical public announcement replay. Existing Discord posts remain
embeds; certificate PNGs are private and are not automatically attached to messages.

## Designs and rendering

Six template IDs: `passed`, `payout-express`, `payout-funded`, `win`, `loss`, `ticket`.
Win/loss support closed trade, day, month (also existing weekly snapshot) share cards.
The original pass plate is specifically a **50K evaluation** design; adding another
account size requires its own design and issuance mapping before selling that plan.
Ticket artwork is available for preview; this change does not distribute tickets.

`ca_templates` stores immutable draft versions, which can be published after preview.
Staff edit allowlisted text labels; amounts, dates, recipient and numbers cannot be
injected through template copy. Layout/art changes belong to individual design files
and require a new published template version plus representative render review.
Text baked into original plates (including parts of the 50K certificate) needs a
new plate to redesign; it is not presented as editable text in the console.

`ca_issues` freezes evidence, template version and a permanent UUID-based certificate
number. `ca_renders` freezes each render revision. Corrections preserve every prior
artifact and are audited; only the public recipient and newly published copy version
can be changed through the correction API. Monetary changes require corrected source
evidence, not a certificate editor. Default recipient is `CERTA TRADER`; staff can
set a verified public handle. No legal name or KYC documents enter share artwork.

PNG rendering uses local `@napi-rs/canvas`, no hosted screenshot service. Fonts,
background plates and the original winning-card pixel rasterizer are reused.
A queued render stores one PNG in the private `certa-awards` bucket. Downloads verify
current owner/staff access and use no-store. Never expose the storage path publicly.
An upload may leave an orphan after a crashed worker; a stale worker cannot replace
an accepted artifact. Reclaim leases after three minutes, at most three interrupted
attempts; explicit failures need a reasoned admin retry. No blind Discord send retry.

## API contract

Shared base `/api/awards`. Web accepts current verified cookies or bearer tokens;
admin requires fresh staff identity plus `app_metadata.awards_permissions`.

| Route | Operation |
| --- | --- |
| GET `catalog` | Catalog and descriptions |
| GET `issues?offset=0` | Own records; staff may filter `user_id` |
| GET `issues/:id` | Owned record and up to 50 latest render revisions |
| GET `renders/:id` | Authorized PNG download |
| GET `accounts`, `accounts/:id/game` | Owned account list / vendor-state presentation |
| GET/POST `look` | Own allowlisted character appearance |
| POST `issues/:id/share` | Immutable sharing copy with recipient/amount masking |
| POST `share` | Queue verified account/closed-period artwork; no client PnL |
| GET `templates`, `audit` | Staff template versions / audit pages |
| POST `preview` | Staff synthetic PNG preview, no issuance |
| POST `catalog/:id` | Optimistic revision update of descriptions/order |
| POST `draft/:id`, `publish/:id` | New template version / publication |
| POST `retry/:renderId` | Failed render recovery |
| POST `correct/:issueId` | Append corrected render revision |
| POST `cohort` | Audited once-only beta coin |

Staff permissions: `awards:read`, `awards:write`, `awards:publish`, `awards:issue`, or
`awards:*`. Publishing/issuance also needs read/write. Cookie POST requires the correct
Origin. Pagination is 50 rows; financial source tables are not client-writable.
Preview/share requests have a database-enforced 10/minute/user budget. Private
responses are no-store. No secrets, arbitrary HTML, URLs or file paths in editable copy.

## Game protocol and usage

Scenes: adventure (default), hero, climb, firm, signup; preserved cabinet/customize;
trinket is the admin 3D viewer. They lazy-load by mode. Same-origin iframe messages
must come from the parent window. Outgoing messages target that exact origin. The
parent must verify both origin and frame identity; never treat `pass-complete`,
`payout-dialog-requested` or a look-save as financial authorization.

The protected web account journey reads canonical account/eligibility snapshots. Evaluation display
progress caps below the summit until Tradara confirms a pass. Compliance pending and
funded-issued remain distinct. Payout eligibility reuses `cp_eligibility`, including
its freshness/compliance checks. No extra Tradara calls or background browser polling.
Read on initial selection or explicit refresh; future dashboard live events can
invalidate these same read models. Native can consume bearer APIs; native WebView
embedding is not enabled or device-tested by this migration.

Game scenes and 3D meshes remain client-rendered. Certificate artifacts are server-
rendered once per revision. Previewing a single trinket loads that mesh, not a gallery
of all models. The preserved original meshes are large; profile on target mobile
hardware before adding simultaneous interactive previews to customer screens.
Workers claim one render at a time, at most one/second per process; idle checks every
10 seconds. SKIP LOCKED and lease fencing permit multiple workers without double claims.
No new vendor keys are needed and the root private environment is unchanged.

### Public introduction (`firm` mode)

The home page embeds `/game/index.html?mode=firm&reduced=0` (or `reduced=1`).
`packages/game/src/initFirm.js` owns the repeating approved village panorama and
its separately animated character. Five landmark centers are registered to the
artwork's walking path at 81.2% of image height. The sprite walks right, stops at
each landmark and faces it with the existing `up-idle` frame for six seconds.
Tapping the character through its keyboard-accessible host button triggers one
of five randomized upright jumps while walking or stopped, without consecutive repeats. Repeated taps while airborne are ignored;
there are no automatic arrival tricks, flips, squash/stretch or double jumps.
Reduced motion disables jumping and restores a grounded pose. Panel hover/focus pauses keep the panorama and stop timer frozen while allowing explicit character taps. Dialog, visibility and page-cache pauses freeze the current jump. The panorama repeats directly without flipping landmark order.
The web host owns captions and visibility lifecycle. The built panorama
`/game/firm-landscape.webp` is also the loading/error fallback. Character sizes
are 64px on mobile and 88px on desktop. No financial state is represented.

| Direction | Message | Payload and meaning |
| --- | --- | --- |
| Host → scene | `certa:firm-focus` | Integer topic `index` 0–4; show its caption |
| Host → scene | `certa:firm-jump` | No payload; one randomized decorative hop, ignored while hard-paused/reduced/airborne |
| Host → scene | `certa:firm-replay` | Reset the decorative tour |
| Host → scene | `certa:firm-motion` | Boolean `reduced`; settle immediately when enabled |
| Host → scene | `certa:pause`, `certa:resume` | Visibility lifecycle; firm-mode pause may include boolean `allowJump` for panel interaction only, never dialogs or offscreen/hidden states |
| Scene → host | `certa:firm-ready` | `count: 5` |
| Scene → host | `certa:firm-landmarks` | Up to five `{ index, x, y }` label anchors, normalized to the viewport and checked by the host |
| Scene → host | `certa:firm-character` | Normalized viewport `x`/`y` 0–1 and `characterHeight` greater than 0 and below .3; positions only the host tap target |
| Scene → host | `certa:firm-moving` | Hide the caption during its quiet interval |
| Scene → host | `certa:firm-standing` | Topic `index` 0–4, normalized viewport `x`/`y` 0–1 and `characterHeight` greater than 0 and below .3 |
| Scene → host | `certa:firm-error` | Safe `code: "scene-unavailable"`; keep static fallback |

Both ends check exact origin and parent/frame identity. Caption indices are:
About Certa, Certa Transparency, Certa Community, Affiliates, Certa Rewards. They show
only at the corresponding artwork landmark; detail panels hide during walking, while titles track the physical objects throughout the approach. Captions
are descriptive previews, not links to unimplemented pages. Path coordinates wrap
after one panorama width to keep the loop bounded. Resizing preserves the current
walk/stop and recomputes screen positions. Reduced motion freezes movement before
it begins; hidden/offscreen/BFCache lifecycle pauses updates. Teardown releases
the engine and listeners. No model, game font, identity or vendor data is loaded.

## Migration and adding content

Reconcile the live migration baseline before applying `20260916020000_awards.sql`.
It seeds catalog/templates and backfills already verified `ct_*` / `cp_*` records.
It does not copy customer financial records from the old repository or touch production.
To preserve old award IDs/certificate numbers after canonical data migration, prepare
up to 500 reviewed rows per manifest with `user_id`, canonical `source`, `legacy_id`,
nullable `certificate_number`, and `reason`. Run:

```
pnpm awards:import manifest.json ACTOR_UUID --check
pnpm awards:import manifest.json ACTOR_UUID --apply
```

Check is read-only, requires every row to map to existing owned canonical evidence.
Apply adds audited aliases and a new render revision for old certificate numbers;
replaying the same manifest is idempotent. It never fabricates a pass/payout or sends
a message. An unmapped record must be reconciled before importing.

Every new award needs a stable ID, explicit earning source/dedupe key, catalog text,
preview model, ownership tests and reconciliation policy. New certificate designs
need a field contract, local assets/fonts/licenses, synthetic preview, immutable
version and tests for actual PNG output. Update this policy and STRUCTURE.md together.
