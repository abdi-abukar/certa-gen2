# Discord integration

## Scope and owners

Implemented in this monorepo, disabled until configured. The old repository is reference
material; its OAuth tokens, avatar helpers, support-ticket bridge and data are not imported.
No avatar synchronization or user-token persistence exists in this implementation.

- `packages/server/src/discord/`: explicit HTTP routes, OAuth, vendor adapter, projections,
  message composition, verified PnL, signed interactions and durable job execution.
- `services/discord/`: one leased Gateway connection and outbox worker, plus public SSE.
- `apps/admin/app/discord/`: identity lookup, disconnect, role mappings, recovery and audit.
- `apps/web/app/community/`: customer linking/preferences, nickname, result preview/sharing,
  team-live banner and confirmed anonymous milestone feed.
- `20260916000000_discord.sql`: server-only `cd_*` schema, event triggers and atomic actions.

Keep business truth in the existing account/compliance/payout owners. Never call Tradara
from Discord handlers or workers, grant a funded account through a Discord command, or
accept client-supplied PnL/image uploads as verified results.

## Identity and authorization

`cd_links.user_id` is the primary key; `discord_id` has a unique constraint. A user can
have one linked Discord identity and a Discord identity can belong to one Certa user.
Both constraints remain in force while cleanup is pending. No automatic identity transfer.

OAuth uses `identify guilds.join`, a random 256-bit state, HttpOnly/SameSite=Lax cookie,
one-use hashed database state, 10-minute expiry, fresh Certa identity and matching user.
The callback attempts server joining after the unique link is committed. Joining can
fail independently; the dashboard shows membership state and an explicit invite link.
Guild membership screening must be completed in Discord. Only the callback sees the
short-lived access token; it attempts revocation and discards tokens after use.

Connect through the web browser while signed into the correct Certa account. Native
clients can use the same bearer APIs for status/preferences/sharing, and open the web
community page for linking. Native OAuth deep-link UI is not implemented here. Native
fetch cookies must not be mistaken for the system browser's cookie/session storage.

Every private route verifies current identity. Staff use server-managed
`app_metadata.discord_permissions`: `discord:read`, `discord:manage`, `discord:config`,
or `discord:*`. Staff status by itself is insufficient. The console needs read plus
permissions for the desired actions. Cookie POSTs require the correct Origin. Private
responses are no-store. No secrets, OAuth states, job payloads or generations appear
in customer link responses. Signed slash commands use Ed25519 over timestamp+raw bytes,
a five-minute signature window, exact application/guild checks, and ephemeral responses.

## Disconnect and recovery

Customer or staff disconnect atomically invalidates outstanding OAuth states/epochs,
disables sharing, marks the link disconnecting, cancels queued personal work and creates
one cleanup job. An already dispatched request may finish; cleanup waits for running
work for that user. The worker removes only Certa-managed roles, including retired
mappings, and deletes the link only after confirmed cleanup. It does not kick members,
remove unrelated roles or restore a prior nickname. A genuine unknown-member response
counts as nothing left to remove; an inaccessible/unknown guild does not.

A failed cleanup remains visible and keeps the identity reserved. Staff can fix bot
permissions and retry it. Cleanup cannot be cancelled to bypass uniqueness. Staff
operations require an audit reason. Role mappings must refer to dedicated Certa roles,
never staff/moderator roles. The bot must sit above these roles and should not have
Administrator permission. Retired role IDs remain tracked until cleanup is complete.

## Event flow and idempotency

Confirmed `ct_accounts` lifecycle changes and `cp_payouts.state=paid` create jobs inside
the same database transaction as the canonical change. No `after()`/fire-and-forget
financial announcements and no per-user vendor polling. Passes key on account ID;
payouts key on payout ID. Repeated pass/upgraded events do not duplicate announcements.
Database failure rolls back the transaction; the upstream event's existing retry path
can safely apply it again. Historical migration seeds Summit role evidence only; it
never floods Discord with historical announcements.

- Evaluation passed → Summit achievement and anonymous public pass announcement.
- Actual active/locked evaluation → active evaluation role.
- Actual active/locked funded account → active funded role.
- Last eligible account closes/fails → remove corresponding active role.
- First confirmed paid trader payout → Bronze; second onward → Crown.
- Founding → audited staff verification of the opening cohort, not an invented window.
- Failed/unknown account operations → optional private staff-channel alert with record
  ID and status only. No account balances, tax data or identity documents.

