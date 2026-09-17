# Contracts worker

Durable Veriff/DocuSeal request creation and verified callback processing.
Run from the repository root: `pnpm dev:contracts`.

The shared server package owns business rules and adapters; this workspace owns the
long-running process only. One Supabase lease admits the active worker. No per-user
vendor polling. Credentials are projected exclusively by the shared environment
launcher. See [CONTRACTS.md](../../CONTRACTS.md) for configuration, security, budgets,
provider IDs, templates, API routes, recovery and deployment prerequisites.
