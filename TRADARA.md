# Tradara backend

## Status and source of truth

Implemented in the monorepo; not activated against the existing Supabase/Tradara
projects. The migration has been exercised in isolated PostgreSQL, and API behavior
in local HTTP fixtures. No live account, balance, invitation or firm setting was changed.

**Tradara owns account truth.** Passes, breaches, account configuration, MLL, locks,
lineage and balances enter Certa through verified vendor events or authoritative
vendor reads. There is no Certa pass/force-pass route, local balance override,
accept-on-behalf route or session minting. Customers use their own Tradara login.
An admin cash/MLL/control request is a recorded command sent to Tradara, not a local
edit to the mirrored account. Request acceptance is not proof that flattening filled.

## Owners and storage

| Owner | Responsibility |
| --- | --- |
| `packages/server/src/tradara/contracts.ts` | Request validation, exact money contracts and operation permissions |
| `client.ts` | One bounded vendor HTTP adapter; fixed API origins, no blind write retry |
| `events.ts` | Canonical event parsing, HMAC verification, lifecycle classification |
| `store.ts` | Server-only database access and RPC boundary |
| `operations.ts` | Supported vendor operations and read repair |
| `http.ts` | Customer/admin authorization and explicit route dispatch |
| `worker.ts` | Durable operation execution, shared budgets, bulk repair and maintenance |
| `services/tradara/src/main.ts` | Long-running stream collector and authorized Certa live gateway |
| `20260915160000_tradara_backend.sql` | Transactional projections, deduplication, operation ledger, RLS and leases |

There is one shared implementation behind the web/admin Next catch-all route files.
They dispatch only explicit Certa actions; there is no arbitrary vendor-URL proxy.

Balances are stored in the existing Supabase project's **new, additive `ct_records`
table after migration deployment**. `kind=balances` holds the current vendor snapshot;
`kind=stats` is separate so timestamps do not overwrite unrelated data. Trades,
positions, orders, fills, daily reports and cached reporting data use their own kinds.
Money remains strings in records. Cash requests use decimal strings; the adapter
converts only values that round-trip exactly through the vendor's documented numeric
cash API. Precision loss is rejected before sending.

Other tables:

- `ct_memberships`: Certa user → Tradara user, firm relationship and last verification.
- `ct_accounts`: ownership, vendor ID, account kind, lifecycle, vendor timestamp and lineage.
- `ct_events`: sanitized event inbox and applied/ignored/unmapped/error state.
- `ct_transitions`: one durable transition per account/event for future approved consumers.
- `ct_entitlements`: trusted provisioning entitlement, plan, expiry and compliance evidence gate.
- `ct_operations` / `ct_audit`: action intent, actor, request key, outcome and recovery evidence.
- `ct_runtime` / `ct_budgets`: collector lease, replay cursors, health, repair state and shared limits.
- `ct_tickets` / `ct_changes`: single-use live bootstrap tickets and sanitized change delivery.

RLS permits authenticated users to read only their own memberships/accounts/records.
Clients cannot write them or call privileged RPCs. API authorization also checks
ownership. Server-only tables and RPCs are inaccessible to anon/authenticated roles.

## Route contract

Base path is `/api/trading`. Web routes accept verified Certa cookies or bearer JWTs.
Admin routes require fresh staff identity; mutations require the named `trading:*`
permission in server-managed `app_metadata.trading_permissions`. An ordinary staff
role alone does not authorize cash/control actions. All private HTTP responses use
no-store. Cookie writes require the app's Origin; bearer clients use the origin allowlist.

POST bodies are JSON. Queued operations require an `Idempotency-Key` of 8–100
letters/digits/colon/underscore/hyphen. Reusing a key with different intent is rejected.
Responses return HTTP 202 and an operation ID; read the operation or consume live
changes for its outcome. This protects Certa admission; it does **not** create vendor
idempotency for non-order writes.

Lists currently return arrays with at most `limit` rows (default 50, maximum 100).
Use the last row's `id` as `cursor` for the next page. A full page is not proof that
all rows have been returned. Upstream cursors remain in operation results, separate
from local record cursors.

### Customer routes

| Method | Suffix | Behavior |
| --- | --- | --- |
| GET | `/access` | Stored relationship status, setup message, last check and configured login link |
| POST | `/access/check` | Queue a bounded exact-match relationship verification; body `{}` |
| POST | `/invitations/resend` | Queue Tradara invitation for the verified Certa email; body `{}` |
| GET | `/accounts` | Owned account inventory |
| GET | `/accounts/:id` | Owned account detail |
| GET | `/accounts/:id/summary` | Account plus current stored balances/stats |
| GET | `/accounts/:id/trades` | Paginated stored trades |
| GET | `/accounts/:id/daily-stats` | Stored daily report |
| GET | `/accounts/:id/orders` | Stored order events |
| GET | `/accounts/:id/positions` | Stored position events |
| GET | `/accounts/:id/fills` | Stored fill events |
| GET | `/accounts/:id/cash-adjustments` | Stored adjustment history |
| GET | `/operations/:id` | Owned operation result |
| POST | `/practice` | Consume an existing eligible practice entitlement, once; body `{}` |
| POST | `/live-session` | Mint a Certa update ticket, never a Tradara session; body `{}` |

