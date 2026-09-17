# Tradara service

Run from the repo root with `pnpm dev:tradara` after completing `TRADARA.md` activation.
This is a long-lived Node process, not a Next/serverless request. It owns firm streams,
queued operations, bounded repair and Certa live updates. It listens on loopback port
3210 by default; use a TLS reverse proxy for external clients. Never expose vendor keys
or the database secret to native/browser bundles.

The collector uses one leased active worker. This release supports one active gateway;
standby gateway connections are rejected until that instance acquires leadership.
Deploying multiple active fan-out replicas needs an explicit distributed delivery design.
No production credentials or subscriptions are created by starting the workspace setup.
