# Contracts and identity backend

One backend lifecycle, two provider adapters: **Veriff** for identity and **DocuSeal**
for the standing Sim Funded agreement, W-9 and W-8BEN. Implemented locally; credentials,
provider subscriptions, migrations and template publication are not activated.

Read this before adding a provider or changing document/compliance behavior. Also read
`ACCOUNTS.md`, `VENDORS.md` and `CONTRIBUTING.md`. No customer/admin signing screens
or legal-document edits are included in this backend implementation.

## One standard record

`cc_requests` owns each request: Certa ID, authenticated owner, requirement, kind,
immutable template/version snapshot, provider, provider session/submission ID,
DocuSeal signer ID, state, provider timestamp, completion time and error code.

`cc_templates` is the versioned provider-template registry. These previous-repo IDs
are seeded **disabled**, with no anonymous/static signing URL fallback:

| Kind | Provider | Template ID | Initial version |
| --- | --- | --- | --- |
| `kyc` | Veriff | Session-based | `v1` |
| `sim_funded` | DocuSeal | `5607795` | `2026-09-04.1` |
| `w9` | DocuSeal | `5461743` | `v1` |
| `w8ben` | DocuSeal | `5607884` | `v1` |

Verify template ownership, actual content, signer roles and account-wide notification
settings before publication. Publish W-9 and W-8BEN under the same tax requirement
version. Template content/roles/IDs cannot be changed in place under an existing
version: add a new version. Do not edit already-published provider templates in place.
Provider console edits cannot be detected from an unchanged template ID alone.

The funded agreement covers the customer, not a fabricated future funded account ID.
Funded issuance still belongs exclusively to the existing slot coordinator.

### Where information lives

- `cc_requests`: provider IDs and workflow metadata, not filled tax/identity fields.
- `cc_tax_choices`: customer-declared W-9 or W-8BEN choice and revision. These are
  alternatives; the customer completes one appropriate tax form, not both.
  No inference from IP address, nationality or residence is used to choose the form.
  Entity forms/W-8BEN-E are not part of this two-form implementation.
- `cc_callbacks`: authenticated callback digest and provider/correlation IDs only;
  no raw KYC person objects, document scans, tax numbers or filled form values.
- `ct_compliance_evidence`: the existing sole eligibility source; a provider-confirmed
  result writes evidence and marks the customer for slot coordination transactionally.
- Signed PDFs/audit trails stay at DocuSeal. Certa stores restricted artifact references
  and serves them only through authorized access. There is no independent Supabase
  PDF archive yet; configure provider retention before launch. Artifact links may be
  bearer links; do not log, index, email or put them in analytics. Refresh explicitly
  if provider links expire or generated PDFs are not yet available.

All `cc_*` tables/RPCs are server-only: RLS enabled and anon/authenticated grants
revoked. The shared HTTP layer verifies fresh identity and returns private/no-store.
Client list/status responses omit email, signing URLs, evidence payloads and artifacts.
Admin signed-document access has a separate permission.

## Customer API

Base: **`/api/compliance`** on web. Mobile clients call the same API with bearer tokens.
Private cookie POSTs require the app Origin. POST JSON has exact allowed fields.

| Method | Route | Body / result |
| --- | --- | --- |
| GET | `/status` | Current KYC/tax/agreement eligibility, required versions and selected tax kind |
| GET | `/requests?cursor=:uuid` | Own requests, 50 per page, metadata only |
| POST | `/tax-choice` | `{kind: "w9"\|"w8ben"}`; records the customer's declaration |
| POST | `/requests` | `{kind: "kyc"\|"sim_funded"\|"w9"\|"w8ben"}` + `Idempotency-Key`; returns a request, HTTP 202 |
| GET | `/requests/:id` | Owned request status and provider ID |
| POST | `/requests/:id/launch` | `{}`; authorized hosted verification/signing URL once pending |
| POST | `/requests/:id/refresh` | `{}`; queue one explicit provider read, one request/minute |
| GET | `/requests/:id/documents` | Completed document/audit references and version; no KYC media |

