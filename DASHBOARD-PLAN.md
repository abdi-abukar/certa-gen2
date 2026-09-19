# Combined trader dashboard implementation plan

Status: main web dashboard implemented, September 17, 2026. The responsive shell,
selected-evaluation states, horizontal Kaplay scene, calendar/trade ledger, history,
evaluation pricing and supporting compliance/terminal/rules/support entry points
are implemented. Compliance stays generic on the overview; the dedicated page
owns its detailed workflow. The remaining route inventory below is a roadmap,
not a claim that payouts, receipts or affiliates have been completed.

The approved light direction is owned by [FRONTEND.md](FRONTEND.md) and the
[Certa frontend skill](.agents/skills/certa-frontend/SKILL.md). Browser result
acknowledgements currently persist on this browser only; durable cross-device
acknowledgements and trade-query indexing remain follow-up integration work.
No production migrations or provider operations are part of local verification.

## 1. Outcome and scope

Build one responsive trader overview in `apps/web`: a familiar sidebar, account
tabs, precise account facts, a sideways mountain journey, visible objectives,
and a calendar that controls the displayed trades. No Home/Adventure switch.

The first implementation covers the shell and complete overview states, including
essential history and transition handling. Existing checkout, security, tickets,
awards and community routes remain their feature owners. Further customer payout,
compliance and affiliate screens are staged below. Mobile here means responsive
web; native Expo screens remain a separate implementation using the same contracts.

Use `/account` as the overview to preserve current login destinations. Use one
shared authenticated shell around customer tools, preserving existing public URLs
through a route group if appropriate. Do not duplicate the overview at a second
route. Read installed Next documentation before implementing layout changes.

## 2. Composition

Chosen desktop arrangement:

```text
Sidebar     Overview                                      Open terminal
            Evaluation 01 | Funded 02 | Pending 03          Buy account
            Account state + balance     Sideways mountain journey
            Profit / loss limit         Current position / next milestone
            Calendar, selected day      Objectives / next valid action
            Selected day's trades and totals
```

Chosen mobile arrangement:

```text
Certa                                                        Menu
Horizontally scrollable account tabs              Fixed Buy account
Account state / freshness / balance
Profit + loss limit
Shallow sideways scene / remaining objective
Open terminal
Objectives: clear count and readable requirement rows
Week calendar, selected day
Selected day's trades
```

- Warm light background, pale sage navigation/activity shading, dark DM Sans,
  forest actions, restrained gold accents. Use broad surface shading, thin rules
  and spacing rather than an independent bordered card for every fact.
- Desktop hero is approximately half data and half scene. Preserve reading space
  at intermediate widths; collapse sidebar before compressing financial text.
- Mobile uses the same account tabs, not the earlier mockup's dropdown. Show all
  accounts along the top in a scrollable strip, with the selected tab brought into
  view. Keep the purchase action outside the scrolling region; at 320px it may sit
  immediately beneath the strip. No three full desktop cards squeezed onto a phone.
- The scene is about 140–190px high on phones and frames the character plus the
  next landmark. The page scrolls normally; objectives are not buried in a menu.
- Keep sidebar collapse/profile behavior from the old design. On mobile use a
  drawer with focus trapping, Escape/close and focus restoration. No extra bottom
  navigation in this first version.
- Compare against an alternative full-width scene above all facts: reject that
  arrangement because it pushes risk information and objectives too far down.
- Correct mockup details in implementation: actual futures instruments, accurate
  session dates, progress-aligned character position, correct objective counts,
  and no hardcoded dollar thresholds or decorative slogans.

## 3. Account tabs and slot behavior

Tabs represent occupied account journeys, anchored by stable slot identity. Vendor
account identity can change from evaluation to funded within that same journey.
Display real allocated states, not a list of every historical purchase.

1. Display up to three normal occupied slots. The server's allocation snapshot is
   authoritative; pending reservations/issuance can consume capacity too.
2. An active evaluation, practice or funded account is selectable. Order remains
   stable across refreshes; never sort tabs by changing balance.
3. Confirmed evaluation pass: show its one-time result, retire the evaluation as
   an independently selectable active account, and retain its slot as
   `Complete compliance` or `Preparing funded account` until the successor exists.
