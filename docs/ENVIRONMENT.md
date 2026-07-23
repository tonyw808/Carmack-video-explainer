# Environment Reconnaissance (Phase 0)

Probed 2026-07-20 in the Claude Code cloud session container. This file records what this
environment can and cannot do, and the architecture consequences.

## Runtimes and package managers

| Tool | Version | Notes |
|---|---|---|
| Node.js | v22.22.2 | primary runtime; satisfies Next 15 / Prisma 6 / PDS CLI (needs ≥20) |
| npm | 10.9.7 | works against registry.npmjs.org |
| **pnpm** | **10.33.0** | **chosen package manager** (workspace support, present natively) |
| yarn | 1.22.22 | unused |
| bun | 1.3.11 | unused |
| corepack | 0.34.6 | unused |
| Python 3 | 3.11.15 (pip 24.0) | unused for the app |

## Infrastructure availability

| Service | Status | Consequence |
|---|---|---|
| Docker | client 29.3.1 present, **daemon NOT running** (no /var/run/docker.sock) | no containers; everything must run as plain processes |
| PostgreSQL | `psql` client 16.13 only, **no server binary** | dev/test DB profile is **SQLite via Prisma**; Postgres profile is code+docs only here |
| Redis | **redis-server 7.0.15 available and runnable** | BullMQ queue driver can be integration-tested against a real local Redis |
| ffmpeg | not preinstalled; installed via `apt-get update && apt-get install -y ffmpeg` during Phase 0 (first attempt failed on stale apt index) | used ONE TIME to generate the committed sample mp4/jpg assets for MockProvider; the app has **no runtime ffmpeg dependency** |
| sqlite3 CLI | missing | irrelevant — Prisma bundles its own SQLite engine |
| Playwright Chromium | preinstalled at /opt/pw-browsers (`PLAYWRIGHT_BROWSERS_PATH`) | e2e tests use `executablePath` /opt/pw-browsers/chromium; never run `playwright install` |

## Hardware

4 CPU cores, 16 GB RAM, ~30 GB writable disk. Ample for dev servers + tests.

## Outbound network (via mandatory agent proxy, CA bundle /root/.ccr/ca-bundle.crt)

| Host | Result | Consequence |
|---|---|---|
| registry.npmjs.org | **200 OK** | dependency installation works |
| video.promptdriven.ai | **unreachable (curl 000)** | PDS CLI cannot reach its API from here → MockProvider is the active provider; see docs/pds-cli-notes.md |
| api.stripe.com | **unreachable (curl 000)** | no live Stripe API calls; Checkout is exercised via the dev fake-checkout path and webhook handling via signed test fixtures |
| github.com | 400 via proxy | git push to origin works through the harness; arbitrary GitHub fetches do not |
| archive.ubuntu.com | reachable after `apt-get update` | apt installs possible |

The PDS CLI's own README anticipates exactly this situation: "A sandboxed AI agent (e.g. a
claude.ai/code cloud session) may block the host … That is a network-environment diagnosis,
not proof of a GVS outage."

## What this means for the build

1. **DB**: Prisma with SQLite (`file:./.data/dev.db`) for dev/test; schema kept
   Postgres-compatible (no enums, no Json columns — see docs/DECISIONS.md D3).
2. **Queue**: DB-backed claim queue as the dev driver (works across the web/worker process
   boundary with zero infra); BullMQ+Redis driver implemented and integration-tested against
   the local redis-server; InMemory driver for unit tests.
3. **Storage**: local-disk driver rooted at `.data/storage`, served through an authenticated
   Next.js route; S3 driver ships for production use (not reachable here).
4. **Payments**: Stripe SDK used for real Checkout when keys are configured; in this
   environment the flow runs through `DEV_FAKE_CHECKOUT`, which exercises the *real* webhook
   route with a correctly signed event (same HMAC scheme as Stripe).
5. **Video generation**: MockProvider active; PdsCliProvider fully structured against the
   real CLI interface captured in docs/pds-cli-notes.md, guarded behind env config, and
   verified later on the developer machine per docs/LOCAL-VERIFY.md.