A verified account email is required to create requests; clients cannot supply a
signer email, user ID, template ID or an approved/completed flag. Existing active
requests are reused even if callers provide new keys. Approved KYC is not reset
by a page reload or another start request. The first evaluation remains ungated;
starting compliance is an explicit action, never a side effect of viewing a page.

Clients should listen for the existing authorized `compliance` invalidation and reload
`/status` or their request. No provider polling loop or new browser subscription was
installed. Return from a hosted flow is navigation only, never proof of completion.

## Admin API

Same base on admin. Permissions are fresh server-managed
`app_metadata.compliance_permissions`: `compliance:read`, `compliance:manage`,
`compliance:config`, `compliance:documents`, or `compliance:*`.

| Method | Route | Permission / behavior |
| --- | --- | --- |
| GET | `/users/:id/status` | Read; inspect current requirements |
| GET | `/users/:id/requests?cursor=:uuid` | Read; paginated metadata |
| GET | `/requests/:id` | Read; inspect a specific request |
| GET | `/requests/:id/documents` | Read + documents; sensitive signed-document links |
| GET | `/templates` | Read; up to 100 configured versions |
| GET | `/callbacks` | Read; latest 100 failed callback jobs |
| POST | `/templates/:kind` | Config; `{version, provider_template_id?, signer_role?, reason}`; publish immutable version and update requirement version |
| POST | `/requests/:id/refresh` | Manage; queue a verified provider read |
| POST | `/requests/:id/reconcile` | Manage; `{provider_id, reason}`; recover an unknown creation only after API verification of exact correlation/owner/template |
| POST | `/requests/:id/not-created` | Manage; `{reason}` containing operator evidence (at least 10 chars); unknown/unbound → failed only after provider-side review establishes no creation |
| POST | `/requests/:id/retry` | Manage; `{reason}`; retry a definitively failed, unbound creation |
| POST | `/requests/:id/cancel` | Manage; `{reason}`; cancel a queued/failed unbound local request |

Admin API does not auto-sign or directly mark a contract completed. Existing manual
compliance evidence routes remain separate audited staff decisions. Cancellation is
not provider-side voiding: creating, unknown and pending external submissions cannot
be silently cancelled locally. Resolve them at the provider and refresh, or wait for
verified terminal state. Version publication can require a new agreement; it does
not revoke or close an already-issued Tradara account.

## Callbacks and provider verification

- `POST /api/webhooks/docuseal`: verifies `X-Docuseal-Signature` HMAC-SHA256 over
  `timestamp.rawBody`, with a 300-second tolerance and constant-time comparison.
  Use the HMAC secret from DocuSeal's Security panel, not the old custom header secret.
- `POST /api/webhooks/veriff`: verifies exact-body HMAC-SHA256 and the exact
  `X-AUTH-CLIENT` integration key. Configure the **decision webhook** here. Full-auto,
  ongoing watchlist/PEP and event-only callbacks need separate approved mappings;
  they are not represented as identity approval by this implementation.
- Both enforce a 1 MiB body limit and acknowledge after a four-second-budget DB insert.
  Raw payloads are discarded. Callback digests deduplicate provider delivery retries.
- The worker then performs one authoritative provider read. DocuSeal must match
  submission ID, pinned template ID, exact Certa request correlation, signer role and
  signer email; the entire submission and all signers must be completed. Veriff must
  match session ID and exact request correlation; end-user ID must match when present.
- A signed callback never trusts a claimed Certa user ID or matches by email alone.
  User metadata and browser completion messages cannot approve anything.
- Callbacks arriving before the creation response can bind the verified provider ID
  to a creating/unknown request. A delayed HTTP result cannot overwrite a terminal result.
- Pending reads do not overwrite provider decision timestamps. Older decisions cannot
  overwrite newer ones. Old template versions and superseded tax choices do not grant
  current eligibility. Changed tax declarations revoke the old tax approval.

Template versions are the implemented renewal gate. Jurisdiction-specific tax validity,
KYC document-expiry and retention schedules must be configured as business policy;
this integration does not invent tax/legal rules or claim a signature establishes
that the customer selected the legally correct form.

## Worker, usage and failure policy

`services/contracts` is now a real Node workspace. Run `pnpm dev:contracts`.
It owns provider API credentials and does not depend on the Tradara process being up.
Both share Supabase, the existing compliance evidence contract and live invalidations.

