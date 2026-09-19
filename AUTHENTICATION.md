# Customer authentication and staff support access

## Signup

Ported from the original `components/certa/customer-signup-form.tsx`, `lib/trader/username.ts`,
`app/api/auth/signup/*` and the signup-purpose email PIN routes. `packages/server/src/signup/`
owns the rules; the web dialog and `/signup` page render three short pages: legal name,
public @username and country of residence; email and password (8+ characters) with
terms consent; then a six-digit mailbox code. `/api/auth/signup/{username,email/send,
email/verify,create}` is web-only and same-origin (`cors` refuses cross-site posts).

Usernames follow the original format, brand, reserved and leet-folded profanity rules
(`@certa/server/username`) and are reserved in service-only `cu_profiles` with a unique
index. Accepted countries are the ISO list minus the static restricted jurisdictions
(`@certa/server/countries`); the server re-validates the code on creation.

Mailbox proof happens before any auth user exists. `cu_signup_challenges` stores keyed
hashes only (challenge, email and code; then challenge, email and a random proof token),
never the code or proof. PostgreSQL serializes attempts, allows five, consumes codes once,
limits sends to one per minute and five per fifteen minutes per email and fifteen per
address hash, and requires accepted delivery. The proof is single-use for two hours;
a failed creation releases it for one retry. Creation checks the proof, the @ and the
country before `auth.admin.createUser` (email confirmed, as the original did), inserts
the profile, deletes the auth user if the @ was taken meanwhile, signs the browser in and
grants that session the email second factor through `cu_grant_session`, so a new trader
reaches `/account` without a second code. Delivery uses the editable `signup_pin`
template and fails closed while `EMAIL_DELIVERY_MODE` is not `live`.

## Second factor

Implemented from the original `lib/auth/{email-pin,login-second-factor,two-factor}.ts`,
email-pin API routes, `components/certa/totp-challenge.tsx` and dashboard
`two-factor-settings.tsx`. The original supplies the product behavior: email codes
by default, verified authenticator factors take precedence, six-digit codes,
ten-minute email challenges, five attempts, and switching back to email.

## Enforcement and ownership

`packages/server/src/second-factor.ts` owns verified Supabase identity, session
binding and the shared protection check. Every customer `principal`, protected
server page and `/api/me` requires completion (or the explicitly authorized,
cookie-bound staff support session below). Staff authentication in the separate
admin app retains its existing password + deployment Access policy.

Web sign-in completes the outstanding factor in place. `signIn` establishes the password
session, then reports `step: 'second-factor'` instead of redirecting, and the sign-in form
hands over to `apps/web/app/_components/second-factor-step.tsx`, which requests the email
code immediately and navigates only once a verified session exists. A code already sent
within the rate window is reported as a notice, not an error, and an unreadable factor
store still shows the step rather than looking verified. Expired or incomplete customer sessions return to `/login`, which opens the same
responsive dialog over the homepage and starts with the password. `/verify` is only
a compatibility redirect to `/account` for completed sessions or `/login` otherwise.
Verification expiry is treated as sign-in expiry, not an independent code prompt.
A valid session/token refresh retains its existing proof and requires no new code.
Both navbar and hero show Dashboard only after the same server verification check.
Staff keep the existing redirect.

The verification API lives at `/api/auth/second-factor/{status,email/send,email/verify,
totp/enroll,totp/verify,totp/remove,session/clear}`. Web uses host-only HttpOnly Supabase cookies;
native uses bearer tokens. Native TOTP confirmation installs the returned Supabase
session into the existing secure storage. Native state is keyed to the active access
token, requests pin that token, and late results cannot replace a newer identity.
Web and native sign-out clear the email proof and outstanding challenges before
local Supabase sign-out; local sign-out remains available during store outages. `/login` completes web sign-in and
`/account/security` manages authenticator enrollment/removal.

Identity and JWT claims are verified independently; session IDs are never taken
from an unverified token. Trusted verified TOTP factors require Supabase AAL2. The migration snapshots only
already-verified IDs from server-owned `auth.mfa_factors` into service-only
`cf_trusted_factors`; review that baseline before activation. New factor IDs enter
this registry only through Certa's enrollment handler after current verification.
Direct public Supabase enrollment cannot bypass Certa email admission: an unknown
factor, even with AAL2, still requires email proof. Unknown factors cannot be
confirmed through Certa's TOTP endpoint. No factor secrets are copied.
AAL2 does not identify the factor used, so it also requires a 12-hour server-owned
TOTP proof bound to the session and trusted factor. Only a successful Certa TOTP
verification creates that proof. Existing TOTP sessions complete one fresh challenge
after migration. Logout clears both email and TOTP proof.
An email proof cannot substitute for an enrolled authenticator. Pending enrollment
requires the existing verification before it can be confirmed. Removing an
authenticator requires verified access and returns the session to email verification.

