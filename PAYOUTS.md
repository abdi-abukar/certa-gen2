# Affiliate and trader payout backend

Implemented in the standalone monorepo. No production migration, historical import,
Tradara mutation, or money transfer has been performed. This is the backend/API;
admin tabs and customer screens can consume the routes below.

## Owners

- `packages/server/src/payouts/`: HTTP authorization, validation, destination
  encryption, database access and payout execution.
- `supabase/migrations/20260915230000_payouts.sql`: atomic decisions, requests,
  earnings, allocations, calendar sessions, checkpoints and audit history.
- Existing `services/tradara/`: the single worker owns payout evidence reads,
  cap/debit execution, reconciliation and a once-per-minute session check.
- Web/admin `app/api/payouts/[...path]/route.ts`: thin route entrypoints.

No separate queue vendor or payout service is introduced. Tradara keeps account
truth; balance responses enter the existing canonical projection pipeline.
`total_cash_adjustments` is retained separately from realized trading P&L.

## Policy implemented

`cash-withdrawal-2026-09-15` is the new backend policy. Do not silently apply it to
old records whose terms/accounting left Tradara cash unchanged. Reconcile existing
balances, paid history and cycle boundaries before admitting migrated accounts.
The old repository remains reference material; none of its rows are auto-imported.

Trader requests require:

- An owned funded account, active relationship, and current KYC/tax/agreement evidence.
- Active/locked lifecycle, fresh balance and daily-stat evidence (maximum five minutes).
- Five distinct completed session dates with at least $250 net P&L each. Dates must
  be after the previous approval's Toronto date and before today's Toronto date.
  Conflicting duplicate session reports require fresh evidence.
- Settled balance comes from the latest completed session's `closing_balance`,
  bounded above by current cash. Starting balance is excluded from eligible profit.
- Minimum request $250. Maximum 50% of eligible profit, capped at $1,000 before
  first approval and $2,000 afterward. Later cycles also require $4,000 profit
  above starting balance. Cash has already been withdrawn, so historical payout
  amounts are **not** subtracted again.
- Only one open request per account. Review rechecks evidence and freezes it.

Session-date handling deliberately excludes the current calendar date. Validate
Tradara's assigned session labels/cutoff against this policy before activation;
missing closing balances or unsupported precision stop eligibility.

Staff provides the signed `cap_offset` at approval. It is relative to starting
balance, not a dollar loss allowance and not a direct current-floor override.
Only the existing `end_of_day_balance` drawdown mode is accepted for this product.
The existing-account API changes the trailing cap, not the mode/value. No DLL is
introduced. Post-withdrawal cash must remain nonnegative and at or above the
resolved cap; this is conservative when the current trailing floor is lower.

The first approval records a required manual change from 2 mini-equivalents / 20
micros to 5 / 50. Staff confirms the actual platform change with evidence. No
unsupported contract-limit API is called. An approval advances the payout cycle;
actual payment is a separate event.

## State and operations

`requested -> approved -> processing -> ready -> paid` for traders.
`requested -> approved -> paid` for affiliates. Requested payouts may be rejected.
A rejected affiliate payout can be reopened within its original session with a
current destination; its earning allocations stay reserved throughout.

1. Refresh evidence, inspect the account and its trading reports through the existing
   trading APIs, then lock the individual account with the supported trading control.
   Cancel/flatten and confirm no working orders or positions before settlement.
2. Approve with a reason and explicit cap offset (for example `"0"`). Approval and
   the durable Tradara operation are created in one transaction.
3. Worker confirms the live lock, EOD risk mode, compliance, flat state and available
   cash. It commits `cap_dispatching`, applies the cap with reason `PAYOUT`, checks
   the response's account/offset/ceiling, then commits `cap_confirmed`.
4. It rechecks flat state and cash, commits `withdrawal_dispatching`, then sends
   `POST /v1/balances/{id}/adjust` with positive numeric amount, `direction:withdrawal`,
   `reason_code:PAYOUT`, `is_payout_withdrawal:true`, and note `Certa payout {uuid}`.
5. It validates the adjustment's ID/account/amount/sign/before-after arithmetic and
   correlation, reads the live balance, and commits the adjustment ID exactly once.
   This makes the request `ready`; it does not imply an external money transfer.
6. Staff records the manual contract increase when required, sends funds through
   the selected rail, and calls `mark-paid` with the actual unique transfer reference.
   The backend does not execute a bank/wallet payment. Unlock is an explicit staff
   trading operation; payout processing never clears an unrelated hold automatically.

