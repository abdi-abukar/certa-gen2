# Exact-inventory scratch tickets

Backend and web/admin screens are implemented; production migration, historical
inventory import and live activation have not been performed.

## What was retained and changed

The original `lib/ticket/tickets.ts`, `series.ts`, `mint-batch.ts`,
`fulfillment.ts`, `lib/checkout/ticket-quote.ts`, and staff ticket routes supplied
the useful rules: percentage discounts (including free checkout), no-prize results,
custom prizes handled by staff, shared/individual code batches, persistent reveals,
and checkout holds. The new workspace imports none of their runtime.

The new model uses an exact finite inventory, not per-scratch weighted rolls.
Staff choose 1–2,000 individual prize units; quantity fields expand into that exact
list. A cryptographic Fisher–Yates shuffle runs once before one atomic database
insert. The shuffled outcomes are persisted and never rerolled. The saved draft
is immutable, including its prize list, quantity, distribution and per-person cap.
Staff review it and activate it, or create a corrected collection. A pause stops
new claims without invalidating already-owned prizes.

Ten tickets can be distributed with one code having capacity ten, or ten
single-use codes. Individual codes draw the next preassigned ticket when claimed;
the exported code list never reveals which prize a code will receive. Per-person
limits apply across every code in the collection. Codes use 96 bits of randomness,
are recoverable only by authorized staff, and never appear in customer reads.
No client grants permit reading pool rows, codes, hidden outcomes or audit records.

Supported prize kinds:

- `percentage_off`: integer 1–100 percent, rounded down to whole discount cents.
- `amount_off`: positive USD cents, capped at the checkout subtotal.
- `manual`: custom prize with customer request and staff-recorded fulfillment reference.
- `none`: explicit nonwinning ticket. No implicit remainder inventory.

Both discount kinds are checkout discounts, not withdrawable money. Custom prizes
are not marked delivered merely because the customer requests them.

## User journeys and authorization

Customer `/tickets` requires authentication and uses owner-scoped, no-store APIs.
Claims additionally require verified email. It shows a forest/gold perforated
mountain ticket, pointer scratching and an equivalent keyboard-accessible reveal
button. Revealing reads the existing outcome and saves the reveal timestamp. Only
revealed, unused discounts link to `/checkout?ticket_id=UUID`. The checkout server
reserves and settles them transactionally. New sign-ins cannot reroll a ticket.

Admin `/tickets` uses fresh staff authorization on every API request:
`tickets:read` for collections/codes and `tickets:write` for draft creation,
activation/pause and manual fulfillment. Master roles follow the shared policy.
The screen supports grouped exact-prize entry, derived inventory percentages,
draft review, paginated collection/code/request lists and bounded CSV export.

## APIs and transaction ownership

Both apps expose `/api/tickets/[...path]`. Writes require the existing origin policy.

| Audience | Route | Behavior |
| --- | --- | --- |
| Customer | GET `mine?page=0` | 50 owned tickets; sealed outcomes removed |
| Customer | POST `claim` | `{code}` and UUID `Idempotency-Key`; one persistent grant |
| Customer | POST `:id/reveal` | Owner-only, idempotent reveal |
| Customer | POST `:id/request-prize` | Request a revealed custom prize |
| Staff | GET/POST `pools` | List/create exact inventory; creation uses UUID idempotency key |
| Staff | GET `pools/:id?page=0` | Immutable config plus 100 codes per page |
| Staff | POST `pools/:id/state` | Activate or pause |
| Staff | GET `manual?page=0` | 50 custom-prize requests |
| Staff | POST `manual/:id` | Record reviewed fulfillment reference |

`tk_checkout(user, ticket, checkout, action, subtotal)` is service-only and called
inside commerce transactions. `reserve` checks owner/reveal/type and locks the
ticket. `submit` fences payment uncertainty. `decline` is only for a verified
processor decline and restores retry eligibility without releasing/rerolling the
prize. `release` refuses submitted holds. `settle` spends once and safely replays
for the original checkout. No timer expires a submitted/unknown reservation.
Refunds never restore consumed prizes. UI calls cannot invoke these RPCs directly.

## Weekly puzzle connection and triggers

Create an active collection with distribution **Weekly puzzle rewards**. Use its
UUID as the puzzle's reward ticket ID. Scheduling validates the mode, active state
and available inventory. A correct answer creates a real ticket in the same
PostgreSQL transaction as the reward: `tk_puzzle_grant` issues with the stable
`puzzle-reward/{reward UUID}` source and completes the reward. Inventory exhaustion
rolls back the new reward rather than promising a nonexistent ticket.

Historical pending rewards are recovered by the existing content worker every ten
seconds, at most 50 per pass. Failed entries get a persisted one-minute delay;
one invalid/exhausted pool does not block valid entries. Retries reuse the source
key and cannot create another ticket. The worker requires no new credentials.

Claimed tickets emit the transactional email `ticket_claim_account` through the
email migration's durable outbox trigger. Delivery remains subject to email
configuration/activation. No prize outcome or claim code is included.

Automatic signup, evaluation-purchase and failed-account ticket campaigns are
not silently activated. Their legacy histories and issuance-cycle identities
must be reconciled before enabling any configured campaign here. Existing legacy
unused tickets are not reissued/imported by this migration. Duels, staked tickets,
public social sharing and legacy artwork editors were deliberately not cloned.

## Deployment and verification

Migration `20260917020000_tickets.sql` follows content and commerce; the email
migration follows tickets. Reconcile the project baseline before applying any of
these. No migration or issuance was applied to production during implementation.

`tests/tickets.test.ts` covers input boundaries, exact shuffling/code cardinality,
sealed-outcome projection and puzzle failure isolation. `tests/tickets-db.sql`
covers owner denial, draft/paused behavior, replay, reservation safety, no reuse,
manual fulfillment, atomic puzzle issuance and database privileges/RLS.
`tests/tickets-concurrency.mjs` exercises twelve simultaneous claims against ten
prizes, exact inventory preservation, source replay and competing checkout holds
in the disposable local PostgreSQL fixture.

Frontend source and TypeScript checks were run; rendered desktop/mobile review
and the complete cross-domain production build are tracked by the parent task.
