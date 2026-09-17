# Vendor registry and health policy

The staff page is `/vendors` on the admin app (local port 3201). The typed,
code-owned schema is `packages/server/src/vendors/registry.ts`; no database
migration is required. Supabase, Resend, Tradara, DocuSeal, Veriff and Discord are registered.

Every vendor must declare an ID, purpose, lifecycle, internal health endpoint,
read probe, probe scope and minimum interval. Add the adapter and negative tests
in the same change. Keep endpoints fixed in code; never accept probe URLs from HTTP.

## Health contract

`GET /api/vendors/{supabase|resend|tradara|docuseal|veriff|discord}/health` requires a current Supabase
staff session. Missing login returns 401, non-staff 403, unknown vendor 404.
Healthy probes return 200; degraded, unavailable and unconfigured probes return
503 with a structured status, timestamp, latency, scope and integration lifecycle.
All responses are private/no-store. A monitor must authenticate through both
Cloudflare Access and Certa; these are not public health endpoints.

Each probe has a four-second timeout, no retries and no redirects. Concurrent
requests share a promise; sanitized results are reused for 60 seconds per process.
Private vendor payloads are discarded. No user identities or authorization decisions
are cached. Page load/manual refresh checks all vendors; no browser timer or scheduled
job is installed. With constant traffic the ceiling is roughly 1,440 probes/vendor/day
per process. Multiple replicas multiply this; introduce one scheduled collector and
shared sanitized samples before operating a fleet. These are point-in-time checks,
not measured uptime percentages. Future uptime needs durable timestamped samples,
retention, gap/unknown treatment and a separate collector credential.

## Credentials and scope

| Vendor | Read probe | Root setting / process | What success means |
| --- | --- | --- | --- |
| Supabase | Project `/auth/v1/settings` | Existing publishable configuration / admin | Auth settings reachable, not database/RLS or complete login health |
| Resend | `https://api.resend.com/domains` | Optional `RESEND_HEALTH_API_KEY` / admin only | Credentials permit domain reads; not email delivery |
| Tradara | Confirmed official API `/v1/firm-control/firm` | Optional `TRADARA_HEALTH_API_KEY` / admin only | Firm API permits a profile read; not trading execution |

Health credentials are intentionally separate from delivery settings. Use minimally
scoped read credentials where the provider supports them; verify permission before
activation and rotate in the provider dashboard and root environment together.
No new secret was copied or activated. Missing optional keys yields `not_configured`.
Resend remains foundation-only with delivery disabled. Tradara backend routes are implemented but require migration, credentials and deployment. Confirm the API environment before enabling its probe.
Only API keys and fixed query parameters leave the server; returned domain/account
records are discarded immediately. Logs and endpoint responses must never include them.
Cloudflare Access is an external deployment requirement, not an integrated API vendor
in this registry yet. Add its adapter when its deployment integration is verified.

See `TRADARA.md` for the business migration plan. No live send, trading mutation,
webhook subscription or production database change is part of this feature.

Resend read probe reference: [List Domains](https://resend.com/docs/api-reference/domains/list-domains). API success also requires a JSON content type; HTML login/proxy pages are degraded.

## Tradara backend status

The canonical implementation and route contract is `TRADARA.md`. The registry marks
Tradara as foundation until live activation is verified. Shared filtered streams,
durable account events, operation queue and protected APIs are implemented. The
health adapter uses `/v1/firm-control/firm` on the validated official production or
sandbox origin. Worker health probes run every five minutes; independent manual
admin probes still use a 60-second per-process cache. No uptime history is implied.

## KYC and signature vendors

See [CONTRACTS.md](CONTRACTS.md) for the single request lifecycle and vendor extension
policy. Both integrations are foundation until configured and verified live.

- DocuSeal: `/api/vendors/docuseal/health`, fixed cloud `/templates?limit=1` read,
  optional separate `DOCUSEAL_HEALTH_API_KEY` in admin only. No signer data retained
  by the probe. This does not verify signing or webhooks.
- Veriff: `/api/vendors/veriff/health`, optional `VERIFF_HEALTH_ENABLED=true` in
  admin enables `https://status.veriff.com/api/v2/status.json`. No API credentials
  or user identifiers are sent. This is provider-reported service status, not proof
  that Certa's Veriff integration credentials or decisions work.

Missing optional health configuration reports `not_configured`. Both use the existing
4-second deadline and 60-second per-process coalescing cache. Business credentials
are separate: DocuSeal API key goes only to the contracts worker; web receives only
webhook secrets/Veriff integration verification settings. No provider SDK reaches clients.

## Discord

See `DISCORD.md` for the community integration. The registry health endpoint is
`/api/vendors/discord/health`; admin-only `DISCORD_HEALTH_ENABLED=true` enables the
fixed `https://discordstatus.com/api/v2/status.json` public read probe. It shares the
4-second deadline and 60-second coalescing cache. This reports provider health only,
not bot authentication/permissions or delivery. The Discord console shows worker/live
state and failed/unknown jobs. No production bot or destination has been activated.

## Anthropic newsletter drafting

Anthropic is a foundation vendor at `/api/vendors/anthropic/health`. Optional
admin-only `ANTHROPIC_HEALTH_ENABLED=true` reads the fixed public
`https://status.anthropic.com/api/v2/status.json` endpoint with the standard four-second
deadline and 60-second cache; it sends no credentials and does not verify model access.
The admin server owns `content/anthropic.ts`; `ANTHROPIC_API_KEY` and explicitly
configured `ANTHROPIC_NEWSLETTER_MODEL` stay in that process. Data sent is the staff
editorial brief, selected template ID and up to four normalized public image bytes/IDs,
never subscribers, auth records or puzzle answers. Treat provider retention under the
organization's Anthropic API agreement; review before sending confidential editorial
material. Certa retains resulting draft/model/usage, not original brief/image payloads
in generation rows. One request per explicit keyed action, 60-second timeout, no
automatic paid retry; failed/unknown jobs remain reviewable. See `CONTENT.md` for
concurrency/daily budgets and activation. No paid generation has been performed.

Resend additionally serves newsletter marketing through the content worker, with a
separate opt-in switch and signature-verified delivery/suppression callbacks. Existing
auth triggers remain inactive. See `EMAILS.md` and `CONTENT.md`.