4. Funded issued: replace the pending state in the same tab. Select the new vendor
   account, clear old account-specific requests/caches and show its own values.
   Never animate the old evaluation balance into a fabricated funded balance.
5. Confirmed failed/closed account: offer a short result presentation, then remove
   it from the ongoing overview and preserve its records in Account history.
   If a replacement/entitlement still occupies the slot, keep that pending journey.
6. Animation completion only acknowledges presentation. It never releases capacity,
   deletes account records, confirms closure or authorizes another purchase.
7. If the selected account disappears, choose the next existing tab deterministically;
   if none remains show the returning-trader empty state. Do not steal focus when a
   different account changes in the background; show a non-blocking status notice.
8. An explicit vendor reopening can legitimately restore a historical account.
   Imported over-capacity accounts must all remain visible with an exception notice;
   block new purchases rather than silently hiding a fourth real account.

Pending product choice: the current monorepo counts practice in the three total
slots; the old app treated it separately. Until the user's answer changes this,
retain the monorepo rule. A change requires allocation policy, concurrency tests
and migration review, not a frontend count adjustment.

### Purchase action

Place `Buy account` next to the tabs on both platforms, not at the sidebar bottom.
Resolve its current behavior from server-owned allocation and checkout state:

| Condition | Action |
| --- | --- |
| Available and eligible | Open existing checkout |
| Existing resumable checkout | Continue checkout; preserve the existing cart |
| More capacity requires KYC | Explain requirement and open compliance |
| Three occupied slots | Show `3 of 3 slots in use` with an accessible explanation |
| Payment pending/unknown | View payment status; do not offer another charge |
| Availability still loading | Disabled pending state, no optimistic purchase promise |
| Product/processor unavailable | Explain availability and give support/recovery path |

The first evaluation is not globally blocked on KYC/tax/funded agreement. The
existing policy gates additional evaluations on KYC and funded issuance on all
required current evidence. Derive these gates from the new coordinator.

## 4. Overview state inventory

These are variations of one overview, not separate copies of the dashboard.
Account lifecycle, membership/access, allocation and data freshness remain
independent dimensions. Compliance appears on the overview only as a generic
`Complete compliance` action when the server says it is needed. The destination
page/dialog resolves requirements, progress, review and any follow-up steps;
do not build a separate dashboard variant for each provider/compliance state.

| State | What the trader sees | Next action / transition |
| --- | --- | --- |
| Initial loading | Stable shell and skeleton facts; scene still | Wait; never flash an empty account or $0 |
| No account ever purchased | Starting trail/basecamp, concise explanation, no fake stats | Buy first account; view account rules |
| No active account, history exists | Quiet return state with last result available | Account history or buy account |
| Checkout saved/abandoned | Resume notice distinct from issued accounts | Continue existing checkout |
| Payment pending or unknown | Original purchase reference and confirmation status | View status/support; no unsafe retry |
| Paid, account queued | Reserved slot, `Preparing your account` | Show progress and membership requirements |
| Invitation pending | Clear Tradara acceptance steps | Open Tradara; explicit resend/check if permitted |
| Provisioning failed | Explain account setup issue separately from trading failure | Status/support; only backend-supported recovery |
| Provisioning result unknown | `Confirming account setup`, preserve slot | Reconciliation; no duplicate creation |
| Plan mapping/coordination pending | Honest pending state with support action | Wait for configured plan/coordinator |
| Active evaluation, no trades | Real starting snapshot or unavailable value, empty calendar | Open terminal and read objectives |
| Active evaluation | Balance, profit, risk, journey, calendar and trade activity | Trade, inspect objectives/day |
| Practice | Explicit Practice label, own rules and metrics | Trade; no funded/payout promise |
| Profit threshold reached, pass unconfirmed | Near-goal scene and `Awaiting confirmation` | Keep status until vendor confirms |
| Confirmed pass | One-time summit/result and historical evaluation | Same slot continues toward funded issuance |
| Compliance needed | Generic compliance prompt, without provider-specific states or document lists | Complete compliance; page/dialog handles details |
| Compliant, funded not yet issued | `Preparing funded account`, no invented balance | Wait for issuance or resolve invitation |
| Active funded | Funded cash/profit and canonical payout-cycle progress | Trade or inspect payout eligibility |
| Payout eligible | Exact eligible amount/requirements from server | Review payout request |
| Payout requested/approved/processing/ready | Distinct payout status, account remains visible | View payout; no paid celebration yet |
| Payout paid | One-time paid award; new cycle from canonical data | View receipt/award and continue |
| Locked/suspended/revoked access | Reason when available; trading action reflects access | Support or authoritative next step |
| Failed/breached confirmed | Brief neutral failure sequence and final snapshot | Continue to another account/history |
| Closure/replacement pending | Keep truthful current lifecycle and pending action | Await actual vendor closure/successor |
| Stale/offline/partial data | Retain matching snapshot with timestamp; mark missing sections | Reconnect or explicit stored-data refresh |
| API unauthorized/unavailable | Session recovery or service error, distinct from zero accounts | Reauthenticate/retry/support |

