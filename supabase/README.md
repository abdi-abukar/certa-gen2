# Supabase ownership

All four apps use the existing Certa Supabase project configured in the root `.env`.
This foundation adds authentication clients only. It does not create tables, seed
users, alter auth settings, or apply migrations.

The existing migration history still belongs to the old repo. Before the first
database feature is migrated, establish a reviewed baseline here and reconcile it
with the linked project's migration history. Do not copy selected migration files
and immediately run `supabase db push`; never reset the existing project.

`security-audit.sql` is a read-only starting point for the database review. It
inventories RLS and policies; it does not prove every existing policy is correct.
Run cross-user access tests when each data feature arrives. No broad service-role
client is included in the new app foundation.

For future tables: minimal grants; RLS enabled in the creating migration; ownership
checks for reads/writes; immutable role/ownership columns where appropriate; indexes
on user/filter fields; explicit limits and pagination in queries. Keep privilege
checks in the database as well as the server when clients can reach the Data API.

## Tradara migration prepared

`20260915160000_tradara_backend.sql` is an additive `ct_*` namespace, tested against
an isolated PostgreSQL fixture. It is not applied to the existing project and does
not reconcile/import the legacy tables automatically. Follow `TRADARA.md` before
activation. A server-only database secret is now supported for these privileged
operations; browser/native roles have no write or privileged RPC grants.

## Payout migration prepared

`20260915230000_payouts.sql` adds API-only `cp_*` tables and transactional functions.
It depends on the Tradara/account baseline; it does not import or alter MVP payout
records. `pnpm test:tradara-db` now includes payout eligibility, review, payment,
recovery, RLS and concurrent request/approval/session-allocation checks. Review
`PAYOUTS.md` before deployment or historical-data reconciliation.
