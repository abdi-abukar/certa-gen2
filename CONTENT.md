# Newsletter and weekly puzzle backend

## Ownership and activation

`packages/server/src/content` owns the APIs, validation, Claude adapter, image
normalization, durable deliveries and puzzle reward handoff. React newsletter
layout lives in `email/templates/newsletter.tsx`; serialization lives in
`content/render.tsx`. `services/content` sends frozen messages through the existing
Resend adapter. Web/admin use thin `/api/content/[...path]` routes.

This implements the backend and saved template catalogue. Admin `/puzzles` now owns
clue drafts, image/GIF upload, ticket-definition links, caps, scheduling and cancellation.
The customer homepage puzzle dialog reads the current clue, submits verified-user
answers and reads confirmed reward state. Newsletter editing and the ticket engine
remain separate consumers. No production migration,
mail delivery, paid generation or legacy cron cutover has been performed.

- Puzzles stay **weekly: Sunday 17:00 America/Toronto**, through the following
  Sunday at 17:00. PostgreSQL computes both ends in civil time, including DST.
- Puzzles use no AI. The configurable `reward_ticket_id` is the only ticket
  collection reference an admin needs to enter. Use the UUID of an active
  reward collection from admin `/tickets`; scheduling verifies inventory.
- Newsletters have **no ticket fields or reward behavior**. An explicit Go live
  request publishes the issue immediately and snapshots active, consented rows
  from the existing `newsletter_subscribers` table into the delivery queue.
- Existing subscriber IDs, consent and suppression are preserved. New subscription
  requires a signed-in, email-verified user explicitly submitting consent. This
  endpoint does not silently reactivate unsubscribed/bounced addresses. Guest
  double-opt-in signup is not added here.

## Configuration

Root `.env` only; restart processes after changing it. Never copy keys into UI.

| Setting | Owner / purpose |
| --- | --- |
| `SUPABASE_SECRET_KEY` | Existing service credential for protected server operations |
| `PUZZLE_ANSWER_KEY` | Web/admin; random secret of at least 32 characters, used for per-puzzle answer HMACs. Keep stable for scheduled/live puzzles. |
| `ANTHROPIC_API_KEY` | Admin only; explicit draft generation |
| `ANTHROPIC_NEWSLETTER_MODEL` | Admin only; set a model enabled for your account with JSON structured output and vision support; no guessed default |
| `ANTHROPIC_HEALTH_ENABLED` | Admin only; optional public provider status probe |
| `NEWSLETTER_POSTAL_ADDRESS` | Web/admin; real Certa postal address included in all rendered footers |
| `EMAIL_FROM`, `EMAIL_REPLY_TO` | Existing sender config; admin freezes these at publication; delivery credentials remain separate |
| `RESEND_API_KEY` | Web's existing transactional owner and content worker's marketing delivery boundary |
| `NEWSLETTER_DELIVERY_MODE` | Content worker only; `disabled` by default, `live` explicitly enables draining the queue |
| `RESEND_NEWSLETTER_WEBHOOK_SECRET` | Web only; Resend `whsec_...` signing secret |
| `WEB_ORIGIN` | Existing canonical web origin. Must be public HTTPS for email unsubscribe links before enabling sending. |

`EMAIL_DELIVERY_MODE` and the inactive auth email triggers are unchanged. Marketing
has its own explicit switch. Start worker with `pnpm dev:content` or
`pnpm --filter @certa/content-service start`. One send per tick per worker replica,
90-second row leases; deploy one replica initially (one request/second maximum).

Reconcile `20260916010000_content.sql` against the target project's migration
history before applying. It reuses `newsletter_subscribers`; it does not read or
mutate legacy `newsletter_issues` or `newsletter_deliveries`. Disable the legacy
newsletter sender/cron before switching the admin publication UI. Finish/reconcile
its existing queue first; do not publish the same issue in both systems. Import
historical issues separately if the public archive should show them.

The migration creates the public `certa-content` storage bucket on Supabase. Verify
that an existing bucket with that ID has the expected public visibility, 4 MB limit,
and image MIME allowlist. Do not add browser write policies. These are intentionally
public editorial assets, never KYC, private customer images or drafts containing
confidential information. Uploads are decoded, limited to 16 million pixels,
resized to 1600px, converted to WebP and stripped of metadata. GIF and animated
WebP preserve their frames and timing, with a 100-frame and 16-million-total-pixel
budget. SVG and malformed inputs are rejected. Animation previews are explicitly
opened/hidden by the user. UUID object paths are immutable. Retain referenced
images for old email links; periodically delete orphan uploads with no `cn_assets`
row after a grace period. Failed uploads never overwrite an existing asset.

