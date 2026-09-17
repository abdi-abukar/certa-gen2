# Email policy and authoring guide

## Decision and current status

**Certa owns email content and trigger logic. Resend delivers our emails, including
customer login codes and password resets.** Supabase remains the identity/token
authority where its Auth flows are used. We do not want separate default Supabase
email designs or duplicate deliveries alongside Resend.

This phase builds the foundation only, as requested. Two templates are available:
`auth-login-code` and `password-reset`. Both trigger definitions are inactive and
`EMAIL_DELIVERY_MODE=disabled`. No email has been sent. No Supabase hook, SMTP setting,
challenge table, or live auth behavior has been changed.

The existing recovery action still calls Supabase's recovery API. Until the custom
delivery hook is connected, actual recovery delivery continues to follow the
existing project's settings. The Resend foundation is not yet that live connection.

## Ownership and flow

```text
verified server event / verified auth hook
  -> trigger's eligibility and recipient checks
  -> allowlisted user context + validated event data
  -> one template's HTML + plain text
  -> shared Resend adapter
  -> accepted message ID
```

| File | Responsibility |
| --- | --- |
| `packages/server/src/email/schema.ts` | User context, variable inventory, event types and runtime schemas |
| `email/catalog.ts` | Template IDs, versions, schemas, renderers, synthetic fixtures |
| `email/templates/<id>.ts` | One email's subject, copy, layout composition and text version |
| `email/layout.ts` | Certa shared branding, header/footer, table layout, buttons |
| `email/render.ts` | Shared transactional layout composition |
| `email/triggers.ts` | Event ownership, eligibility contract, activation state and dispatch |
| `email/resend.ts` | Credentials, bounded HTTP delivery, provider errors and idempotency header |
| `scripts/email-preview.mts` | Offline fixtures -> HTML/text/schema files; never sends |

Use `@certa/server/email` from approved server operations. There is no public
"send any email" endpoint. Native and browser apps never receive Resend credentials.
The web server is the delivery owner, including future auth-hook deliveries for all apps.

## Template variables

The schema is a TypeScript contract plus runtime validation and a machine-readable
field inventory. It is not a new database table. `EMAIL_VARIABLES` describes shared
fields; each template's catalog entry adds its own JSON schema and sample data.

| Variable | Source | Meaning/trust |
| --- | --- | --- |
| `user.id` | Verified Supabase `user.id` | Recipient's account identifier |
| `user.email` | Verified Supabase `user.email` | Delivery address; never metadata.email |
| `user.displayName` | `user_metadata.full_name` or `name` | Display only; not a verified legal name |
| `user.firstName` | `first_name` or display-name first word | Display only |
| `user.username` | `user_metadata.username` | Display only; empty when unavailable |
| `user.greeting` | First name, username, or `there` | Safe fallback, including missing profiles |
| `user.emailConfirmed` | `email_confirmed_at` | Confirmation status; does not itself authorize an email |
| `brand.*` | `EMAIL_BRAND` | Name, short name, domain, support email |
| `data.code` | Authorized unexpired challenge / verified Auth hook | Sensitive; login-code email only |
| `data.resetUrl` | Token authority + validated application redirect | Sensitive; password-reset email only |
| `data.expiresInMinutes` | Actual challenge/token configuration | Must agree with the real expiry |

Access properties directly in the template: `context.user.greeting` and `data.code`.
There is no arbitrary expression evaluation or interpolation of an entire user object.
The full Supabase record, roles, phone number, access/refresh tokens, and unrelated
metadata do not enter the email context. Add a field only for a concrete template need.

Use `contextFromUser()` after a verified server lookup or signed hook. Display
metadata remains untrusted: escape it before HTML insertion. Missing required
event data fails validation; never silently drop a reset link/code or substitute fake values.

## Adding one email (AI checklist)

1. Define its ID, category, exact event, recipient rule, and user purpose. An email
   with promotional content is marketing, even if an account event starts it.
2. Add its typed data shape and runtime validator in `schema.ts`. List required
   fields, limits, sensitive values, and where each comes from. No generic `vars: any`.
3. Create `templates/<id>.ts` with its subject, HTML and plain text. Reuse the shell
   by default. A unique design may compose a different layout inside that file.
4. Register its version, validator, renderer and synthetic fixture in `catalog.ts`.
5. Add a typed event and trigger entry. Real business logic belongs in the owning
   feature operation, which emits the event after its authoritative outcome. Do not
   put a database query or provider call inside a template.
6. Define deduplication, retry limits, expiry, suppression/consent rules, and what
   happens if delivery fails. Keep the trigger inactive until its producer is ready.
7. Test required variables, recipient selection, negative eligibility, escaped
   HTML, text fallback, duplicate/retry behavior and error redaction.
8. Run `pnpm email:preview <id>` and inspect the HTML/text at narrow and wide widths.
   Check actual mail clients before releasing a materially changed layout.
9. Record the active producer in this document and activate that trigger deliberately.
   No automatic activation simply because a template was added.

### Redesigning one email

Edit only `templates/<id>.ts` for its individual design/copy. Keep the same variable
contract and trigger when behavior is unchanged. Update its version for a released
change and regenerate its preview. Shared `layout.ts` edits affect all templates;
review all previews when changing it. Do not create a separate copy of the sender
or trigger just to change appearance.

```sh
pnpm email:preview
pnpm email:preview password-reset
```

Outputs are local ignored files under `.email-preview/`, including HTML, plain text,
each template's schema, and `variables.json`. All fixtures are invented. No user
queries, environment secrets, provider calls or actual tokens are used in previews.
The logo currently references the existing public Certa logo URL from the old shell.