Missing snapshot data stays missing, not a fabricated zero balance. These GETs
never fetch Tradara or provision accounts as a page-render side effect.

### Admin reads

| Method | Suffix | Behavior |
| --- | --- | --- |
| GET | `/overview` | Collector/runtime state and bounded queued-operation list |
| GET | `/accounts` | Paginated firm inventory already mapped to Certa |
| GET | `/accounts/:id` | Account detail |
| GET | `/accounts/:id/summary` | Current account snapshots |
| GET | `/accounts/:id/{trades,daily-stats,orders,positions,fills,cash-adjustments}` | Stored resource reads |
| GET | `/accounts/:id/exposure` | Stored exposure, explicitly labeled snapshot, with refresh action |
| GET | `/users/:id/access` | Customer invitation diagnosis |
| GET | `/users/:id/entitlements` | Stored vendor entitlements |
| GET | `/provisioning` | Paginated provisioning operations |
| GET | `/operations/:id` | Full operation result |
| GET | `/catalog` | Last catalog report |
| GET | `/market-data` | Stored monthly usage reports |

### Admin operations

Every mutation is POST. `reason` is required for control, financial, correction and
mapping actions. Vendor account IDs are resolved from Certa account ownership.

| Suffix | Required permission | Body / behavior |
| --- | --- | --- |
| `/accounts/:id/lock` | `trading:control` | `reason`, future `expires_at`; vendor lockout |
| `/accounts/:id/unlock` | `trading:control` | `reason`; vendor unlock |
| `/accounts/:id/cancel-orders` | `trading:control` | `reason`; one vendor cancel-all call |
| `/accounts/:id/flatten` | `trading:control` | `reason`; vendor flatten submission |
| `/accounts/:id/cash-adjustments` | `trading:finance` | `reason`, `direction`, positive decimal-string `amount` |
| `/accounts/:id/max-loss-limit` | `trading:finance` | `reason`, decimal-string `max_drawdown_limit` |
| `/accounts/:id/refresh` | `trading:read` | `resource`: summary, trades, daily-stats, exposure or cash-adjustments; optional range/cursor |
| `/users/:id/access/check` | `trading:read` | `{}`; verify relationship |
| `/users/:id/invitations` | `trading:access` | `{}`; resend invitation |
| `/users/:id/suspend` | `trading:access` | `reason` |
| `/users/:id/restore` | `trading:access` | `reason` |
| `/users/:id/refresh` | `trading:read` | `resource`: accounts or entitlements; optional vendor cursor |
| `/users/:id/link` | `trading:provision` | `vendor_user_id`, `reason`; audited explicit identity mapping, initially UNKNOWN |
| `/users/:id/adopt-account` | `trading:provision` | `vendor_account_id`, confirmed `inventory_operation_id`, `kind`, `reason` |
| `/users/:id/account-grants` | `trading:provision` | Slot-backed grant/replacement; see `ACCOUNTS.md` |
| `/users/:id/compliance-evidence` | `trading:compliance` | Versioned verified KYC/tax/agreement evidence; see `ACCOUNTS.md` |
| `/provision` | `trading:provision` | `entitlement_id`; consume authorized entitlement |
| `/operations/:id/resolve` | `trading:recovery` | `resolution`, `evidence`; see recovery rules below |
| `/catalog/refresh` | `trading:config` | `{}`; bounded catalog fetch, reports remaining cursors |
| `/market-data/refresh` | `trading:read` | `month`: YYYY-MM |
| `/halt` | `trading:emergency` | `reason`, explicit boolean `liquidate_sim_accounts` |
| `/halt/release` | `trading:emergency` | `reason` |
| `/reconciliations/preview` | `trading:finance` | `reason`, `start_at`, `end_at` (maximum seven days) |
| `/reconciliations` | `trading:finance` | Same window; explicit vendor correction job, never automatic mirror repair |
| `/live-session` | Staff identity | Certa staff update ticket |

`trading:*` explicitly grants all trading permissions. Do not grant it to every staff
user. Mapping/entitlement edits and their audit entry commit in one transaction.
Unknown accounts are not assigned to users by guessing email. Vendor account-created
messages can adopt a known member's evaluation/funded account when the kind is known;
copy-trading shadow accounts are skipped. Other unmapped events remain recoverable.

### Other endpoints