## HTTP contract

All routes below are relative to `/api/content`. Lists return at most 50 rows;
`?offset=0` advances by 50 (maximum 100,000). Responses are no-store. Errors have
`{error: code}`; validation 400, unauthenticated 401, forbidden 403, missing 404,
revision/state conflict 409, oversized 413, rate limit 429, unavailable 503.

Admin requires fresh staff identity plus `app_metadata.content_permissions`:
`content:read`, `content:write`, `content:generate`, `content:publish`, or
`content:*`. Every admin route requires read; mutation permissions are additional.
Cookie POSTs require the admin Origin; verified bearer callers are supported.
Permissions cannot come from editable `user_metadata`.

### Admin newsletters

| Method / route | Operation |
| --- | --- |
| `GET newsletter/templates` | Saved template IDs/versions, JSON schema, synthetic fixture |
| `POST assets` | Raw PNG/JPEG/WebP bytes, maximum 4 MB; returns `{id,url,mime}` |
| `GET assets` | Uploaded image catalogue |
| `POST newsletter/generate` | `{template,brief,image_ids:[]}`; `Idempotency-Key` required (8–100 letters/digits/underscore/hyphen) |
| `GET newsletter/generations/{id}` | Generation status/result; interrupted requests show unknown |
| `POST newsletter/render` | Newsletter content JSON directly; returns `{subject,html,text}` without saving/sending |
| `POST newsletter/issues` | `{id,revision,content}`; client-generated UUID, revision 0 creates; existing revision edits a draft |
| `GET newsletter/issues` | Issue list |
| `GET newsletter/issues/{id}` | Issue and revision |
| `GET newsletter/issues/{id}/render` | Actual React preview; published issues return immutable saved render |
| `POST newsletter/issues/{id}/live` | `{revision}`; atomic audience snapshot and publication, repeat is idempotent |
| `POST newsletter/issues/{id}/cancel` | `{}`; cancels unstarted delivery; in-flight mail cannot be recalled |
| `GET newsletter/issues/{id}/deliveries` | Paginated delivery status and safe errors |
| `GET newsletter/subscribers` | Paginated subscriber addresses, consent and status; no unsubscribe tokens |

Example `content`:

```json
{
  "template": "digest",
  "subject": "This week at Certa",
  "preheader": "Community news",
  "title": "Your weekly update",
  "sections": [{
    "heading": "Sunday puzzle",
    "text": "The next clue arrives Sunday at 5 PM Toronto time.",
    "image_id": null,
    "image_alt": "",
    "button_label": "Visit Certa",
    "button_url": "https://certafutures.com/"
  }]
}
```

Use `digest` or `announcement`, 1–12 sections. Image references are uploaded asset
UUIDs; alt text is required with an image. Empty strings mean no optional heading,
preheader or button. Text is escaped by React, never interpreted as JSX/HTML.
Buttons require HTTPS URLs and labels. No arbitrary custom component execution.

Recommended admin flow: select template -> upload public editorial images ->
write content or generate a suggestion -> review/edit -> save -> render preview ->
Go live with the reviewed revision. Claude returns a suggestion; it never publishes
or sends. Retrying an identical generation key returns its existing job/result;
changing input with that key conflicts. One concurrent generation globally, 20 per
staff member and 200 globally per rolling day, 60-second timeout, 4,096 output tokens,
12 KB brief and four images maximum. Unknown/interrupted jobs are not automatically
rebilled; a new key explicitly requests a new paid attempt. Model/prompt changes do
not change an existing keyed attempt. Store model, provider ID and token usage in
its result; no subscriber records enter generation. The result records `prompt_version: 1`; increment it for released prompt changes.

The renderer uses React DOM's email-safe static HTML. Preview is a JSON response
so the editor can use a **sandboxed iframe `srcDoc`**, not inject it into admin DOM.
Allow the configured storage image host in the editor's CSP when building that UI.
The same serialized HTML/text is frozen on Go live; only the opaque unsubscribe
marker is replaced per recipient. Different email clients can render CSS differently;
identical source does not guarantee pixel equality in Outlook/Gmail/etc. Sender,
reply-to, subject and bodies remain unchanged on delivery retries. Use a new draft
ID for a new edition. `pnpm newsletter:preview` renders invented fixtures locally
without environment credentials or sending anything.

### Admin puzzles