A loss-limit warning can appear from current authoritative risk values, but the
browser must not turn a threshold calculation into account failure. An unrelated
compliance renewal must not locally close an existing trading account either.

## 5. Motion, observations and transitions

### Ongoing movement

- Keep a presentation checkpoint per signed-in user, vendor account and journey
  phase: last displayed source version/time and position. Use session-scoped
  persistence initially, clear on logout/identity change. It has no financial authority.
- First observation without a valid checkpoint: position at the current confirmed
  snapshot. Do not invent a replay from the starting balance.
- Subsequent updates: move from the position actually on screen to the newest
  confirmed position. Coalesce rapid replaceable balance updates; use a short
  bounded animation, roughly 0.6–1.5 seconds, rather than enqueueing every tick.
- Update readable numeric facts promptly. The scene may ease into place, but it
  must not display interpolated dollars as the current balance or block actions.
- A trades event invalidates the relevant read models; do not reconstruct balance
  by adding client trade P&L. Balance, stats and trades may arrive separately.
- Evaluation distance follows the account's canonical profit metric and target,
  consistent with the existing server progress projection. Keep balance, equity,
  realized profit and unrealized profit visibly distinct where present. Open P&L
  may update separately; do not silently use equity to imply a confirmed pass.
- Ordinary profit reduction can move the character backward gently. Payout debits,
  account replacement and cash corrections need their own cause-aware transition;
  never portray a paid withdrawal as a failed trade or account failure.
- Funded journey uses the server's payout-cycle/qualifying-day projection. It need
  not advance on every balance change. Show the current cycle and next requirement.
- When the tab is hidden/offscreen, pause motion. On return reload current state
  and perform at most one bounded catch-up. On account switch never animate across
  two accounts. Reduced motion snaps position and uses equivalent text feedback.
- Null, stale or inconsistent criteria freeze progression with a useful label.
  Negative progress may stop at basecamp while the real negative P&L remains visible.

### Result sequences

| Confirmed event | Presentation | Afterward |
| --- | --- | --- |
| Evaluation passed | Brief summit/trophy reveal, `Evaluation passed` | Complete compliance or prepare funded |
| Account failed | Character stops, short fade/exit, neutral result copy | History; select remaining account |
| Funded issued | Enter a fresh funded trail, `Funded account ready` | Show successor's real snapshot |
| Payout requested | Small request acknowledgement only | Requested status; no summit/earned award |
| Payout paid | Award reveal based on actual award ledger | Confirmed next payout cycle |

Allow skip/continue throughout; never require watching motion. Do not auto-dismiss
essential result copy before it can be read. If an unseen terminal result arrives
while away, show a one-time event notice without permanently restoring an inactive
account tab. The retained local snapshot supports an in-progress result presentation.

Use stable canonical event/award IDs and durable per-user acknowledgements for
pass/fail/funded/paid results. The new repo has no equivalent of the old celebration
acknowledgement API. Add a narrow authenticated receipt store with idempotent writes,
ownership denial tests and monotonic acknowledgement. Refreshes and later logins
must not replay acknowledged events. Coordinate browser tabs; strictly simultaneous
cross-device exclusivity would require a short presentation claim and must not be
claimed from acknowledgement alone. Imported historical events are marked historical,
not replayed as new celebrations. Reopened/new lifecycle events get distinct IDs.

