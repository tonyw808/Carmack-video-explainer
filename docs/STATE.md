# Build State

_Last update: 2026-07-20, session 1 (Claude Fable 5)._

## Current status

**Phase 0 complete.** Environment probed (docs/ENVIRONMENT.md), PDS CLI discovered on npm and
interrogated offline (docs/pds-cli-notes.md), PLAN.md written. Starting Slice 1.

## Slice progress

| # | Slice | Status |
|---|---|---|
| 0 | Phase 0 recon + plan | ✅ done |
| 1 | Scaffold + auth | ⬜ next |
| 2 | Credit ledger + pricing | ⬜ |
| 3 | Stripe credits e2e (test mode) | ⬜ |
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