| Method / route | Operation |
| --- | --- |
| `GET puzzles` | Draft/scheduled/cancelled list, mask only; answers/hashes never returned |
| `GET puzzles/{id}` | One puzzle with its image URL for the admin editor |
| `POST puzzles` | `{id,revision,puzzle}`; UUID plus revision 0 to create, current revision to edit a draft |
| `POST puzzles/{id}/schedule` | `{revision}`; schedule this Sunday date (or publish an ongoing drop); one scheduled puzzle per date |
| `POST puzzles/{id}/cancel` | `{}`; prevents new guesses; keeps already-earned rewards |
| `GET puzzles/rewards` | Pending/granted/failed reward records for support |

```json
{
  "id": "a7905392-a3c9-4b14-8489-4c7e844144d8",
  "revision": 0,
  "puzzle": {
    "prompt": "Your clue goes here",
    "image_id": null,
    "answer": "YOUR ANSWER",
    "reward_ticket_id": "REPLACE_WITH_REWARD_COLLECTION_UUID",
    "reward_cap": 100,
    "live_on": "2026-09-20"
  }
}
```

Answers normalize to uppercase alphanumerics, at most 24 characters. Only per-puzzle
HMAC and an underscore mask are persisted. Scheduling freezes the puzzle; changes
require cancelling and creating a replacement. No scheduler needs to flip a row at
17:00: the read and claim queries check the computed start/end instants directly.
A missing week's puzzle returns null rather than reviving an expired drop.

### Web/customer endpoints

| Method / route | Access / response |
| --- | --- |
| `GET puzzles/current` | Public current clue, mask, asset URLs, capacity and schedule; `{item:null}` when no drop |
| `POST puzzles/{id}/guess` | Verified user, `{guess}`; server binds user ID; at most 10 attempts/hour/puzzle |
| `GET puzzles/rewards` | Only the caller's rewards and actual ticket grant status; optional validated `?puzzle_id=UUID` narrows recovery to one puzzle |
| `GET newsletter/issues` | Public published archive, excludes cancelled issues |
| `GET newsletter/issues/{id}/render` | Public frozen published email render; no recipient token |
| `POST newsletter/subscribe` | Verified user's email only, `{consent:true,email?}`; optional footer email must match the verified identity; preserves suppression |
| `GET newsletter/unsubscribe?token=...` | Confirmation form, no mutation on GET |
| `POST newsletter/unsubscribe?token=...` | Random 256-bit token authorizes unsubscribe; accepts RFC 8058 one-click POST without cookies/Origin |

Correct guesses create one pending reward per user/puzzle inside the same locked
transaction that increments capacity. Wrong attempts persist; duplicate correct
submissions return the same reward even when full/closed. At capacity a new correct
guess returns sold_out. Public/member routes cannot approve rewards or configure IDs.

## Connected exact-inventory tickets

Set `reward_ticket_id` to the UUID of an active **Weekly puzzle rewards**
collection created in admin `/tickets`. [TICKETS.md](TICKETS.md) owns prize
inventory, claims, scratch/reveal, checkout holds and manual fulfillment.
Scheduling requires an active reward collection with enough remaining inventory.

The ticket migration adds `tk_puzzle_grant`: a new `cn_puzzle_rewards` insert
issues a real ticket and completes the reward in the same database transaction.
The stable source is `puzzle-reward/{reward UUID}`. A depleted pool rolls the
new reward back; it never substitutes a prize or reports fabricated issuance.
The answer endpoint re-reads the confirmed reward, and the customer dialog links
to `/tickets` after a real grant is confirmed.

Historical pending rewards use `dispatchPuzzleRewards(grantPuzzleTicket)` in the
existing content worker every ten seconds. It reads at most 50 eligible entries,
reuses the durable source key after a crash, and completes through service-only
`cn_complete_reward`. Each failed entry receives a persisted one-minute retry
delay, so an invalid pool does not block other rewards. No timer releases ticket
inventory or changes the prize. No public/admin endpoint can mark rewards granted.

Tests cover grant-before-completion recovery, failure isolation, duplicate source
keys, owner access, atomic puzzle issuance and exhausted inventory. Legacy grants
are not automatically reissued; historical IDs require reconciliation before any
production migration or dispatcher activation.

## Delivery evidence and recovery

- Configure Resend webhook to web `/api/webhooks/newsletter`, events
  `email.delivered`, `email.bounced`, `email.complained`, and matching signing secret.
  HMAC verifies raw bytes, signed ID and timestamp within five minutes before parsing.
  Replays dedupe by signed event ID. Provider-ID correlation is transactionally
  serialized with send completion, including events arriving before the HTTP response.
