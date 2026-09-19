# Authenticated checkout and payment operations

The web `/checkout` and admin `/commerce` screens use one shared server owner at
`packages/server/src/commerce`. The migration is additive and uses `cm_*` to avoid
existing compliance `cc_*` tables. Nothing in this change applies a production
migration, enables a processor, sends a live email, or performs a real charge.

## Original behavior retained and deliberate scope

Source behavior was traced through the original checkout session/current,
repurchase, payment preparation/retry, token charge, free completion and upgrade
routes; `lib/checkout/session-store`, pricing, purchase restrictions;
`lib/payments/charge`, reconciliation and webhook intake; `lib/card/authorize-net`,
`lib/card/nmi`, and the NOWPayments adapter/IPN implementation.

Retained: authenticated ownership, one active persistent checkout per user,
immutable server-priced revisions, a new invoice after confirmed decline,
no processor switching or cart replacement while payment is unresolved,
transactional ticket/coupon holds, confirmed settlement and durable fulfillment.
Cards remain tokenized in the browser: Authorize.net Accept.js or NMI Collect.js
hosted fields. Card numbers/security codes and opaque tokens never enter database
history, callback storage, or application logs. NOWPayments uses hosted invoices.

The old instant-upgrade route invokes Certa's own evaluation-pass logic. That
behavior is deliberately retired under this monorepo's existing vendor-truth
policy: Certa cannot invent a pass, edit a balance or treat payment as proof of
passing. Purchases here issue evaluations through the canonical slot coordinator;
verified vendor passes retain the existing funded progression workflow.

Saved cards, refunds/disputes, coupon audience campaigns, receipt PDF exports and
legacy data import remain outside the selected checkout scope. There is no
migration of processor secrets or old payment records. Staff configures the
retained verified evaluation plans and prices before offering them for purchase.

## Purchase and discount invariants

- Fresh verified identity and verified email are required for every customer API;
  central second-factor policy applies. No guest checkout or customer settlement API.
- `cm_save` serializes by owner, resumes the active cart, creates an immutable
  revision only when its intent changes and safely releases unsubmitted holds.
- `cm_prepare` reserves slots through `ct_reserve`. Capacity and KYC rules remain
  in that coordinator. `cm_claim` permits one dispatch for one prepared invoice.
- Server-held product prices are authoritative. Changed pricing/config requires
  preparation again; submitted references retain their original routing version.
- Coupons support percentage/fixed amounts, total/per-customer limits, targeted
  email, dates, pausing and audited creation. Canonical email strips plus tags and
  Gmail dots/aliases for recipient and per-person enforcement. Coupon definitions
  are immutable except pause/resume; create a new code for changed financial terms.
- Tickets use the ticket owner's `tk_checkout` transaction contract. Ticket and
  coupon discounts do not stack. Prizes are never rerolled during payment retry.
- Confirmed declines release coupon capacity; the same immutable quote re-reserves
  on retry and fails closed if unavailable. Ticket ownership/prize stays intact.
- Partial/unknown outcomes do not expire holds. Free orders skip vendor calls and
  credentials, but still claim/settle discounts and slots transactionally.
- Positive card totals have a 50-cent floor; crypto totals require at least $10.
- The original restricted-country/subdivision policy and purchase email blocklist
  are retained. Typed legal name, billing region, canonical email, agreement URL,
  version, explicit electronic consent and evidence hash are immutable revision
  evidence with server timestamps. This is checkout consent, not a fabricated
  DocuSeal execution record or funded compliance approval.
- Paid settlement atomically consumes discounts, attributes affiliate commission,
  calls `ct_settle_order` and enqueues one checkout receipt. Issuance remains the
  existing durable Tradara worker's responsibility.

## HTTP and staff operations

Web and admin share `/api/commerce/[...path]` with fresh authorization, Origin
checks and private/no-store responses. Request bodies are bounded before parsing.