- Web `POST /api/webhooks/tradara`: signed vendor event ingestion.
- Admin `GET /api/vendors/tradara/health`: protected firm-profile read probe.
- Worker `GET /health`: process leadership and connection count; not an uptime SLA.
- Worker `WSS /v1/live`: Certa authorized updates. Reverse-proxy the loopback listener
  through TLS in deployment; default local port is 3210.

## Invitation access

Certa shows INVITED/PENDING_ACCEPTANCE setup instructions, ACTIVE relationship status,
or suspension/revocation/unknown state. ACTIVE does not prove a successful Tradara
login or complete product entitlement. The login URL is a reviewed environment value.
There is no embed/bootstrap call and no automatic acceptance on a customer's behalf.

Status changes normally arrive via membership webhooks. Explicit checks use the
relationship search as a hint and require an exact user-ID + TRADER match. The search
is capped at five pages; no match remains unresolved, never falsely active/revoked.
Invites are limited to five/day/user and a 60-second cooldown. Checks/refreshes have
a 30-second cooldown across replicas, enforced at database admission.

## Events, pass handling and live delivery

The canonical parser accepts documented users, relationships, accounts, orders,
fills, positions, trades, balances, stats and risk events. It also recognizes the
MLL documentation's singular `account.updated` spelling as `accounts.updated`.
Only allowlisted account fields are retained; invitation secrets and arbitrary raw
user objects are discarded. Footprint/device/hedge data is recognized but intentionally
ignored because that separate product feature has not been approved. Unknown event
types are recorded as ignored rather than causing unbounded delivery retries.

Pass, breach, status and predecessor/successor events update `ct_accounts` and write
an immutable transition when the lifecycle changes. A soft risk event is not
converted into a failure. Old snapshots cannot overwrite newer timestamps, and
ignored stale updates are not sent to clients. Duplicate event IDs are deduplicated
transactionally. There is no financial action or email send hidden inside a read.
Email delivery remains governed by the inactive email foundation.

Three filtered firm connections carry balances, stats and trades. Each uses one
entity filter, an independently persisted cursor, an 8 MiB / 1,000-message queue,
and batches up to 250 messages per database RPC every 250 ms. Events and replay
checkpoints commit together. A failed batch terminates the connection; subsequent
messages cannot advance the checkpoint past the failure. Missing/unsafe sequence
numbers cause degraded health and recovery rather than truncated cursors.

Webhook signatures use exact raw bytes, constant-time HMAC comparison and a 300s
replay window; body/header event IDs must agree and the firm must match. Body cap is
256 KiB. Provision/financial work is not performed inside the webhook response.

Certa live clients obtain a single-use 30-second ticket from their authenticated API,
then send `{ "type": "authenticate", "ticket": "…" }` as their first socket message.
They receive `ready`, then sanitized `patch` messages with account, kind, version
and data. Ticket authorization expires after five minutes; renew through the API
and reconnect. Customer messages are filtered by Certa ownership. Membership
suspension/revocation closes affected sockets. Client applications must close their
socket and clear private state on sign-out/backgrounding before wiring this feed into
screens. This backend change does not add frontend subscriptions.

Clients hydrate through the HTTP snapshot API after receiving `ready`, buffer patches
during that GET, and discard older vendor timestamps/versions when merging. Patch
messages are combined per account/kind each second. Slow clients are disconnected
at 128 KiB buffered output and must resynchronize. There is no browser-driven vendor
polling and no extra Supabase Realtime channel doing duplicate work.

## Operations and recovery

A single active worker claims queued operations. Database admission serializes pending
operations per target, and a failed process leaves running operations UNKNOWN rather
than replaying them. Confirmed means the vendor accepted/responded to the request;
flattening may still be awaiting fills. Vendor events/current exposure establish the
actual account outcome. A financial request that was accepted but could not be
persisted is UNKNOWN, not safely failed.

Recovery is explicit through `/operations/:id/resolve`:

- `retry_read`: only allowed for read-only operations.
- `not_applied`: a privileged operator supplies evidence that an ambiguous mutation
  did not happen before the same recorded operation is requeued.
- `confirmed`: operator supplies evidence of the vendor result. This resolves the
  operation ledger only; it cannot edit a balance or mark an account passed.

No blind retry is added to provisioning, MLL or cash writes. Withdrawals check live
cash and complete flatness first; these checks cannot eliminate races with actions
performed externally in Tradara. Payout eligibility/settlement is a separate workflow,
not inferred from this administrative adjustment API.

## Usage and health budgets

