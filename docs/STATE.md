# Build State

_Last update: 2026-07-22, session 1 (started Claude Fable 5, switched to Opus 4.8 mid-Slice-1 — see D11)._

## Current status

**Slice 6 complete.** Failure/refund/cancel + admin + PdsCliProvider. 76 tests green (18
new: 9 pds-cli stub, 5 worker process-job, 4 job-enforcement). PdsCliProvider fully built
against the captured real CLI with an injectable runner (stub-tested: argv, JSON parse,
retry/backoff, timeout/cancel, create→run→collect) — every runtime unknown marked
LOCAL-VERIFY. Worker process-job refactored for dependency injection; tests prove happy
(video persisted, credit spent), failure (failed + user-safe error + auto-refund, refund
idempotent), cancel-during-generation (artifacts discarded, refunded once), and timeout.
cancelJob now handles queued+running (worker detects via progress check and aborts;
success-commit guarded on 'running'). Admin area (role-gated): usage dashboard, cross-user
jobs, failure inspection (user error + raw provider log), manual refund (idempotent).

VERIFIED LIVE: admin dashboard + failure inspection rendered; manual refund 1620→1650 then
409 on repeat; non-admin blocked 307/403. Starting Slice 7.

## Slice progress

| # | Slice | Status |
|---|---|---|
| 0 | Phase 0 recon + plan | ✅ done |
| 1 | Scaffold + auth | ✅ done |
| 2 | Credit ledger + pricing | ✅ done |
| 3 | Stripe credits e2e (test mode) | ✅ done |
| 4 | Queue + worker + MockProvider | ✅ done |
| 5 | Product UI | ✅ done |
| 6 | Failure paths + refunds + admin | ✅ done |
| 7 | Polish, e2e, docs, runbook | ⬜ next |
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