Serialize result notices, prioritize account-blocking changes over decorative
motion, and deduplicate one logical pass arriving through multiple vendor sources.
Audit legacy scene triggers: numeric threshold crossings and scene messages cannot
trigger financial mutations or declare a pass. Game completion only completes UI.

## 6. Calendar and trade interaction

- One selected trading session date per account. Initially choose today's provider
  session if it has trades, otherwise the latest session with trades. With no trades,
  select the current session and show an honest empty state. Never override a date
  the trader deliberately selected when live activity arrives.
- Selected day: forest fill, clear text, visible focus and selected semantics.
  Today's marker is separate. Use signed amounts and labels, not color alone.
- Desktop shows a useful month grid. Mobile shows a week with previous/next and a
  month picker. A tap updates `Friday, September 4 — 2 closed trades` below it.
- Detail includes all paginated closed trades for that session, relevant costs,
  signed net P&L, symbol, direction, quantity and time. Mobile uses readable rows
  with a detail sheet for additional columns. Open positions are labeled separately.
- Clicking a no-trade day shows `No closed trades for this session`; missing or
  incompletely loaded reports show unavailable/loading, not a fake zero.
- Use provider-assigned session dates and explicit timezone labels. Do not group
  futures sessions using the browser's local midnight. Check overnight and daylight
  saving boundaries against canonical reports and payout rules.
- Summary totals must agree with canonical daily reports; explain incomplete or
  corrected trade pages rather than compute a misleading total from the first page.
- Day selection is preserved through refresh; account/date changes cancel or ignore
  stale requests. A trade-detail or share action never changes the selected account.

## 7. Required screens and secondary surfaces

Proposed new routes are named for planning; existing routes keep their URLs.

| Screen/surface | Contents | Delivery |
| --- | --- | --- |
| `/account` overview | All states above, tabs, scene, objectives, selected-day trades | First release |
| Desktop sidebar / mobile drawer | Overview, terminal, history, rules, available customer tools, profile/support | First release |
| `/account/history` | Passed, failed, closed and superseded accounts; filters, lineage | First release |
| `/account/history/:id` | Historical summary, outcome/date, rules snapshot where available, calendar/trades, successor link | First release |
| Objectives panel / mobile sheet | Exact requirements, progress, unmet reason and appropriate action | First release |
| Account result notice | Pass/fail/funded-ready result and durable acknowledgement | First release |
| Trading access view/sheet | Active link, invitation required, suspended/unavailable guidance | First release; own Tradara login |
| Rules view | Actual selected product/account rules, loss-limit meaning, session basis | First release, reuse current guide where suitable |
| `/checkout` | Existing checkout/resume/pending/result behavior | Integrate existing screen |
| `/account/compliance` or compliance dialog | Single destination for all detailed requirements and follow-up; generic entry from dashboard | Next essential workflow; overview links only when usable |
| `/account/payouts` | Eligibility, destinations, request, history and actual payment status | Next workflow |
| `/account/payouts/:id` or detail sheet | Request timeline, amounts, paid confirmation, issue handling | With payouts |
| `/account/receipts` | Commerce history and purchase detail | Follow-up; PDF export needs backend work |
| `/awards` | Existing trophy cabinet, certificates, earned details/downloads | Integrate existing screen |
| `/tickets` | Existing scratch/redeem wallet and pending rewards | Integrate existing screen |
| `/community` | Existing Discord linking/sharing preferences | Integrate existing screen |
| `/account/affiliates` | Codes, attributed earnings, content and affiliate payout status | Follow-up customer UI |
| `/account/security` | Existing email/TOTP controls | Integrate existing screen |
| Profile/character settings | Name/preferences, character appearance, motion preferences | Follow-up; use existing look contract |
| Trade/day/month share sheet | Preview, privacy, download, explicit Discord sharing | Follow-up, server-verified values |
| Support entry | Help/contact with deliberate minimal context | First release; no automatic message sends |