| Method | Route | Owner |
| --- | --- | --- |
| GET | `catalog`, `current`, `history`, `checkouts/:id` | Customer owner; admin has catalog/history/detail |
| POST | `save`, `prepare`, `charge`, `cancel` | Customer owner only |
| GET | `coupons` | `commerce:read` |
| POST | `products`, `processors`, `coupons`, `coupon-status` | `commerce:config`; reason required |
| POST | `attempts/:id/reconcile` | `commerce:recovery`; queue verified provider lookup, never mark paid manually |

Admin catalog reports processor configuration as web-managed because charge keys
are deliberately absent from the admin process. Recovery accepts a provider
transaction reference, then the web worker checks the original invoice, exact
amount and currency before accepting its result. Staff cannot assert payment.
History is bounded to 50 rows per page; detail returns the latest 20 attempts.

## Providers, callbacks and worker

Charge writes have a 15-second deadline and one attempt. Any exception after the
DB dispatch claim leaves an unresolved payment. There is no automatic charge
retry, gateway fallback or clearing of uncertain payments.

POST `/api/webhooks/commerce/{authnet,nmi,crypto}` verifies the current source
provider signatures and durably stores only deduplicated IDs. Provider payloads
with card/billing data are not retained. The worker re-fetches provider truth;
a browser return URL never marks a purchase paid. NMI timestamp signatures have
a five-minute replay window; stable provider event IDs deduplicate other signed
callbacks. Raw request payloads are limited to 64 KiB.

POST `/api/internal/payment-worker` uses `Authorization: Bearer
CERTA_PAYMENT_WORKER_SECRET`. Configure the existing canonical EC2 Python HTTPS
runner (`supporting-apps/workers`, in the parent deployment) to invoke this Vercel
endpoint. Payment processing remains on Vercel. Do not create another polling
script or give EC2 processor/Supabase credentials.

Each tick handles up to five callback jobs and five pending attempts. Pending
reads use compare-and-set cooldown claims; provider reads are idempotent, callback
settlement is transactionally idempotent. Unmatched/failing callbacks move to
staff review after 21 checks; unresolved attempts retain their holds. Backoff is
five minutes up to one hour. A tick makes at most 20 provider read calls with
15-second deadlines; Vercel runtime limit and runner timeout must accommodate the
configured batch or be reduced together. No charge is initiated by this worker.

Invoice recovery uses NMI's bounded order-ID Query API then the v5 payment read;
Authorize.net checks the latest 100 unsettled transactions then transaction detail.
An older/settled missing reference requires the provider transaction ID through
staff recovery. NOWPayments can resolve an existing hosted invoice to a payment
ID, then reads the payment. A missing invoice/create response with no callback
requires provider reconciliation; it is never permission to create another charge.

## Activation and verification

1. Reconcile the existing Supabase baseline, then apply commerce, tickets and
   email migrations together. Missing discount/email RPCs fail closed.
2. Configure all provider credentials on **web only**, the shared routing version,
   callback signing secrets and worker secret. Explicit sandbox/live environment
   values choose fixed provider origins; the default is sandbox.
3. Set `CERTA_CHECKOUT_TERMS_VERSION` and HTTPS `CERTA_CHECKOUT_TERMS_URL` to the
   reviewed current evaluation agreement. Missing terms disables checkout.
4. Configure verified Tradara plans, prices and processor enabled/routing versions
   in admin. Keep configuration versions aligned with deployment routing version.
5. Install signed callbacks and deploy the authenticated HTTPS runner. Email
   receipt triggers remain disabled until explicitly configured in the email app.
6. Reconcile historical open payments/accounts/discounts before switching traffic.

Tests include mocked provider contracts/signatures, zero-price no-network behavior,
original purchase restrictions and legal consent, full-schema PostgreSQL coupon
caps and aliases, immutable history, unknown-payment locks, owner/RLS denial,
duplicate fulfillment/receipts, tickets covering free purchases, and concurrent
cart/preparation/dispatch/settlement. No live gateway, live provider webhook or
production deployment verification was performed. Hosted tokenizer behavior still
requires sandbox merchant and browser verification before launch.