Personal naming and payout amounts require separate preferences. Anonymous firm
announcements continue independently of those preferences, with no user ID or amount
in the public website feed. Account failures are never public milestones. Preferences
are checked immediately before sending; an already dispatched post cannot be recalled
by a subsequent opt-out. Disconnect does not delete previously published messages.

Jobs have unique dedupe keys, a worker claim, attempts, timestamps, destination/message
IDs and sanitized errors. Role updates use per-role PUT/DELETE, preserving other roles.
Messages use a stable nonce and `enforce_nonce`; Discord's dedupe window is only minutes.
A timeout/5xx or crash after possible message delivery becomes `unknown`, with no automatic
resend. Staff must verify non-delivery before retrying and record evidence in the reason.
This is not a claim of exactly-once external delivery. Known 429s honor Retry-After;
repeatable role work has bounded retries. Failed/unknown jobs are never silently deleted.

## Result cards

Server-generated Discord embeds use owned `ct_records` only. Manual sharing supports
`YYYY-MM-DD`, a completed `YYYY-MM`, `week:YYYY-MM-DD` (Monday), or `trade:<vendor trade ID>` within the specified
owned account. Closed trades require a closed timestamp and valid net PnL. Dates and
numeric strings are validated; conflicting session evidence is rejected. Money is
summed in fixed-point integers and rounded for display. No browser-uploaded result image
can masquerade as a verified card. Preview uses exactly the same renderer as delivery.

Daily and weekly sharing are separate opt-ins, one post per linked generation/account/previous Toronto date or completed Monday–Sunday week.
It uses fresh stored daily-stat snapshots, never fetches Tradara. Late stat updates mark
a user dirty for another bounded DB-only scheduling pass. Missing data means no post;
no fabricated zero. Completed-date logic follows the current backend's Toronto date
convention. Monthly cards explicitly show the count of reported sessions and snapshot
time; a paginated vendor snapshot is not represented as certified complete history.
Existing posted results are not automatically edited after a later vendor correction.

## Routes

Base `/api/community` on web; staff routes live on admin under the same base.

| Method | Customer/public route | Behavior |
| --- | --- | --- |
| GET | `/status` | Own link, preferences and cached membership |
| GET | `/accounts` | Up to 50 owned account choices |
| POST | `/connect` | Verified-email user starts OAuth; returns Discord URL and state cookie |
| GET | `/callback` | Same-user, same-browser OAuth completion |
| POST | `/disconnect` | Durable unlink/cleanup |
| POST | `/sync` | Coalesced role refresh, no inline vendor call |
| POST | `/preferences` | Booleans `daily_pnl`, `milestones`, `show_amount`, optional `weekly_pnl` |
| POST | `/nickname` | Explicit nickname or null; queues update |
| POST | `/preview` | `{account_id,period}` → verified embed preview |
| POST | `/share` | Same body → deduplicated personal result post |
| GET | `/live` | Public sanitized live flag and latest 20 published milestones |
| GET | `/stream` | Public SSE for the same sanitized state; no user data |

Admin:

| Method | Route | Permission |
| --- | --- | --- |
| GET | `/links?user=UUID` or `?discord=ID`, optional `cursor` | read; 50-row keyset pages |
| GET | `/users/:id/status` | read |
| POST | `/users/:id/disconnect` | manage; `{reason}` |
| POST | `/users/:id/sync` | manage |
| GET | `/jobs?state=failed&cursor=UUID` | read; 50-row keyset pages |
| POST | `/jobs/:id/retry` or `/cancel` | manage; recovery reason/evidence, minimum 10 characters |
| GET | `/roles`, `/runtime`, `/audit` | read; bounded operational results |
| POST | `/roles/:kind` | config; `{role_id,reason}`, null retires mapping |
| POST | `/founding` | config; `{user_id,reason}` |
| POST | `/commands/register` | config; `{reason}`, explicitly registers `/certa` and `/next` |

`POST /api/discord/interactions` on web accepts signed Discord requests only. Commands
return a private next-step summary and dashboard link; they cannot change accounts,
request payouts, approve compliance or operate on another user's records.

## Usage and worker behavior

- One active `discord-worker` lease; renew every 10 seconds, 30-second expiry. The worker
  checks its lease before vendor requests. Gateway events use guild/voice intents;
  member events are opt-in because Discord requires the privileged member intent.