### Recovery

The vendor excerpt documents no idempotency key for cash adjustment. Certa's
`Idempotency-Key` prevents duplicate admission, not duplicate vendor withdrawals.
There are no automatic non-order write retries, including 421 and 5xx responses.

A timeout/crash keeps both the payout reservation and durable checkpoint. Inspect
its linked operation (`failed`/`unknown`) through admin request detail:

- `resume`: requeues only before cap dispatch or after cap confirmation. It rechecks
  live lock, risk mode/cap, compliance, exposure and cash. A cash dispatch cannot resume.
- `change-cap`: corrects a cap before any cap dispatch and after a failed operation;
  preserves an audit entry. Explicitly resume afterward.
- `reconcile`: read-only. For an unknown cap, verifies the current account risk setting;
  staff must then explicitly resume. For an unknown withdrawal, supply its adjustment
  UUID and list offset; one bounded 100-row page must contain the exact payout-marked
  adjustment, matching account/amount/delta/correlation. It also reads the live balance.
- `not-applied`: privileged operator assertion with independently verified evidence
  that the dispatched operation did not happen; resets only that checkpoint. A missing
  adjustment on one history page is not such evidence. Explicit resume is still required.

Generic trading operation recovery cannot bypass unresolved payout checkpoints.
Never use a new request ID to recover an uncertain withdrawal. Failed/unknown jobs
remain visible; no certificate or paid event is generated from approval alone.

## Affiliate rules and sessions

Affiliates enroll, apply for creator codes and submit content. Staff sets their
status and commission rate, reviews code applications, and approves individual
commissions. The default commission rate is 800 basis points (8%); existing custom
rates require explicit migration. Rates are frozen at checkout attribution.

`cp_attribute_order(order,buyer,code,sale_cents)` is a **server-only** integration
boundary for an immutable server-priced quote while its slot order is reserved.
It rejects self-referrals and inactive codes/affiliates. The trusted paid-order
transition creates one pending commission. There is no customer route accepting a
sale amount or manufacturing earnings. Wire the migrated checkout pricing owner to
this boundary when that owner is migrated; old checkout imports are not used.

Content review records verified views, an explicit reward in cents, evidence and
reviewer. Approval creates one earning in the same transaction. A submission cannot
be awarded twice. No invented per-view rate or automatic social-platform verification
is applied. URL canonicalization removes fragments; staff checks aliases/reposts in review.

Sessions use the 1st and 15th, America/Toronto. The cutoff is 00:00 on the pay date;
`approved_at < cutoff` and `available_at <= cutoff` are required. Hold expiration
never substitutes for staff commission approval. Late approvals enter the next session.
Each earning can belong to only one payout. One affiliate/currency payout is created
per session. Old unpaid, unallocated earnings carry forward. A resumed worker creates
or continues the latest due calendar session and includes the backlog; it does not
invent historical payment dates. Missing methods/suspended profiles remain unpaid.
The scheduler selects at most 100 eligible affiliates per minute; missing methods do
not starve ready affiliates. Sessions create records, never mark anyone paid.

## HTTP contract

Base `/api/payouts` on the web app for customers and the admin app for staff.
Verified bearer or host-local cookie identity; all responses are private/no-store.
Cookie mutations require the application Origin. Every POST requires JSON and an
`Idempotency-Key` of 8–100 letters/digits/colon/underscore/hyphen. Same key with a
changed intent returns conflict. List responses use `{items,next_cursor}`, maximum
100 rows; pass `cursor` for continuation. Money request fields are integer cents.

### Customers

| Method | Suffix | Body / result |
| --- | --- | --- |
| GET | `/requests` | Own request history; optional `kind`/`state` |
| GET | `/requests/:id` | Own status, safe timeline and masked method |
| GET | `/accounts/:id/eligibility` | Requirements, qualifying dates and available amount |
| POST | `/accounts/:id/refresh-evidence` | `{}`; operation ID; one refresh/account/30s |
| POST | `/requests` | `{account_id,method_id,amount_cents}` |
| GET / POST | `/methods` | List / `{kind,label,destination}`; encrypted server-side |
| POST | `/methods/:id/disable` | `{}` |
| POST | `/affiliates/enroll` | `{}` |
| GET / POST | `/codes` | Own applications / `{code,application}` |
| GET / POST | `/content` | Own submissions / `{platform,url,note?}` |
| GET | `/commissions`, `/earnings`, `/summary` | Own earnings and SQL totals |

