# Account allocation and compliance policy

Backend implemented; not deployed. Read this before changing account purchases,
passes, compliance, grants, closure or provisioning. Customer/admin screens and
payment/KYC/signature-vendor integrations are separate work.

## Invariants

1. Three concurrently allocated slots per customer, including practice. Historical
   vendor accounts do not permanently consume capacity. External accounts are
   counted even if that reveals an over-capacity exception; new issuance then stops.
2. One slot follows evaluation → passed/compliance pending → funded successor.
   A pending funded entitlement is not a Tradara account or a balance.
3. A first single evaluation needs no KYC, tax document or funded agreement.
   More than one concurrent/reserved evaluation requires current approved KYC.
   Separate checkouts cannot bypass this check. Staff grants cannot bypass issuance checks.
4. Funded issuance requires approved KYC, tax and current Sim Funded agreement,
   plus ACTIVE Tradara membership. Certa does not accept invitations for customers.
5. Tradara alone establishes passing, closure, failure, balances and account existence.
   A lock is not a pass or closure. Failed/closed accounts release capacity only when
   no outstanding entitlement remains. A reopened account occupies capacity again.
6. Every new issuance needs a slot, entitlement, approved plan and durable operation.
   No direct account creation outside the worker adapter. No boolean compliance override.
7. Configure/verify evaluation plans to `pass_account`, never `pass_and_upgrade`.
   The enabled plan registry records staff verification; it does not remotely change
   Tradara's plans. Unexpected external successors satisfy existing obligations and
   are never followed by a second Certa issuance.

## Storage and ownership

- `ct_slots`: capacity reservation and current account; each vendor account keeps
  its `slot_id` for history. Occupancy is derived from unreleased rows, never a counter.
- `ct_slot_orders`: idempotent purchase intent and verified payment/cancellation.
- `ct_entitlements`: purchase, pass, staff grant or replacement obligation; slot,
  consumed operation and issued account are explicit. One upgrade per evaluation.
- `ct_compliance_requirements`: required versions, initially `v1`. Set actual policy
  versions before launch; these labels are not deployed legal documents.
- `ct_compliance_evidence`: append-only decisions with source ID, effective time,
  optional expiry, version and opaque evidence reference. Store no identity scans,
  tax IDs or signed document contents here. Staff decisions require separate permission.
- `ct_closures`: audited requests; actual status remains on the vendor account.
- `ct_plans`: approved evaluation/funded plan mapping; disabled until verified.
- `ct_allocation_dirty`: changed customers awaiting local coordination. Only account,
  relationship, compliance, entitlement and operation changes schedule work.

New tables/RPCs are server-only with RLS and revoked client grants. Customer reads
use authenticated owner-scoped, no-store HTTP responses. The allocation read exposes
requirement versions and booleans, never staff evidence references or identity documents.

## Customer-facing backend

All routes are under `/api/trading` on web; native clients use verified bearer tokens.

| Method | Route | Contract |
| --- | --- | --- |
| GET | `/plans` | Enabled, verified plan IDs; at most 100 |
| GET | `/allocation` | Derived occupied/available capacity, slot/account/entitlement states, compliance and required versions; no vendor calls |
| POST | `/reservations` | `{plan_id, quantity}` plus `Idempotency-Key`; transactionally reserve 1–3 evaluation slots |
| GET | `/reservations/:id` | Own purchase reservation and settlement state |

Reservations expire for checkout display after 30 minutes, but **elapsed time alone
never releases capacity**: a payment might have succeeded without a callback. A trusted
payment adapter or authorized staff member must verify cancellation/no payment and
settle as cancelled. Late paid callbacks cannot resurrect a cancelled order. They
require payment-provider reconciliation/refund handling when that vendor is integrated.
There is no customer endpoint to claim a payment or approve their own compliance.

The dashboard should render `compliance_pending` with the real passed evaluation,
missing requirement booleans and no invented funded account. `ready` can also wait
for invitation acceptance or the worker. `unknown` requires reconciliation; it is
not permission to retry creation. `reconciliation_pending` means the local coordinator
has not yet incorporated recent events. GET never drives provisioning.

## Admin-facing backend

Same base path on admin; fresh staff identity plus listed permission. Reasons are
required for staff mutations. No new UI is included.

| Method | Route | Permission / body |
| --- | --- | --- |
| GET | `/users/:id/allocation` | Staff; same allocation view for support |
| GET | `/users/:id/account-entitlements` | `trading:read`; internal obligations, cursor pagination |
| GET | `/users/:id/compliance-evidence` | `trading:read`; evidence metadata, cursor pagination |
| GET | `/users/:id/closures` | `trading:read`; requests, actual outcome is account lifecycle |
| POST | `/reservations/:id/settle` | `trading:finance`; `{result: paid\|cancelled, reference, reason}`; verified provider reference |
| POST | `/users/:id/compliance-evidence` | `trading:compliance`; `{requirement: kyc\|tax\|agreement, version, status: approved\|revoked\|rejected, source, effective_at, expires_at?, evidence_reference, reason}` |
| POST | `/users/:id/account-grants` | `trading:provision`; `{kind, plan_reference, replace_account_id?, reason}` plus `Idempotency-Key`; replacement also requires `trading:control` |
| POST | `/accounts/:id/closure-request` | `trading:control`; `{reason}`; returns explicit action required in Tradara |
| POST | `/entitlements/:id/cancel` | `trading:provision`; `{reason}`; only unissued, unclaimed/queued work; no cancellation of ambiguous/running writes |
| POST | `/plans/:id` | `trading:config`; `{evaluation_plan, funded_plan, enabled, pass_only_verified, reason}` |
| POST | `/compliance-requirements/:requirement` | `trading:compliance`; `{version, reason}`; invalidates older evidence for future issuance |
| POST | `/operations/:id/bind-account` | `trading:recovery`; `{inventory_operation_id, vendor_account_id, reason}`; reconcile unknown/failed creation against a confirmed owned inventory result |

