# Build State

_Last update: 2026-07-22, session 1 (started Claude Fable 5, switched to Opus 4.8 mid-Slice-1 — see D11)._

## Current status

**Slice 2 complete.** Credit ledger + pricing built tests-first. 26 tests green: pricing
function (base + per-second, monotonic, round-up), moderation deny module (csam /
nonconsensual real-person / incitement, with over-block guards), and the ledger —
append-only, balance = SUM(delta), serializable reserve that refuses to overdraw, and full
idempotency on (reason, reference). Concurrency invariant test proves no overdraw under a
10-way burst. Balance API + session guards added. Starting Slice 3.

Key impl note: SQLite clients use `?connection_limit=1` (D12) so intra-process interactive
transactions serialize cleanly; cross-process SQLITE_BUSY handled by ledger write-retry.

## Slice progress

| # | Slice | Status |
|---|---|---|
| 0 | Phase 0 recon + plan | ✅ done |
| 1 | Scaffold + auth | ✅ done |
| 2 | Credit ledger + pricing | ✅ done |
| 3 | Stripe credits e2e (test mode) | ⬜ next |
| 4 | Queue + worker + MockProvider | ⬜ |
| 5 | Product UI | ⬜ |
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