| Work | Current behavior |
| --- | --- |
| Vendor HTTP | Shared DB budget: trading reads 10/s, firm reads 5/s, admin queries 2/s, writes 2/s |
| Request deadlines | 8s reads / 15s writes; one attempt; 429 installs a shared Retry-After admission pause; no immediate retry |
| Stream reconnect | Shared ceiling 6 connects/min; jittered backoff; 4001 stops until restart/config repair |
| Leadership | One worker lease, renewed every 5s, expires at 30s |
| Operation queue | Worker checks once/second; this polls Certa's DB, not Tradara |
| Live change feed | One DB query/second only with connected clients; at most 500 changes/read |
| REST health | One worker firm-profile read every five minutes; admin manual probes cache for 60s/process |
| Bulk repair | Initial/expired-stream/daily accounts + bulk balances, one page/10s while pending; idle check every 10min |
| Historical gaps | Explicit bounded history/stat refresh; health labels historical gaps rather than claiming completeness |
| Unmapped event repair | Up to 100 stored events/min in one batch after identity/account linkage |
| Retention maintenance | Hourly: live changes 1h, expired tickets 1d, applied stream events 2d, handled webhook events 30d |

Financial audit/operation records are not deleted by that maintenance task. Define
trade/audit retention with the business before production scale. Shared streams remove
per-user Tradara polls; they do not make message bandwidth or database row writes free.

## Activation and known limits

1. Reconcile the old project's migration history. This additive migration does not
   alter/import the old checkout/lifecycle tables; never blindly run `db push` on the
   existing project. Confirm owned-account mappings and entitlement sources first.
2. Apply the reviewed migration. Set the root environment variables documented in
   `.env.example`. `SUPABASE_SECRET_KEY` goes only to web/admin/worker; the firm API
   key goes only to the worker; webhook signing secret goes only to web. No new live
   secrets have been copied. Health uses a separate admin read credential.
3. Verify the actual Certa firm/API environment and least-privilege key scopes. Only
   official production/sandbox origins are accepted. Review/verify the login link.
4. Configure the vendor webhook subscription for required membership/account/risk
   events. Add orders/fills/positions only if those stored views are needed. Balance,
   stats and trades arrive via their shared streams; avoid duplicating high-volume
   delivery unnecessarily. Test the signature using Tradara's signed test event.
5. Start the worker with `pnpm dev:tradara`, expose the live gateway through TLS,
   protect admin with the agreed Cloudflare Access deployment, and test actual feeds.
6. Link/migrate known identities, populate inventory through verified vendor reads,
   reconcile entitlement/payment/compliance sources, then enable customer screens.

The old catalog, daily-stat and billing usage routes are implemented from the prior
integration but their current vendor contracts still need live/sandbox verification.
Catalog results expose partial pagination rather than pretending a first page is the
whole catalog. Long offline gaps may require explicit history backfill. Native UI,
customer invitation panels, email triggers, payment/compliance vendor automation and
live load/SLA certification are not included in this backend deployment step.

No production readiness claim follows from local tests. Live permissions, actual event
payload completeness/order, maximum throughput and multi-replica failover must be
validated with the configured vendor before enabling operations.

## Verification and official references

Commands: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm test:http`,
`pnpm test:tradara-db`. The DB suite starts/deletes an isolated localhost PostgreSQL
cluster; `PG_BIN` can specify PostgreSQL binaries. It never uses a production URL.

References: [firm stream](https://docs.tradara.com/prop-firm/realtime/overview),
[AsyncAPI](https://docs.tradara.com/api-specs/firm-ws-asyncapi.yaml),
[event catalog](https://docs.tradara.com/prop-firm/realtime/event-catalog),
[webhook contract](https://docs.tradara.com/prop-firm/webhooks/overview),
[API idempotency](https://docs.tradara.com/authentication),
[MLL](https://docs.tradara.com/prop-firm/operations/max-loss-limit),
[cash adjustments](https://docs.tradara.com/prop-firm/operations/adjust-balance),
[relationships](https://docs.tradara.com/prop-firm/firm/relationships).

Legacy audit covered `lib/tradara/*`, account/practice/payout/lifecycle helpers,
checkout provisioning, webhooks and staff control routes. The old pass route's 410
behavior is intentionally replaced by event handling, not a new local pass override.

## Account allocation integration

See [ACCOUNTS.md](ACCOUNTS.md) for the implemented three-slot coordinator, customer
reservation/read APIs, versioned compliance, automatic funded eligibility and audited
staff grants/replacements. The second migration replaces the blanket compliance flag
and unallocated entitlement mutation. No UI or production activation is included.

## Payout operations

The payout backend now uses this existing worker and budget/operation ledger.
`payout-evidence` reads current account/balance/daily reports. `payout-settle` commits
checkpoints before setting the EOD trailing cap and posting a payout-marked cash
withdrawal. `payout-reconcile` reads vendor evidence and never resends cash.
See `PAYOUTS.md` for exact call bounds, staff permissions, recovery and sandbox gates.
Contract-limit changes are manual. No DLL or firm-wide control is introduced.