- `accepted` means Resend accepted, not inbox delivery. Bounces/complaints suppress
  all later marketing for that subscriber, including when arriving out of order.
- Lease recovery retries the same frozen payload/key, at most five attempts, with
  exponential backoff. Stop after 23 hours from first attempt, before Resend's
  24-hour deduplication expiry. Unknown outcomes show `unknown`, issue `attention`.
  Do not reset these to pending or use new keys without provider reconciliation.
- Reconcile unknowns using Resend logs and `newsletter/{delivery UUID}`. If an
  accepted provider ID is confirmed, record that evidence and status using a reviewed
  service-side repair; if absence is confirmed and a resend is authorized, create a
  separately audited intent. There is no blind force-resend endpoint.
- Cancellation/unsubscribe suppress pending recipients and are rechecked before each
  send. An already-started provider request cannot be recalled; ambiguous attempts
  remain unknown instead of being mislabeled skipped. Provider callbacks may still
  arrive after cancellation.
- With zero audience, publication completes immediately. Otherwise completed means
  dispatch finished; recipients may still be accepted rather than delivered. Failed,
  unknown, bounced or complained outcomes produce attention. Delivery list contains
  detailed states. A cancelled issue retains its audit and delivery history.
- Tables are API-only, RLS enabled, no anon/authenticated table or RPC grants.
  Audit records actor/action/resource without raw editorial secrets or subscriber PII.
  Never log unsubscribe tokens, answer hashes, provider secrets or raw webhook payloads.

Retention: retain issues/assets while archive and email links need them; retain
subscriber suppression until an explicit consent policy replaces it. Generation
records retain output and usage (not original briefs or image bytes); review a
retention job before growth warrants one. Keep delivery/provider evidence through
your support/reconciliation window; do not purge pending/unknown work. New tables
are separate from legacy ticket state; no legacy puzzle grants are reissued.

## Verification

`pnpm test`, `pnpm typecheck`, web/admin production builds, `pnpm test:http` with
local GoTrue/PostgREST fixtures, and `pnpm test:tradara-db` against a disposable
PostgreSQL instance. Tests cover normalization, safe React output, malformed images,
provider failures, signed callbacks, frozen retries, consent/suppression, revision
conflicts, early/out-of-order delivery events, TTL cutoff, Sunday DST, guess limits,
capacity/deduplication and direct database access denial. No real sends or paid
Claude requests are part of tests. Email-client visual verification and live vendor
credentials remain deployment checks.

Primary references: [Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs),
[Resend sending](https://resend.com/docs/api-reference/emails/send-email),
[Resend webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests).

### Verification result

All 82 unit tests pass, including GIF timing preservation, animation frame limits,
customer response validation and confirmed ticket-grant evidence. Workspace typechecks
and both production builds pass. The real Next HTTP fixture checks staff read/write/
publish boundaries, upload rejection and puzzle-filtered reward ownership without
live vendor calls. Desktop (1440px) and mobile (390px) browser fixtures cover the
customer dialog, wrong/correct answers, pending grants, empty/unavailable states,
Escape dismissal, staff draft save, answer masking and scheduled-field locking.
Production content configuration, publication and ticket issuance remain unactivated.

## Puzzle interfaces

Staff `/puzzles` uses the existing `content:read`, `content:write` and
`content:publish` API permissions. Staff entry also requires fresh Certa staff
identity. Lists paginate by 50. Draft saves retain server revisions; editing an
existing draft requires re-entering its answer because saved hashes are never
returned. Scheduling freezes the saved revision; cancellation preserves rewards.
Unknown mutations require a saved-record reload rather than an automatic retry.

The homepage dialog makes one public current-puzzle read and one identity-scoped,
puzzle-filtered reward read when opened/refreshed. It does not poll. Answer writes
are explicit and never automatically retried. An unknown submission requires a
reward-status refresh. Closing aborts outstanding browser requests and unmounts
private state. The countdown inside a live puzzle uses its server `ends_at`; the
hero countdown remains the next scheduled Sunday, not proof of availability.

The puzzle foil represents the reward collection. Once its real ticket grant is
confirmed, the customer opens `/tickets` to scratch or reveal the stored prize.
The connected ticket engine is owned by the monorepo, with no legacy runtime import.
The local current-puzzle API returned `503 content_not_configured` during this
work; no live puzzle, production migration, ticket import or issuance was activated.
