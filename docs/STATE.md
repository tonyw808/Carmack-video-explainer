# Build State

_Last update: 2026-07-22, session 1 (started Claude Fable 5, switched to Opus 4.8 mid-Slice-1 — see D11)._

## Current status

**Slice 1 complete.** pnpm workspace + Next 15 + worker + Prisma(SQLite) all boot. Auth.js v5
magic-link flow verified END TO END over HTTP (request link → dev retrieval endpoint →
callback → live DB session, role defaulting works). Full suite green. Starting Slice 2.

## Slice progress

| # | Slice | Status |
|---|---|---|
| 0 | Phase 0 recon + plan | ✅ done |
| 1 | Scaffold + auth | ✅ done |
| 2 | Credit ledger + pricing | ⬜ next |
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
