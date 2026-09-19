# Email ownership, editing and delivery

Certa owns templates and verified event producers; Resend delivers mail. The admin
app owns editing, previews and explicit AI draft requests. **Delivery is disabled
by default.** Saving or previewing a template never sends it. No production database
migration, provider setting or live send is part of this migration.

## Migrated inventory

All 25 original `lib/email/catalog.ts` definitions are available in admin `/emails`:

- Access: login code, signup code, password reset, account invite.
- Purchases: receipt; crypto started, partial, processing and failed.
- Tickets: existing-account claim, guest claim, friend invitation and referral reward.
- Trading: evaluation failed, funded onboarding ready/required, funded issued.
- Payouts: operations request, approved, rejected.
- Operations: chargeback, fraud warning, refund review, provisioning failure.
- Public: waitlist confirmation (marketing; retained as an inactive template).

The source inventory, editable fields, required variables and synthetic fixtures
live in `packages/server/src/email/transactional-catalog.ts`. Original code and
bearer-link variables are preserved, but codes never appear in subjects/titles.
Login expiry comes from the real challenge contract. Payout approval copy no longer
claims an external transfer already happened. Ticket claim copy covers all actual
assignments rather than falsely attributing every ticket to a solved puzzle.

Marketing and internal templates remain editable, but are rejected by the general
customer outbox until dedicated consent/recipient producers are implemented. Existing
newsletter delivery remains in its separate consent-aware content worker. Guest
invite/claim bearer links and auth codes never enter the general outbox.

## Staff workflow and API

`GET /api/emails/templates` returns current revisions, variable schemas and fixture
copy. The screen supports filtering, variable insertion, text editing, HTML/plain
text preview, history, restoring a prior draft and resetting original copy.

- `POST /api/emails/preview`: synthetic fixture only; no address parameter or send.
- `POST /api/emails/save`, `/reset`: compare expected revision atomically and append
  immutable history. Stale saves return `409 conflict`.
- `GET /api/emails/history/:id`: latest 30 revisions.
- `GET /api/emails/deliveries`: latest 100 safe delivery metadata records; no bodies,
  recipients or auth secrets.
- `POST /api/emails/generate`: one explicit Anthropic request, structured JSON copy,
  bounded prompt/output, 60-second timeout; no automatic paid retry. A persisted
  generation ID prevents replay; per-staff limit is 20 requests/hour. Unknown
  results require a new deliberate staff action. AI output cannot change links,
  remove required variables or execute code. It loads as an unsaved draft.

Every endpoint verifies fresh staff identity, `emails:read`, and write actions also
require `emails:write`; AI additionally requires `emails:generate`. Same-origin
mutation protection and private no-store responses apply. Browser previews use a
sandboxed iframe. Only escaped text and HTTPS links render; generated HTML/JSX is
never executed. AI sees the selected copy, variable names, trigger description and
staff brief, never customer rows or actual preview identity. Staff must not paste
customer records or secrets into briefs. Uses the existing server-only
`ANTHROPIC_API_KEY` and `ANTHROPIC_NEWSLETTER_MODEL`; the admin receives no Resend key.

## Trigger contracts and queue

Migration `20260917030000_emails.sql` creates service-role-only tables with RLS:
`ce_templates`, `ce_revisions`, `ce_outbox`, `ce_suppressions`, `ce_generations`.
All trigger rows start with `enabled=false`. The admin has no implicit activation
or arbitrary-send action. Reconcile the production migration baseline before apply.

The SQL producer is:

```sql
select public.ce_enqueue(
  'stable-business-event-id', 'checkout_receipt', verified_user_id,
  jsonb_build_object(
    'receipt.total', '150.00 USD',
    'receipt.lines', 'Evaluation — 150.00 USD',
    'receipt.orderReference', verified_checkout_id,
    'receipt.paidAt', verified_paid_at,
    'siteUrl', 'https://certafutures.com',
    'loginUrl', 'https://certafutures.com/login'
  )
);
```

Call it **inside the business transaction**. Do not enqueue from browser completion,
GET requests, page mounts, or unverified provider returns. `enqueueTransactionalEmail`
is the typed server adapter for already-durable event consumers. It accepts a user
ID, never an arbitrary delivery address. Per-template data rejects unknown fields.
The renderer requires every referenced variable; no production fixture fallback.

Commerce payment settlement queues `checkout_receipt`. `ce_ticket_claimed` appends
`ticket_claim_account` when `tk_tickets.claimed_at` first becomes non-null, atomically
with assignment. Ticket events contain title/position and the public authenticated
tickets URL, never claim codes or hidden prizes. Other migrated definitions retain
explicit trigger descriptions and contracts for later producer configuration;
copying them does not silently subscribe every existing business operation.

`TransactionalEmailWorker.tick()` claims one job per call. PostgreSQL SKIP LOCKED
leases coordinate replicas. Enqueue freezes the template revision; first preparation
freezes actual recipient, rendered body and sender for retries. Recipients come from
a fresh Auth Admin user lookup and require verified email. Suppressions are checked
on every attempt, including frozen retries. Per-event/user/template uniqueness and
conflicting-payload rejection protect replay. At most six attempts, bounded backoff,
and a 23-hour fence prevent retries outside Resend's 24-hour idempotency window.
Ambiguous expired results become `unknown` for review, never a fresh send key.
`accepted` means provider acceptance, not inbox delivery.

Web/content delivery requires `EMAIL_DELIVERY_MODE=live`, `RESEND_API_KEY`,
`EMAIL_FROM`, optional `EMAIL_REPLY_TO`, and deliberately enabled template rows.
Sender/domain checks and bounce/complaint webhook activation remain deployment
work: use signed provider evidence to populate `ce_suppressions`; never trust a
public unsigned suppression mutation. Do not enable business sending before that
operational setup. Database suppression tests exercise bounce/complaint records.

## Customer challenge delivery

The customer authentication owner invokes `sendLoginChallenge({id,user,data})` only
for an authorized, unexpired application challenge. `data` is `{code,
expiresInMinutes}`; the user is server-verified. The adapter uses the stored
`login_pin` revision, renders the credential only in memory, and sends one Resend
request. `EMAIL_DELIVERY_MODE=disabled` fails closed before any DB/network access.
Neither code nor body is saved in outbox, generation history or logs. Challenge
hashing, attempts, resend quotas, expiry and full-session gating belong to auth.
Never retry a challenge with a newly rendered body under its old provider key;
a resend creates a new authorized challenge/delivery event.

The earlier static `auth-login-code` and `password-reset` template exports remain
compatible for existing offline fixtures. The customer challenge uses editable
`login_pin`. Supabase recovery remains on its existing delivery settings until a
verified Send Email Hook is configured. Do not send an additional reset email in
parallel with Supabase. A global hook must cover all enabled Auth actions and verify
raw-body signatures/timestamps before replacing existing delivery.

## Verification and preview

```sh
pnpm email:preview
pnpm email:preview checkout_receipt
node --conditions=react-server --import tsx --test tests/email*.test.ts
node scripts/test-email-db.mjs
```

Offline preview writes HTML/text/schema fixtures under ignored `.email-preview/`.
No env files, real user records, real credentials, AI requests or sends are read.
The disposable PostgreSQL fixture uses localhost and covers negative grants/RLS,
secret rejection, template revision conflicts, replay/concurrent claim fencing,
suppression, ticket-trigger atomicity and provider-window expiry. Unit tests cover
all 25 templates, escaping, runtime contracts, AI validation/one-attempt semantics,
frozen retry payloads and disabled delivery. Actual inbox/client rendering,
production baseline/data migration and live provider activation remain unverified.