- Empty job polling backs off to 10 seconds (about 8,640 idle claims/day); lease renewal
  is shared once per 10 seconds. Active work is claimed at most four times per second. Newly queued
  announcements can take up to about 10 seconds to start, before backlog/rate limits.
- No message-content intent. Track only configured founders in the configured voice
  channel. Resume sequence in memory; a fresh process gets a fresh guild snapshot.
  On loss of connection/lease, report unavailable instead of claiming founders are live.
- Shared DB HTTP budget: at most four requests/second globally, two/second per normalized
  route, plus Discord response backoff. OAuth shares the budget. These are ceilings,
  not throughput guarantees. Eight delivery failures maximum before staff recovery; local budget deferrals do not consume attempts.
- Role sync: triggered by relevant business changes, linking, explicit refresh or optional
  member events; bounded reconciliation repairs drift when a link has not been checked for a day.
  Backlogs can delay that target; this is not a per-user daily timing guarantee. One queued role job/user.
- Scheduler: once/minute, at most 100 role repairs, 100 date-rollover users and 100 dirty
  digest users. Reads local records only. No fixed first-200-user scan.
- Gateway receive queue capped at 500; reconnect if overloaded. Gateway payload max 4 MB.
  Vendor HTTP calls: 8-second timeout, 2 MB response limit, no redirects.
- OAuth start: five/10 minutes/user. Mutating API actions: 20/minute/user shared DB budget.
- SSE: one worker-wide snapshot on change or every 30 seconds, shared by up to 2,000
  connections/process. Slow writers are disconnected; 20-second transport heartbeats.
  Web proxies the stream; deploy behind TLS with buffering disabled and suitable stream
  duration/connection limits. The browser reconnects and gets the latest bounded snapshot;
  this is a community display feed, not an authoritative financial event subscription.
- Live-feed history exposes only event type/time/random post ID; never Certa/Discord IDs.
- Only expired OAuth rows are automatically deleted. Set explicit job/audit retention
  before production; do not delete unresolved cleanup or ambiguous-delivery evidence.

## Activation and health

Root `.env` only. See `.env.example`; no old vendor secrets were copied.

- Web: client ID, client secret, bot token (guild join), guild ID, verification public key,
  invite URL, canonical web origin and private worker stream origin.
- Worker: bot token, client/guild IDs, destination channel IDs, founder/voice IDs,
  optional member-event flag, delivery flag and privileged database credentials.
- Admin: non-secret IDs/invite/delivery flag and optional public health probe flag.
- Mobile, Tradara worker and contracts worker receive no Discord credentials.

Register `/api/community/callback` as the exact OAuth redirect and
`/api/discord/interactions` as the interaction endpoint in Discord. Install the bot with
only permissions needed for joining, dedicated managed roles, nicknames and posting to
chosen channels. Enable privileged member events in Discord before setting the flag.
Configure channel IDs and role mappings; set staff permissions; review migration baseline;
then deploy the migration and worker. `pnpm dev:discord` starts the worker on loopback
3211. Keep `DISCORD_DELIVERY_ENABLED=false` until destinations and permissions are checked.
Disabled delivery still permits authenticated linking when credentials are configured;
it prevents queued message/role/nickname/command dispatch.

Vendor registry: `GET /api/vendors/discord/health` (staff auth) optionally checks Discord's
public service-status API; it is not proof of bot permissions or successful message delivery.
Worker `/health` reports lease and dispatch flag; `/api/community/runtime` in admin shows
community presence freshness. Neither is a measured uptime percentage.

This scope migrates the existing community features plus private commands and staff
operation alerts. Scheduled coaching reminders and a new support
system are future features; they are not hidden background jobs or a second helpdesk.

## Official references

- https://docs.discord.com/developers/topics/oauth2
- https://docs.discord.com/developers/resources/guild
- https://docs.discord.com/developers/resources/message
- https://docs.discord.com/developers/events/gateway
- https://docs.discord.com/developers/topics/rate-limits
- https://docs.discord.com/developers/interactions/receiving-and-responding

### Shared awards migration

After the awards migration, `cd_awards` is a read-only compatibility view over
`ca_issues`. Summit/Beta/Bronze/Crown roles all use that ledger; payout award cycles
are per account. `cd_founding` writes an audited shared grant. Existing milestone
outbox keys, identity/amount opt-ins and anonymous public feed are unchanged.
Certificate PNGs remain private; automatic Discord image attachments are not enabled.
