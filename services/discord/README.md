# Discord worker

Run from the monorepo with `pnpm dev:discord`. Requires reconciled `cd_*` migrations,
server credentials and a configured Discord application. Dispatch defaults off.

One leased process handles the Gateway connection, durable jobs and sanitized SSE.
Loopback port 3211 exposes `/health` and `/events`; proxy through web for browser access.
See [DISCORD.md](../../DISCORD.md) for roles, privacy, setup, rate budgets and recovery.