The shell must not ship dead sidebar links. Mount existing working routes now;
add remaining entries with their usable screens. Keep history discoverable beside
the account tabs as well as in navigation. Backend-unconfigured features need a
clear availability state, not a mocked success flow.

## 8. Useful ideas from the old dashboard

Carry forward account selection memory, editable display names when supported,
practice identification, terminal/invitation guidance, objective details, loss-limit
visibility, updated-at/source messaging, account history and pass/funded lineage.

Add secondary discovery for unclaimed tickets, earned trophies, payout status,
Discord linking and privacy-aware trade/day/month artwork. Use small relevant
notices or navigation counts; avoid crowding the hero with simultaneous promotions.
Creator codes/discounts belong near purchase only when a real offer is available.
Keep access to receipts, rules, support and security within the customer shell.

Do not port the old parallel dashboard/adventure providers, browser vendor polling,
sample accounts into live data, balance-derived force-pass/failure decisions,
instant-upgrade behavior retired by the new repo, or Social/duels while disabled.
Do not assume old card vaults, receipt exports or profile editing APIs migrated.

## 9. Existing foundations and missing work

Existing owners and read contracts:

- `packages/server/src/tradara/`: `/api/trading/allocation`, `access`, `accounts`,
  account `summary`, `daily-stats`, `trades`, operations and the live-session ticket.
- `services/tradara/src/main.ts`: authorized `/v1/live` gateway with `ready`,
  versioned `patch` notifications, five-minute authorization and resync closures.
- `packages/server/src/awards/`: canonical game progress, appearance, earned awards.
- Existing compliance, commerce, payouts and tickets owners supply workflow truth.
- `packages/game/` owns all scene code/assets. `apps/web/app/awards/cabinet.tsx`
  demonstrates the same-origin host protocol but is not the complete dashboard.

Work still required, not assumed to exist:

1. A typed dashboard composition of these facts, with one presentation reducer for
   lifecycle/access/compliance/data state and allowed actions. Public-safe contracts
   go through narrow exports; no browser import of `@certa/server`.
2. A horizontal dashboard scene using existing Kaplay/assets. Existing artwork and
   vertical scene are reusable foundations; the pictured horizontal trail/camera
   and mobile framing are new work. Inspect performance and load only this scene.
3. Extend the existing progress projection from coarse integer steps to continuous
   presentation progress with source identity/time and explicit missing-data states.
   Preserve canonical target/pass authority; use one projection for text and scene.
4. Reliable date-filtered, chronological, bounded trade and daily-report reads. The
   current trading list helper paginates by UUID and has no session-date filter;
   a first page cannot power complete calendar totals or all trades for a selected
   day. Add indexed owner/account/session filters and stable pagination as needed.
5. Customer-safe history/transition reads and durable presentation acknowledgements.
   Account inventory and internal transitions exist; the complete event inbox and
   history UI/read composition do not. Mask staff metadata/evidence.
6. Browser live connection and identity-scoped selection/observation state. Current
   shared API client only wraps identity and second factor. Extend narrowly for
   real consumers instead of copying the old giant dashboard provider.

## 10. Data and connection behavior

Use one customer-shell connection to the existing Certa gateway, not a Tradara
socket or polling loop per component. On connection ready, load authoritative
stored snapshots and reconcile any buffered invalidations. A patch is an invalidation
unless its typed contract safely supports merging; never treat a partial patch as
a complete account. Re-fetch if an event arrives during a relevant snapshot read.

Renew authorization through the existing ticket flow, reconnect with bounded
backoff, and refetch selected account/allocation on every reconnect. The current
gateway has no browser-supplied replay cursor, so reconnecting alone does not
recover missed account changes. Lifecycle notices come from durable records, not
only the coalesced live feed. Compare versions safely, discard out-of-order replies,
and deduplicate/coalesce replaceable read requests.

Initially read allocation/access plus selected account facts and visible calendar
range; load selected-day trade pages and workflow detail as needed. Do not fan out
all trade history for every account. Provider requests are owned by workers and
explicit supported operations; dashboard reads query Certa storage only.