### Staff

All reads require `payouts:read`. Named write permissions are supplied in verified
`app_metadata.payout_permissions`; domain wildcards (`payouts:*`, `affiliates:*`) are
explicit grants, not inferred from staff role. Trader approval additionally needs
`trading:finance` in the existing trading permissions.

| Method | Suffix | Permission / body |
| --- | --- | --- |
| GET | `/requests`, `/affiliates`, `/codes`, `/commissions`, `/content`, `/earnings`, `/methods`, `/sessions` | Paginated; owner filter `user_id` where applicable |
| GET | `/summary?session_id=…` | Session and SQL totals; optional `user_id` |
| GET | `/requests?kind=affiliate&session_id=…` | Session payment records |
| GET | `/requests/:id` | Full review evidence, timeline and linked operation |
| GET | `/requests/:id/destination` | `payouts:send`; audited destination reveal |
| POST | `/accounts/:id/refresh-evidence` | `payouts:read`; `{}` |
| POST | `/affiliates/:userId/manage` | `affiliates:manage`; `{status,commission_bps,reason}` |
| POST | `/codes/:id/review` | `affiliates:review`; `{state,reason}` |
| POST | `/commissions/:id/review` | `affiliates:review`; `{state,reason}` |
| POST | `/content/:id/review` | `affiliates:review`; `{state,views,reward_cents,evidence}` |
| POST | `/requests/:id/approve` | `payouts:approve`; `{reason,cap_offset?}` |
| POST | `/requests/:id/reject` | `payouts:approve`; `{reason}` |
| POST | `/requests/:id/reopen` | `payouts:approve`; affiliate only `{method_id,reason}` |
| POST | `/requests/:id/contracts-confirm` | `payouts:approve`; `{evidence}` |
| POST | `/requests/:id/mark-paid` | `payouts:send`; `{transfer_reference}` |
| POST | `/requests/:id/resume` | `payouts:recovery`; `{reason}` |
| POST | `/requests/:id/change-cap` | `payouts:recovery` + `trading:finance`; `{cap_offset,reason}` |
| POST | `/requests/:id/reconcile` | `payouts:recovery`; `{reason,adjustment_id?,offset?}` |
| POST | `/requests/:id/not-applied` | `payouts:recovery`; `{evidence}` |

## Usage and credential boundary

No customer GET, list, summary or admin render contacts Tradara. Evidence refresh
uses at most four vendor reads. Settlement uses at most eight reads and two writes;
reconciliation uses one cap read or one adjustment page plus one balance read.
Every call shares the existing firm/read/write database budgets and bounded adapter
timeouts. The existing worker's target lock prevents concurrent account operations.

`PAYOUT_DESTINATION_KEY` is 32 random bytes encoded as 64 hex characters, projected
only to web/admin. Destinations use AES-256-GCM with random IVs and authenticated
fingerprints for idempotency. Keep the key backed up: rotation requires re-encrypting
both methods and frozen request snapshots. Never put it in a public environment variable.
The Tradara firm key stays in the existing worker. New tables are RLS-enabled,
API-only, and inaccessible to anonymous/authenticated database roles. Customer DTOs
exclude ciphertext, staff evidence and internal operation payloads.

## Activation and verification

1. Reconcile the existing Supabase migration baseline and old payout/commission
   history, including approval-versus-payment ambiguity and account cash baselines.
2. Apply the additive migration after the existing Tradara/account migrations.
3. Configure the destination key on web/admin and deliberate staff permissions.
4. Deploy web/admin and the updated Tradara worker together. Check queue failures
   and unknown operations; a worker is required for sessions and trader settlement.
5. In Tradara sandbox verify account GET/risk/lock field shapes, daily stats settlement
   labels, cap recomputation, cash-adjustment history, and timeout recovery. These
   field contracts are fail-closed and have not been exercised against a live firm.
6. Wire the reviewed checkout quote/attribution boundary and reconcile imported
   earning sources before enabling affiliate commission intake.

Validation: unit/worker fixtures, isolated PostgreSQL transitions/RLS and concurrent
requests/approvals/session allocation, web/admin type checks/builds, and local HTTP
identity/ownership/permission tests. No live payout rail or vendor write acceptance
is claimed. No email delivery or frontend screens are activated by this backend.