## Authentication delivery: the next integration

### Password reset and Supabase-owned email OTP

Use a **Supabase Send Email Hook** for repo-owned templates and Resend API delivery.
Supabase creates and verifies the recovery token/OTP; our signed hook handler renders
and sends the message. Calling Supabase's recovery API does not require Supabase's
default mailer once that hook is configured.

Before enabling it: implement a bounded POST handler; verify raw-body signatures
and timestamps with a maintained Standard Webhooks verifier; validate the event;
build verification URLs from the configured Supabase origin and allowlisted app
redirects; select the recipient according to the Auth action; call our Resend adapter.
Use the hook's stable message ID for deduplication. Reject unsigned/stale input and
never log hook payloads. The handler returns success only after Resend accepts delivery.

The hook replaces SMTP for Auth messages. Cover every currently used Auth action
before switching the existing project: signup, recovery, magic link/OTP, invite,
email change and reauthentication as applicable. Email change may require separate
messages/tokens for old and new addresses; do not reuse a generic `user.email`
recipient rule for that action. Test the real token-to-link mapping. A single
password-reset template is not sufficient to safely activate a global Auth hook.

Do not send a second email in the recovery action while Supabase's current mailer
also sends one. Resend custom SMTP is an alternative delivery configuration, but
it does not invoke our TypeScript templates; the selected target is the signed hook.

### Customer email 2FA after a password

If the customer flow requires password **plus** an emailed code, implement that
as a reviewed application challenge flow. Resend sends the code using our template.
It is not implemented by merely sending a Supabase passwordless OTP, and it must
not be described as Supabase `aal2` authentication.

Require cryptographically generated codes, dedicated HMAC secret, short expiry,
atomic attempt limits/consumption, durable resend limits, and binding to the user,
pending login/session and purpose. Withhold a fully usable application session
until verification. Test direct API and Supabase data access for bypasses across
web/mobile; a frontend route guard or unsigned `verified` flag is insufficient.
Choose the persistent schema and reconcile the existing database baseline before
implementing it. No plaintext codes in storage or logs, and no fallback to service-role
keys as challenge secrets. Admin remains email/password behind Cloudflare.

## Delivery, usage and security

- Root settings: `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_DELIVERY_MODE`.
  The existing Resend key was copied locally; sender/domain validity has not been
  verified by a live send. These settings project only into the web server process.
- Send one recipient per transactional request. Do not accept a recipient address
  from a browser when the server already knows the user.
- The adapter uses a 10-second timeout and performs one attempt. Retryable errors
  expose safe codes and optional `retryAfterSeconds`; no raw provider payloads.
- Retry the same logical event with the same idempotency key and rendered payload.
  Resend's deduplication window is 24 hours; it is not permanent exactly-once delivery.
- Before activating business-event sends, persist delivery intent atomically with
  the business transaction. A worker/outbox can then retry after crashes. No
  fire-and-forget promises or in-memory per-process cooldown maps.
- Persist only safe delivery metadata by default: event/template IDs, version,
  provider ID, attempt count/status and timestamps. Never persist auth bodies,
  plaintext OTPs or reset URLs for convenience. If an auth retry requires sensitive
  material, use short-lived encrypted storage and a reviewed expiry/cleanup design.
- A redesign must not change the body of an in-progress idempotent retry. Keep its
  original render/version or explicitly create a new authorized delivery event.
- `accepted` means Resend accepted the request, not inbox delivery. Add signature-
  verified delivery/bounce/complaint webhooks and durable suppression handling when
  real sending is enabled. Don't confuse a network timeout with a confirmed failure.
- Marketing adds consent, unsubscribe and suppression checks. Authentication
  messages never inherit a marketing opt-out that blocks account recovery.
- Escape user values; reject unsafe URL schemes and unapproved reset redirect hosts.
  Codes/reset links stay out of subjects, preheaders, analytics and logs.

## Session/cache requirements

Next auth actions invalidate the client cache after successful identity mutations.
Private responses and identity fetches use `no-store`; server auth reads are scoped
to one request. Mobile displays
results only for the current user and ignores responses from previous identities.

`pnpm test:http` checks login/logout, invalid credentials/tokens, refresh, staff role
revocation, concurrent users, guest requests after authenticated traffic, and cookie
isolation between apps. Browser back-button behavior, cross-tab UI and real native
devices still need interactive checks. JWT lifetime/revocation semantics are separate
from cache correctness; local logout does not instantly revoke every issued access token.

## References

- [Resend send API](https://resend.com/docs/api-reference/emails/send-email)
- [Resend idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Supabase Send Email Hook and email-change mapping](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- [Supabase MFA methods and assurance levels](https://supabase.com/docs/guides/auth/auth-mfa)

## Newsletter producer (implemented, delivery opt-in)

The marketing producer is now explicit admin Go live, documented in `CONTENT.md`.
Its runtime-validated contract/catalogue is `content/schema.ts`, independent React
template is `email/templates/newsletter.tsx`, and synthetic preview command is
`pnpm newsletter:preview`. The newsletter worker is the marketing delivery owner;
web remains the transactional/auth owner. Both reuse the single Resend adapter.
The content worker receives Resend credentials only through its explicit allowlist.
`NEWSLETTER_DELIVERY_MODE=live` enables this producer's durable queue; it does not
activate or alter `EMAIL_DELIVERY_MODE` or auth triggers. Signatures, event dedupe,
unsubscribe, bounce/complaint suppression and immutable retry bodies are implemented.
The same React-generated HTML is used for preview and send, with recipient-specific
unsubscribe tokens. New subscriber signup requires verified email plus consent.