## Customer checkout experience

The overview has a compact creator-code row; applying/removing a code is an explicit
owner-authorized write to `cm_creator_preferences`. Checkout resumes a specific
`?checkout=<id>` or the customer's active cart. Creator codes are private preferences;
only approved codes belonging to another active affiliate can be saved.

The customer composition is an order summary beside the form on desktop and above
it on mobile. This was chosen over a single long form with a summary below it so
product, quantity, discount and payable USD stay close to the decision. The summary
uses the existing mountain still in a sage surface, with cream form surfaces and
one forest primary action. The flow is review → payment → account. There is no
repeated signup or artificial compliance checklist inside checkout.

- Review: live catalog/quantity, creator or coupon field, reward-ticket selection,
  prefilled legal identity/country, billing address for cards, explicit consent,
  Card/Crypto and the actual total. The ticket wallet owns claim/reveal; checkout
  never draws/rerolls a prize. No crypto bonus or creator discount is invented.
  Compact cards before Continue explain terminal recording, no refunds after
  trading begins, and the $1,500 end-of-day MLL. Learn more expands the trailing
  floor explanation in place without losing the checkout form.
- Payment: NMI Collect.js hosted fields or Authorize.net Accept.js tokenization,
  hosted crypto invoice, or explicit free-order confirmation. Billing facts are
  immutable consent evidence and sent to the selected card adapter for verification.
  Card fields/tokens are never put in React persistence, application logs or history.
- Declined: the customer reviews/retries explicitly and receives a new invoice.
  `prepare` accepts `card`; the server prefers enabled/configured NMI, then
  Authorize.net. After a confirmed decline, a deliberate new attempt prefers the
  other available card processor. There is no automatic charge/gateway fallback.
- Pending/unknown: preserve checkout/reference/discount holds. Read-only status
  refresh every five seconds while visible, at most 30 reads per active status
  phase, plus explicit refresh. No client Tradara reads or charge retries.
- Confirmed: payment confirmation is separate from issuance. The detail endpoint
  selects only this order's original purchase entitlements and their issued IDs.
  Mixed ready/pending/failed/compliance states stay attached to each evaluation.
  An outstanding Tradara invitation exposes trading setup and pauses automatic reads
  until the trader checks again. Account links select the exact account or slot. No new global account state.
- Return/resume: crypto success/cancel URLs contain the checkout ID; they never
  confirm payment. Reloading that URL restores its saved state, including paid or
  cancelled orders. A lazy, paginated purchase history links to saved order details.

`20260917060000_checkout_experience.sql` adds the creator preference and quote
functions, an immutable revision discount label, and approved creators' customer
`audience_discount_bps` (default zero). Admin `/commerce` configures this rate with
an audit reason, independently of affiliate commission. Existing submitted
attributions survive later creator suspension/discount changes.

`cm_quote` is a non-reserving estimate. `cm_save` re-calculates the best of the
creator offer, selected coupon or selected ticket, reserves only the winner and
verifies its final amount. Discounts do not stack; an inferior offer is not consumed.
Coupon availability/caps remain authoritative at reservation/claim. Client totals
never authorize a charge. Existing revisions and submitted attempts remain immutable.

New routes: customer GET `creator`, `context`; POST `creator`, `quote`; staff GET
`creators` and POST `creator-discount` under existing commerce permissions. Context
reads the canonical evaluation count so practice/funded accounts do not incorrectly
trigger the additional-evaluation compliance prompt. Capacity is still enforced by
`ct_reserve`; preview data cannot bypass it.