`GET /users/:id/entitlements` remains the **vendor** entitlement report. The former
POST to that route and `/entitlements/:id/approve-compliance` are removed, avoiding
an unallocated or blanket-compliance bypass. `/provision` still enforces the same
slot/evidence rules, although eligible obligations are now queued automatically.

### Staff grants and replacement

A funded grant can be approved without pretending an evaluation passed. It reserves
available capacity, waits for compliance/access, and is audited as a staff grant.

A replacement specifies the current owned account. It reuses that slot, records a
closure request, and waits for **Tradara's confirmed `closed` lifecycle** before
issuing the successor. Other slots are unaffected. A pending upgrade/replacement
cannot be overwritten by a second request. Cancel the unissued entitlement explicitly
or reconcile its vendor outcome first.

There is no documented account-close endpoint in the official API index reviewed
on 2026-09-15. The closure request therefore tells staff to close it in Tradara.
Existing lock, cancel-orders and flatten endpoints remain separate audited actions;
none claims closure. Do not invent a vendor endpoint or locally mark accounts closed.

## Coordination, idempotency and usage

- Reservation/grant/admission/recovery share a per-customer PostgreSQL transaction
  lock. Availability and KYC are checked under that lock. Different request keys
  cannot oversell capacity; same key/different intent is a conflict.
- Verified payment creates one entitlement per reserved slot in the same transaction.
- Duplicate pass events produce one business obligation per evaluation, regardless
  of whether event IDs differ across webhook and stream delivery.
- Compliance uses newest effective evidence, matching required version and expiry.
  Duplicate source IDs with different facts conflict; stale approvals do not undo
  newer revocations. Version changes enqueue pending customers for reassessment.
- The existing worker coordinates at most 20 changed customers/tick, up to three
  unconsumed entitlements each, using Certa DB only. No new per-customer Tradara polling.
- Issuance performs one eligibility RPC, one vendor create (shared write budget 2/s,
  15s deadline, one attempt), then one transactional binding RPC. Bind reconciles an
  account-created event arriving before the HTTP response. A worker failure does not
  release its reserved slot.
- Failed **preflight** compliance/access/closure/cap checks can be reconsidered after
  a relevant change. Unknown writes and vendor failures are never automatically replayed.
  Recovery requires confirmed vendor inventory and audited staff evidence.
- UI follows existing authorized live invalidations (`allocation`, `compliance`,
  account and operation changes), then reloads its own snapshot. Clear client state
  on logout/account change. No UI subscriptions are installed by this backend change.

A DB transaction cannot make a vendor write atomic with a simultaneous external
Tradara action or compliance revocation. Eligibility is checked immediately before
creation; accepted/ambiguous writes must be reconciled, not erased. Exactly-once
non-order provisioning is not documented by Tradara. External manual creation can
exceed the cap; Certa records reality and blocks further issuance rather than hiding it.

## Activation and verification

Apply `20260915160000_tradara_backend.sql` then `20260915190000_account_slots.sql`
only after reconciling the existing Supabase baseline. Review/import existing accounts,
plans, purchases and compliance evidence. Pre-existing bare entitlements are deliberately
blocked until assigned verified slots; old JSON/blanket approval flags are not trusted.

Configure real plan mappings, required document versions, pass-only vendor behavior,
webhook subscriptions and worker credentials. Payment, KYC and signature adapters
must verify their provider callbacks before calling these service-only operations.
No production migration, vendor writes, legal-document publication or vendor callback
integration was performed here.

Tests: `pnpm test`, `pnpm test:tradara-db`, `pnpm test:http`, `pnpm typecheck`,
web/admin builds. PostgreSQL tests include concurrent admissions, duplicate payment/pass,
compliance gating/revocation, same-slot upgrades, replacement closure gates, callback
ordering, ambiguous issuance, cancellation and client-role denial. HTTP tests cover
owner isolation and separate staff permissions. Live sandbox/load tests remain required.

## Verified provider evidence

The contracts backend now feeds this coordinator: [CONTRACTS.md](CONTRACTS.md).
Veriff KYC and DocuSeal current agreement/selected tax-form completion enter the same
`ct_compliance_evidence` gate. No additional slot rules or eligibility booleans exist
in the signature worker. The payment adapter and customer/admin screens remain separate.
