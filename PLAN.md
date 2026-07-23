# Reelforge v1 — Build Plan

A paid AI video generation platform (Runway/Higgsfield-style, minimal but real): sign up →
buy credits → prompt → queued job → worker orchestrates a video provider → mp4 + thumbnail in
the library. Video generation is performed by the PDS CLI (video.promptdriven.ai) invoked
server-side by a worker; in this sandbox the MockProvider stands in (see
docs/ENVIRONMENT.md and docs/pds-cli-notes.md).

## Fixed architecture

- **Monorepo (pnpm workspaces)**: `apps/web` (Next.js 15 App Router + TS), `apps/worker`
  (Node + tsx), `packages/db` (Prisma), `packages/core` (pricing, moderation, rate limit,
  shared zod schemas), `packages/queue`, `packages/storage`, `packages/video-provider`.
- **DB**: Prisma; SQLite profile for dev/test here, Postgres profile for production
  (`schema.postgres.prisma` kept in sync by script + test).
- **Queue**: `QueueDriver` interface; drivers: `db` (dev default; DB-claim polling, works
  across processes with zero infra), `bullmq` (production; integration-tested against local
  redis-server), `memory` (unit tests).
- **Storage**: `StorageDriver` interface; drivers: `local` (dev; `.data/storage` served by an
  authenticated route) and `s3` (R2/S3 with signed URLs).
- **Auth**: Auth.js v5, Prisma adapter, database sessions; email magic link (dev: link logged
  to console + dev-only retrieval endpoint) and Google OAuth (enabled only when env present).
- **Payments**: Stripe Checkout + webhook for credit packs; webhook idempotent via
  `stripe_events`; in-sandbox purchases run through DEV_FAKE_CHECKOUT which posts a
  correctly-signed synthetic `checkout.session.completed` to the real webhook route.
- **Provider**: `VideoProvider` interface (`createJob`, `awaitCompletion`, `collectArtifacts`,
  `cancel`); `MockProvider` (default here; real committed mp4/jpg assets, simulated delay,
  deterministic failure injection) and `PdsCliProvider` (structured against the captured real
  CLI interface; requires local verification per docs/LOCAL-VERIFY.md).
- **Credits**: append-only `credit_ledger`; balance = SUM(delta); deduct on enqueue in a
  serializable transaction; automatic refund on failure/cancel; single pricing module.

## Vertical slices

Each slice ends: typecheck + lint + tests green → commit → push → docs/STATE.md updated.

1. **Scaffold + auth** — pnpm workspace; Next.js boots; Prisma schema v1 + migration;
   Auth.js magic-link (console) + Google-if-configured; sign in/out UI shell with nav;
   `.env.example`; base typecheck/lint/test wiring.
2. **Credit ledger + pricing (tests-first core)** — `packages/core` pricing function +
   config; ledger operations (reserve/refund/purchase/adjust) with serializable
   transactions, unique (reason,reference) idempotency, invariant tests; balance API.
3. **Stripe credits end-to-end (test mode)** — price_config-seeded packs; checkout route
   (real Stripe when configured, dev fake-checkout here); webhook route with signature
   verification + `stripe_events` idempotency; signed-fixture tests; billing page v1
   (buy, balance, ledger table).
4. **Queue + worker + MockProvider happy path** — QueueDriver (db/memory/bullmq) with
   tests (bullmq against local redis); job submission API (zod validation, moderation,
   rate limit, cost preview parity, transactional debit); worker loop (claim, concurrency
   cap, heartbeat, graceful shutdown); MockProvider emitting committed sample mp4+thumb;
   StorageDriver local; videos persisted.
5. **Product UI** — landing page; generate page (prompt, duration, aspect, preset,
   optional reference image upload, live cost preview); queue view (polling, progress,
   cancel-while-queued); library (grid, inline playback, download, delete); nav with live
   credit balance.
6. **Failure paths + refunds + admin** — failure injection → user-safe error + automatic
   refund (idempotent); cancel refund; PdsCliProvider implementation + unit tests against
   a stub `pds` binary; admin area (role-gated): cross-user jobs, failure inspection
   (provider logs), manual refund, usage dashboard; per-user rate limit enforcement tests.
7. **Polish + docs + verification** — Playwright e2e of the golden path (signup → buy →
   generate → watch → download → failed-job refund); README production runbook (Postgres,
   Redis, S3, Stripe live, PDS credentials); docs/LOCAL-VERIFY.md finalized; final green
   suite; `.build-complete`; PR.

## Definition of Done (v1, this environment)

- `pnpm dev` (documented) boots web + worker on the dev profile with zero external services.
- New user: sign up → buy test-mode credits → generate via MockProvider → watch inline in
  library → download the mp4.
- A failed job refunds automatically; ledger always sums to balance (invariant-tested).
- Full suite green: typecheck, lint, unit/integration, e2e.
- README covers production setup (Postgres, Redis, S3/R2, Stripe live, PDS credentials);
  docs/LOCAL-VERIFY.md lists exactly what to validate against the real PDS CLI locally.
- `.build-complete` exists; PR open summarizing the build.
