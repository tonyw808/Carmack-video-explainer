# Build State

_Last update: 2026-07-22, session 1 (started Claude Fable 5, switched to Opus 4.8 mid-Slice-1 — see D11)._

## Current status

**Slice 5 complete.** All product surfaces built and VERIFIED LIVE with Playwright
screenshots: landing (hero, gallery, how-it-works, pricing), generate (prompt, duration
slider, aspect, style pills, reference-image upload, live cost preview using the SAME
computeJobCost the server bills with), queue (2s polling, live progress bar, cancel-
while-queued), library (inline video playback, download-as-blob, delete), billing, and a
live credit-balance pill in nav. Endpoints added: /api/uploads (reference images),
/api/jobs/:id/cancel (atomic queued→canceled + refund), DELETE /api/jobs/:id. Golden path
confirmed through the browser: sign in → buy → generate → watch inline → download.

Two real bugs found+fixed via live testing (D13, D14): client components pulling env.ts/
node:fs through the core barrel (fixed with granular `@reelforge/core/{params,pricing,...}`
exports); operational port-collision confusion (stale dev servers). 58 tests still green.
Starting Slice 6.

## Slice progress

| # | Slice | Status |
|---|---|---|
| 0 | Phase 0 recon + plan | ✅ done |
| 1 | Scaffold + auth | ✅ done |
| 2 | Credit ledger + pricing | ✅ done |
| 3 | Stripe credits e2e (test mode) | ✅ done |
| 4 | Queue + worker + MockProvider | ✅ done |
| 5 | Product UI | ✅ done |
| 6 | Failure paths + refunds + admin | ⬜ next |
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
