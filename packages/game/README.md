# Certa presentation scenes

Shared browser-only scenes consumed by web and admin. No credentials or vendor API
calls. Each Next app builds Vite output into its own ignored public/game directory,
so parallel builds never write the same files. `pnpm --filter @certa/game build`
validates a standalone bundle in dist. See [AWARDS.md](../../AWARDS.md) for the
source-of-truth boundary and scene inventory. No separate game server is required.

The original 3D models are preserved and loaded on demand; the beta coin is 54 MB.
Do not preload all models or mount a WebGL viewer for every catalog row. A production
mobile rollout needs mesh profiling/optimization and actual device testing.

The original Silkscreen font is local; public/FONT-LICENSE.txt is its OFL license.
