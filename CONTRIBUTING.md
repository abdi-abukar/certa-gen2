# Change and vendor policy

Read `AGENTS.md` and `STRUCTURE.md` first. For email work, also read `EMAILS.md`.
These instructions apply to human and AI-authored changes.

## Every code change

1. State the requested user outcome and affected apps. Keep unrelated migrations out.
2. Inspect the current implementation and relevant installed framework documentation.
3. Identify the existing owner. Put the change there; create a folder/package only
   when there are related files, real shared consumers, or a security boundary.
4. Keep one implementation of each rule. Delete superseded paths and unused dependencies.
5. Validate inputs where they cross HTTP, database, vendor, or authentication boundaries.
6. Define error behavior, retries, authorization, and cache behavior before enabling a side effect.
7. Run relevant tests, type checks, and affected app builds. Auth changes also run
   `pnpm test:http`; native session changes also run the mobile export and device checks
   appropriate to the change. State what was not tested.
8. Update the structure map and vendor status when behavior or ownership changes.

For a migration, identify the useful rule/design from the old repo, then implement
the smallest independent version here. Copying a component does not authorize
copying its old provider tree, cron jobs, tables, or vendor credentials.

## Adding a vendor

Record these decisions in its policy/README before activation:

| Decision | Required answer |
| --- | --- |
| Purpose and owner | What need it serves; which server/app calls it |
| Data sent | Exact fields, recipient, sensitivity, and retention expectations |
| Credentials | Root `.env` names, allowed processes, rotation, public/private classification |
| Adapter | One implementation, narrow exports; no SDK calls scattered through pages |
| Failure behavior | Timeout, retryable errors, retry budget, and user-visible result |
| Duplicates | Stable event IDs and provider/application idempotency behavior |
| Inbound callbacks | Signature verification, replay handling, body limits, authorization |
| Usage | Rate limits, pagination, concurrency, and whether a worker is actually needed |
| Validation | Mock tests, integration checks, and explicit live activation status |

Never spread a full environment object into another process or client bundle.
Extend `scripts/environment.mjs` intentionally and test both the allowed recipient
and the apps that must not receive the secret. Add only the credentials for the
approved vendor; don't copy the old `.env` wholesale.

Side effects belong to verified server operations. A UI render, component mount,
GET request, or successful page load must not silently send mail or charge money.
Mock tests and previews must be unable to perform live side effects.

## Authentication and cache changes

- Verify identity/permissions in every protected operation. Do not rely on page state.
- Never put sessions or user data into shared caches. React `cache()` may be used
  for request-scoped deduplication; persistent cache helpers require separate review.
- Auth/private responses and identity fetches use `no-store`. Responses setting
  cookies must never be cached by a proxy/CDN.
- Invalidate the Next client cache after authentication mutations. Test user A,
  sign-out, user B, invalid credentials, expired tokens, and concurrent users.
- Key private UI state by user/session identity. Clear or hide it immediately on
  identity changes and ignore late results from a previous identity.
- Do not call an email-code screen a security control unless every protected API
  and data-access path enforces verification. Keep admin's agreed Cloudflare +
  email/password model unless explicitly changed.

## Completion criteria

Report implemented behavior, tests, and remaining external activation separately.
"SDK installed", "preview renders", "provider accepted", and "delivered" are
different states. Do not mark delivery or production protection verified without evidence.

Vendor schema, health contracts and cadence are required: follow `VENDORS.md`. Add lifecycle and probe scope separately so service reachability never implies business readiness.

## Streaming and high-volume integrations

For every new route/consumer, record: upstream calls per trigger, pagination bound,
shared credential budget, data freshness, event/backfill owner, and whether the
same work already runs elsewhere. Document steady-state and outage/reconnect load.
A WebSocket does not eliminate bandwidth, DB-write or fan-out costs. Bound queues,
coalesce only replaceable display state, persist replay checkpoints correctly, and
test slow consumers plus session revocation. Long-lived collectors require a real
worker owner and cross-replica coordination. Follow `TRADARA.md` for this vendor;
its proposed architecture is not yet live. Documentation-only plans need source
and consistency checks; code/runtime validation applies when implementation changes.
