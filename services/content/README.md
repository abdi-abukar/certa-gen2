# Content worker

Run `pnpm dev:content` from the monorepo. This process runs newsletter delivery and
leased certificate-render jobs with separate failure handling. Newsletter delivery
can remain disabled while awards render. It uses the root environment through the
existing allowlisted launcher; no app-local environment files.

Awards use the private `certa-awards` Supabase storage bucket. They need no additional
vendor credentials. One render per tick, with idle checks backing off to 10 seconds;
multiple processes use database leases. See [AWARDS.md](../../AWARDS.md) for queue,
recovery, authorization and deployment prerequisites.