Email challenges contain a keyed hash bound to challenge/user/session/email, never
the plaintext code. PostgreSQL serializes attempts, consumes codes once and binds
proofs to the same session/email for 12 hours. Resending invalidates the old code
for that session. Sending is limited to one per minute and five per 15 minutes
per user across sessions. Delivery must be accepted before a code can verify.
Changing editable Supabase metadata cannot disable these checks. No automatic
migration trusts the old user-editable `certa_email_2fa=false` value.

Verification requests never grant account entitlements or payment success. Guest
checkout and password-only API sessions fail closed. Failures fetching factor
state do not fall back to an unverified session. Email verification confirms access
to the address for this session; it does not silently change Supabase's email
confirmation metadata.

## Activation

Reconcile the existing database baseline before applying
`20260917040000_customer_second_factor.sql`. Set a dedicated random
`CERTA_AUTH_CHALLENGE_SECRET` (at least 32 characters), Resend credentials and
sender, and explicitly set `EMAIL_DELIVERY_MODE=live` when ready. The email
migration supplies the editable `login_pin` template used by challenge delivery.
Without configuration the verification screen reports unavailable and protected
customer operations remain blocked. There is no development bypass.

No live email, production Auth configuration, or production migration was performed.
Account recovery delivery still uses the existing Supabase recovery owner; merely
editing its imported template does not install a Supabase email hook. No admin
second factor was introduced. Native enrollment/settings UI is on the web security
page; native sign-in supports both existing TOTP and email challenges.

Tests cover factor precedence, session-bound hashes, atomic attempt limits,
single-use codes, cross-session/email denial, service-only grants and actual HTTP
protection. Provider sandbox and physical-device validation remain deployment checks.

## Staff support sign-in

Admin `/traders` lists customers with server-side email filtering, exact user-ID
lookup and pages of at most 50 Auth records. Staff records are excluded after the
bounded query. `support:read` permits the directory; `support:login` permits its
**Log in as user** action. `support:*`, master admins and compatible production
`certa_pages: ['users']` grants cover both. The staff editor exposes the new
permission group; no existing production metadata is changed automatically.

`POST /api/traders` rechecks trusted Auth identity and permission, rejects self,
staff, banned and unconfirmed targets, then generates a Supabase magic link for
the existing customer. It sends no email. The generated OTP hash is encrypted in
a five-minute, single-use link's URL fragment, bound to actor and customer.
The UI copies the link for a private window; websites cannot open Incognito
themselves. Opening the link in a window with any customer auth cookie is refused
before OTP consumption. The admin app uses a different cookie and stays signed in.

Web `/auth/support` removes the fragment from browser history immediately and
posts it to `/api/auth/support`. The server checks expiry, fresh staff permission
and target eligibility before consuming the OTP. It verifies the issued identity
and signed session claim, installs HttpOnly Supabase cookies, and sets a separate
encrypted HttpOnly support proof for 30 minutes. This proof is bound to the exact
customer and session ID. Protected web requests verify the customer normally and
recheck the originating staff account's current support permission. Revocation,
expiry, mismatched sessions and unavailable Auth verification fail closed.

Support proof grants customer access without creating email/TOTP verification
evidence or changing enrolled factors. Support sessions cannot use the factor API
or change a password; customer MFA requirements remain in force for ordinary and
bearer sessions. The account area shows the support identity and **End support
session**. Ending it signs out only this local customer session and clears its
support cookie. Other customer capabilities retain their existing ownership and
business checks; support access is not a read-only preview.

The existing server-only `SUPABASE_SECRET_KEY` derives a purpose-separated AES-GCM
key; web and admin must use the same key, Supabase origin and canonical web origin.
Rotating that key invalidates outstanding links/proofs. No new environment setting,
database migration, factor bypass flag or browser service credential is introduced.
Structured server events record link creation, session start and explicit end with
safe actor/target/correlation IDs, never links, OTPs, tokens or emails. These are
deployment logs, not a new durable database audit ledger.

Usage is demand-driven: a list/search page makes one bounded Auth Admin read after
staff authentication; link creation makes one target read and one generate-link
call. Redemption makes one staff read, one target read and one OTP verification,
plus SDK identity/claims/session installation checks. Each protected support
session check adds one fresh staff lookup to normal customer verification. All
reads are uncached; support adapter calls have 15-second timeouts, no polling and
no application retry. Provider throttling/errors require an explicit retry; an
ambiguous OTP response requires a new link instead of reusing the consumed one.
Supabase's existing Auth credential/rate budget applies; no Tradara calls are added.

Local unit/HTTP fixtures cover permission separation, authenticated encryption,
expiry, replay, session isolation, MFA protection and fresh revocation. Browser
checks use synthetic Auth users and separate browser contexts. Live customer
impersonation and production role changes have not been performed.
