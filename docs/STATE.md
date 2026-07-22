# Build State

_Last update: 2026-07-22, session 1 (started Claude Fable 5, switched to Opus 4.8 mid-Slice-1 — see D11)._

## Current status

**Slice 4 complete.** Full generation pipeline. 58 tests green (19 new: storage 6, queue 6
incl. real BullMQ-on-Redis + db-claim exclusivity, MockProvider 7). Packages: `storage`
(StorageDriver; local + S3/R2 signed-URL), `queue` (QueueDriver; memory/db-claim/bullmq),
`video-provider` (VideoProvider; MockProvider emits committed per-aspect mp4+thumb, failure
injection). Job submit API (zod + moderation + rate limit + authoritative cost + atomic
reserve+create+enqueue). Worker: claim loop, concurrency cap, progress, graceful shutdown
that re-queues in-flight jobs. Authenticated file route with per-user ownership + Range.

VERIFIED LIVE: buy 550 → submit (cost 30, →520) → worker succeeded in ~4s → real 4s mp4
downloads (206 range OK), cross-user 403, anon 401; force-fail job auto-refunded
(520→498→520); SIGTERM mid-flight re-queued the job, restart drained it to success. Final
ledger balances exactly. Starting Slice 5.

## Slice progress

| # | Slice | Status |
|---|---|---|
| 0 | Phase 0 recon + plan | ✅ done |
| 1 | Scaffold + auth | ✅ done |
| 2 | Credit ledger + pricing | ✅ done |
| 3 | Stripe credits e2e (test mode) | ✅ done |
| 4 | Queue + worker + MockProvider | ✅ done |
| 5 | Product UI | ⬜ next |
| 6 | Failure paths + refunds + admin | ⬜ |
| 7 | Polish, e2e, docs, runbook | ⬜ |

## How to resume

1. Read PLAN.md → this file → docs/DECISIONS.md (constraints live there).
2. `pnpm install` at repo root; `pnpm dev` boots web+worker; `pnpm check` runs
   typecheck+lint+tests (wiring lands in Slice 1).
3. Continue the first ⬜ slice; commit+push per slice; keep this table honest.

## Known landmines for future sessions

- Only branch `claude/reelforge-v1-build-cd8mfo` is pushable (D1).
- video.promptdriven.ai and api.stripe.com are UNREACHABLE from this sandbox — do not burn
  time "fixing" that; it's the environment (docs/ENVIRONMENT.md).
- No Docker daemon, no Postgres server; redis-server IS runnable for bullmq tests.
- Playwright must use the preinstalled Chromium (`/opt/pw-browsers`), never `playwright install`.