Provider references checked for this rebuild: [Authorize.net Accept.js](https://developer.authorize.net/api/reference/features/acceptjs.html),
[NMI Collect.js setup and CSP](https://docs.nmi.com/docs/quick-start-tutorial),
[NMI v5 Sale](https://docs.nmi.com/reference/create-sale-v5).
Collect.js is retained for the existing processor integration; NMI recommends its
Payment Component for new integrations. Function callbacks plus `blockEval` preserve
the checkout's strict CSP. Merchant tokenizer/sandbox checks remain an activation
requirement; browser fixtures are not a live merchant verification.

## Required environment and activation checklist

Only the monorepo root `.env` is read. Do not create app-specific environment files.
All processor secrets remain web-only; `scripts/run.mjs` already permits these names.
The template is `.env.example`; full environment ownership is in `ENVIRONMENT.md`.

| Purpose | Required names |
| --- | --- |
| Checkout | `CERTA_PAYMENT_ROUTING_VERSION`, `CERTA_PAYMENT_WORKER_SECRET`, `CERTA_CHECKOUT_TERMS_VERSION`, `CERTA_CHECKOUT_TERMS_URL` |
| Authorize.net | `AUTHORIZE_NET_API_LOGIN_ID`, `AUTHORIZE_NET_TRANSACTION_KEY`, `AUTHORIZE_NET_PUBLIC_CLIENT_KEY`, `AUTHORIZE_NET_SIGNATURE_KEY`, `AUTHORIZE_NET_ENV` |
| NMI | `NMI_SECURITY_KEY`, `NMI_TOKENIZATION_KEY`, `NMI_WEBHOOK_SIGNING_KEY`, `NMI_ENV` |
| NOWPayments | `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET` |
| Origins/identity | `WEB_ORIGIN`, `ADMIN_ORIGIN`, `API_ORIGIN`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `CERTA_AUTH_CHALLENGE_SECRET` |
| Account issuance | `TRADARA_API_BASE_URL`, `TRADARA_FIRM_API_KEY`, `TRADARA_FIRM_ID`, `TRADARA_WEBHOOK_SECRET`, `TRADARA_LOGIN_URL` |

The routing version must equal enabled processors' versions in admin. Use a new
version for merchant/configuration changes. Terms require the reviewed agreement's
version and HTTPS URL. Card environments are `sandbox` or `production` (`live` is
also supported). Crypto uses NOWPayments' production API; no sandbox mode is inferred.
The canonical `WEB_ORIGIN` must be HTTPS for crypto callbacks; the launcher derives
`CERTA_APP_ORIGIN`, which should not be maintained as a second root setting.

Configure signed callbacks at the web origin:

- Authorize.net: `/api/webhooks/commerce/authnet`
- NMI: `/api/webhooks/commerce/nmi`
- NOWPayments: `/api/webhooks/commerce/crypto` (included in invoice creation)

The existing authenticated payment runner must invoke `/api/internal/payment-worker`
with the shared worker secret. The Tradara service must separately be running with
its worker-only firm API credentials and verified enabled evaluation/funded plan
mapping. Confirmed payment atomically creates the purchase entitlement; the canonical
worker issues it as soon as it can. This is not a promise of synchronous vendor issuance.
Receipt delivery additionally needs the existing email configuration and enabled
receipt trigger. No worker is started against production by this implementation.

Local key-presence check on 2026-09-17 found processor credential entries present,
but the routing version, payment worker secret, terms version/URL, Tradara firm ID
and trading login URL absent. Presence does not verify merchant credentials. No
secret values were printed or copied. Migration baseline reconciliation, deployment
configuration, enabled catalog/processors, callbacks and merchant verification remain
external activation work; these changes do not apply a production migration.

Read-only diagnosis on 2026-09-19 found the checkout terms, routing version and
card credential entries present. The connected database is missing
`20260917060000_checkout_experience.sql`: `cm_creator`, `cm_creator_preferences`,
`cp_codes.audience_discount_bps` and `cm_revisions.discount_kind` are absent.
This makes GET `context` return 503. Missing commerce schema now returns the
safe `commerce_not_ready` code instead of suggesting a connection retry.
The product and plan registries are also empty, and all three processors are
disabled. Apply the reviewed migration after baseline reconciliation, then
configure the approved plan mappings, product prices and processor routing through
staff operations. Do not seed guessed plans or enable charging to mask the error.
The full disposable PostgreSQL suite validates the migration and commerce
concurrency; it does not change the connected database.
