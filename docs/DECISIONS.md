# Decision Log

Append-only. Each entry: context → decision → consequence.

## D15 — E2E boots its own stack with a DB-first script (not Playwright globalSetup)
Playwright's `globalSetup` races the `webServer`, so the server issued queries against an
unmigrated e2e DB (P2021 "table does not exist"). Fix: `scripts/e2e-boot.mjs` resets +
`migrate deploy` + seeds the env-provided SQLite DB synchronously, THEN starts the web+worker
orchestrator in-process; Playwright's `webServer.command` points at it. The e2e runs on port
3210 with its own `.data/e2e.db` so it never collides with a running dev server. It uses the
preinstalled Chromium via an explicit `executablePath` (never downloads). Also: always kill a
prior e2e webServer before re-running — a leftover server on 3210 makes Playwright appear to
run stale code (D14's port lesson, again).

## D1 — Branch name: `claude/reelforge-v1-build-cd8mfo` (not `build/reelforge-v1`)
The session brief asks for `build/reelforge-v1`, but this cloud session's git harness
designates `claude/reelforge-v1-build-cd8mfo` as the only branch it may push to. The repo is
the source of truth for resumption, so the harness branch wins. A later local session may
rename/merge to `build/reelforge-v1` freely.

## D2 — Package manager: pnpm 10 workspaces
Present natively (10.33.0), best monorepo ergonomics, content-addressed store keeps installs
fast in this disk-quota'd container.

## D3 — Prisma schema constraints: no enums, no Json columns
SQLite (the only runnable DB here) doesn't support Prisma enums or Json scalars. Status
fields are `String` validated by zod at every boundary; JSON payloads are `String` columns
with (de)serialization helpers. This keeps ONE schema shape valid for both SQLite and
Postgres profiles; `schema.postgres.prisma` differs only in datasource + native-type
annotations, enforced by `pnpm db:check-schemas`.

## D4 — Dev queue driver is DB-claim polling, not literal in-memory
The brief says "InMemoryQueue driver for dev/test". A literal in-memory queue cannot cross
the apps/web ⇄ apps/worker process boundary, and collapsing worker into the web process
would fake the production topology. So: jobs table is the source of truth; the dev driver
claims `queued` rows with an atomic conditional update (1s poll). True `memory` driver is
kept for unit tests; `bullmq` driver is the production path (and is integration-tested here
against the locally runnable redis-server). Queue semantics stay behind `QueueDriver` either
way.

## D5 — Stripe in-sandbox: DEV_FAKE_CHECKOUT through the real webhook path
api.stripe.com is unreachable here. When `DEV_FAKE_CHECKOUT=1` (dev profile default) the
"buy" action skips Checkout-session creation and instead POSTs a synthetic
`checkout.session.completed` event — signed with the same `Stripe-Signature` v1 HMAC scheme
and `STRIPE_WEBHOOK_SECRET` — to our own `/api/stripe/webhook`. Signature verification,
event idempotency, and ledger crediting are therefore exercised for real; only Stripe's
hosted page is skipped. With real keys configured and the flag off, the code path is
standard Checkout + webhook. Fixture tests sign payloads the same way.

## D6 — Queue/status UI uses polling (2s), not SSE
Brief allows either. Polling is robust across dev/prod proxies and trivial to reason about;
job states are already cheap indexed reads. Revisit only if update latency becomes a real
complaint.

## D7 — `packages/core` added to the mandated package list
Pricing, moderation, rate limiting, and shared zod param schemas are needed by both web and
worker and belong to none of db/queue/storage/video-provider. One small extra package beats
circular deps or duplication.

## D8 — MockProvider assets are pre-rendered and committed
ffmpeg was installed once in Phase 0 to render small per-aspect sample mp4s + jpg thumbnails
(and is used by `scripts/generate-samples.sh` if regeneration is ever needed). Runtime has
zero ffmpeg dependency; MockProvider copies the closest-duration asset for the requested
aspect ratio and reports real file metadata.

## D9 — Credit integrity via unique (reason, reference) + serializable reserve
Every ledger movement carries reason + reference; a unique index on the pair makes refunds
and purchase credits naturally idempotent (double webhook delivery, double failure handling
are no-ops). Reserve runs in a Serializable interactive transaction and re-checks the sum
after inserting the debit row, rolling back on negative balance — correct on SQLite (single
writer) and on Postgres (serializable).

## D14 — Operational: one dev server, watch the port
Resetting dev.db while a dev server holds it open corrupts that server's SQLite handle
("attempt to write a readonly database") and cascades into webpack CSS/vendor-chunk errors;
and a still-bound port 3000 silently pushes a new `next dev` to 3004, so curls hit the stale
server. Lesson recorded for future sessions: kill prior servers and confirm the port before
starting; reset the DB only with the server stopped. Background long-running servers via the
harness's tracked background tasks (they survive across turns), not `nohup … & disown`
(which gets reaped).

## D13 — Client components import pure core submodules, never the barrel
`@reelforge/core`'s index re-exports env.ts (node:fs/node:path). A 'use client' component
importing anything from the barrel makes webpack try to bundle node:fs → build failure
(`UnhandledSchemeError: node:fs`). Fix: granular package exports
(`@reelforge/core/params`, `/pricing`, `/packs`, `/moderation`) that pull zero Node
built-ins; client code imports those. Server code may still use the barrel. Caught only by
loading the page in a real browser — a reminder that typecheck/lint/unit tests don't cover
the server/client bundle boundary (hence the Slice 7 e2e).

## D12 — SQLite clients pinned to connection_limit=1
SQLite is single-writer. Prisma's default pool opens several connections; concurrent
interactive transactions then fight for the write lock and time out (observed: a 10-way
reserve burst hung for >12s). Appending `?connection_limit=1` to every SQLite URL
(client.ts `withSqliteParams`, applied to dev, prod-sqlite, and per-test clones) serializes
this process's transactions on one connection — correct and fast for SQLite (burst now
228ms). Cross-process contention (web + worker on the same file) still surfaces as
SQLITE_BUSY and is absorbed by the ledger's `withWriteRetry`. Postgres URLs are untouched,
so production keeps its real connection pool.

## D11 — Model switch mid-build: Fable 5 → Opus 4.8 (session 1)
Session 1 started on Claude Fable 5 (Phase 0 + scaffold) and was switched by the owner to
`claude-opus-4-8` partway through Slice 1. Per the working agreement, the repo is the source
of truth; the switch changes nothing about the plan. Recorded here so the STATE.md model
attribution stays honest across the handoff.

## D10 — PdsCliProvider is built against captured real CLI help, executed never (here)
Phase 0 successfully installed `@promptdriven/pds@0.1.11` and captured its real command
surface offline (docs/pds-cli-notes.md). The provider therefore uses only verified command
names/flags, but every runtime behavior (JSON shapes, exit codes, artifact download) is
tagged LOCAL-VERIFY and the provider unit tests run against a stub `pds` executable, not the
real one.