| Trigger | External calls / limits |
| --- | --- |
| GET list/status/launch URL | Zero provider calls; launch itself is POST |
| New request | One creation POST; maximum five new requests/customer/day; active reuse first |
| Callback | One decision/submission GET; duplicate inbox body makes no new job |
| Manual refresh | One queued GET; shared per-request 60s admission cooldown |
| Read failure or terminal callback not yet reflected by provider | At most five read attempts, exponential delay from 60s; honors a longer Retry-After on that job |
| Provider traffic | Shared DB budget of two requests/provider/second; one active leased worker |
| Creation | 10s timeout, one attempt, redirects forbidden, response limited to 2 MB |
| Database queue | One claim/tick, one-second interval; no continuous per-customer vendor polling |
| Admin health | Optional DocuSeal template read or public Veriff status, 60s/process cache; no mutations |

Unknown POST outcomes retain the same request and block another creation. Neither
provider's creation is assumed exactly-once. Do not retry unknown writes because a
browser timed out. Staff must reconcile by provider ID or document evidence of no
creation before retry. For Veriff, an unbound session whose decision is still null
cannot be safely linked using that response alone; inspect its provider portal first.

Callback jobs retry reads, never creation. Five exhausted failures remain visible for
staff; refresh/reconcile is explicit. Old callback digests and request/audit records
are retained until a documented retention policy is added. At larger volume, add
bounded retention rather than deleting deduplication evidence ad hoc.

## Credentials, deployment and extension policy

One root `.env`, narrow process allowlists:

- Worker: `DOCUSEAL_API_KEY`, `DOCUSEAL_API_ORIGIN`, `VERIFF_API_KEY`,
  `VERIFF_SHARED_SECRET`, `VERIFF_API_ORIGIN`, privileged Supabase access.
- Web webhook receiver: DocuSeal HMAC secret and Veriff integration key/shared secret.
  DocuSeal outbound API key never reaches the web/admin/client apps.
- Admin: optional separate `DOCUSEAL_HEALTH_API_KEY` and public
  `VERIFF_HEALTH_ENABLED=true`. Public Veriff status does not verify account credentials.
- Native: none of these provider credentials. No secrets were copied from the old repo.

Only official DocuSeal US/EU cloud origins and the verified default Veriff API origin
are accepted. Add a regional/self-hosted origin only after reviewing its exact contract.
Configure DocuSeal provider notification preferences to avoid vendor emails; creation
sets `send_email=false` and `send_sms=false`. Certa/Resend email triggers remain inactive.

Apply the contracts migration after the two account migrations only after live baseline
reconciliation. Publish verified templates/versions, configure signed callbacks, deploy
worker and test sandbox end to end before exposing signing controls.

For every added vendor/document kind:

1. Register its typed kind/provider and immutable template/version mapping.
2. Implement `create` and authoritative `verify`, with correlation, bounded response,
   allowed origins, exact field mapping and explicit unknown-outcome behavior.
3. Verify webhook authenticity before a sanitized inbox insert; never write approval
   directly from a browser callback or unverified payload.
4. Feed `ct_compliance_evidence` through the common transactional apply path. Do not
   introduce another `kyc_approved`/`agreement_signed` source of eligibility truth.
5. Extend environment allowlists, vendor registry/health, permission checks and tests.
6. Declare exact PII sent/stored, retention, call budget, retries and activation status.

Verification: `pnpm test`, `pnpm test:tradara-db` (includes contracts + funding handoff),
`pnpm test:http`, `pnpm typecheck`, web/admin builds. Live integration, provider template
content, legal sufficiency, PDF retention, production migration and email delivery
are not claimed by local tests.

Official references: [DocuSeal API](https://www.docuseal.com/docs/api),
[DocuSeal webhook authentication](https://www.docuseal.com/resources/use-webhooks),
[Veriff session creation](https://devdocs.veriff.com/apidocs/v1sessions),
[Veriff decision API](https://devdocs.veriff.com/apidocs/v1sessionsiddecision-1),
[Veriff webhook security](https://devdocs.veriff.com/docs/hmac-authentication-and-endpoint-security),
[Veriff service status](https://status.veriff.com).