When realtime is unavailable, retain honest snapshot mode with source timestamps
and an explicit refresh action. Do not silently introduce per-user vendor polling.
Clear/hide all private state on sign-out or identity change and reject late results.
Validate exact scene origin and frame identity. Scene messages request UI actions,
not approval, payment, account issuance or award mutations.

## 11. Implementation order

1. **State contract and fixtures:** codify the inventory, slot successor selection,
   purchase gates, calendar selection and motion events. Resolve practice policy.
   Include every blocking and terminal state in synthetic local fixtures.
2. **Shell and static composition:** build light sidebar/mobile drawer and `/account`
   layout, compact tabs/nearby purchase action, shaded hero/activity regions,
   visible mobile objectives and selected-day calendar. Verify 1440/1024/390/320px.
3. **Connect real reads:** allocation/access, account facts, rules, calendar/trades,
   empty/pending/compliance/unavailable states, checkout integration and history.
   Finish date pagination/query gaps; no fake records in authenticated screens.
4. **Horizontal scene and motion:** implement the same data contract in the scene,
   observed-position interpolation, reduced motion and static fallback. Add durable
   result notices before claiming one-time pass/fail/funded behavior.
5. **Live updates:** integrate gateway, reconnection/snapshot recovery, session
   renewal, coalescing, multi-tab behavior and stale-data UI. Do not replay historical
   animations after deployment/import.
6. **Complete connected journeys:** compliance first, payouts next, then receipts,
   affiliates, settings/share features. Existing awards/tickets/community integrate
   without duplicating their backends. Native design/implementation follows separately.

A shell-only review can happen after step 2, but it is not a completed dashboard.
The first functional overview release requires steps 1–5, usable history, working
links for its next actions, and the validation below.

## 12. Verification and readiness

- Behavioral tests: zero/new/returning, three slots and reservation capacity,
  pass → compliance → same-slot funded, fail → history, reopening, unknown writes,
  stale data, superseded/out-of-order events, and account changes mid-request.
- Motion tests: first load, repeated updates, negative profit, withdrawal/cycle
  change, reconnect, hidden tab, reduced motion, duplicate events, acknowledgement
  persistence and animation interruption. No game message can mutate financial truth.
- Calendar tests: correct highlighted selection and trade query, empty vs missing,
  more than one page, fees/net totals, current-session updates, overnight/DST labels.
- Ownership tests for any added APIs/tables: fresh auth, cross-user denial,
  acknowledgements cannot alter someone else's events, identity change isolation,
  no exposed staff or provider secrets. Unique migrations and disposable DB only.
- Render desktop/tablet/phone with real scene or documented fallback, all meaningful
  non-happy states, readable text zoom, 44px touch targets, focus and screen-reader
  equivalents. Check actual mobile performance before calling animation device-ready.
- Run `pnpm test`, `pnpm typecheck`, changed-app builds and affected HTTP/database
  suites. Read installed Next guides before code. No live payments or messages as tests.
- Confirm deployed migration baseline, account/history import, plan mappings,
  provider setup and worker/live-gateway availability separately. Signing in alone
  proves neither account-data readiness nor provisioning/payment activation.
- Update `STRUCTURE.md` for actual new ownership, `FRONTEND.md` for accepted shared
  visual changes, and README for verified behavior/remaining setup when implemented.

## Source anchors

- [Account policy](ACCOUNTS.md), [Tradara contracts](TRADARA.md),
  [awards and scenes](AWARDS.md), [compliance](CONTRACTS.md),
  [payouts](PAYOUTS.md), [commerce](COMMERCE.md).
- Current shell: `apps/web/app/site-frame.tsx`, `apps/web/app/account/page.tsx`.
- Existing domains: `packages/server/src/tradara/http.ts`, `allocation-http.ts`,
  `store.ts`, `packages/server/src/awards/http.ts`, `progress.ts`.
- Old app reviewed as reference: `components/dashboard/shell.tsx`, `overview.tsx`,
  `trader-board.tsx`, `account-celebrations.tsx`, `account-history-panel.tsx`,
  `home-account-pushes.tsx`, `lib/account/allocation.ts`, `lib/dashboard/last-surface.ts`.
  These are reference paths in the parent, not monorepo runtime imports.
