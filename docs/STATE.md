# Build State

_Last update: 2026-07-22, session 1 (started Claude Fable 5, switched to Opus 4.8 mid-Slice-1 — see D11)._

## Current status

**BUILD COMPLETE.** All 7 slices done; Definition of Done holds. 78 tests green (76
unit/integration + 2 Playwright e2e). `.build-complete` created; PR opened.

**Slice 7 complete.** Playwright golden-path e2e (self-contained stack on port 3210, fresh
seeded SQLite via scripts/e2e-boot.mjs): (1) sign up → buy credits → generate → watch →
download, (2) failed job auto-refunds — both green. README rewritten as a full product +
production runbook (Postgres, Redis, S3/R2, Stripe live, PDS credentials, deploy). Finalized
docs/LOCAL-VERIFY.md as the real-CLI validation checklist.

Definition of Done audit:
- ✅ dev profile boots with documented commands (`pnpm install && pnpm db:migrate &&
  pnpm db:seed && pnpm dev`)
- ✅ new user: sign up → buy test-mode credits → generate via MockProvider → watch inline →
  download (e2e + live-verified)
- ✅ failed job refunds automatically (e2e + worker tests + live)
- ✅ full suite green: typecheck, lint, 76 unit/integration, 2 e2e
- ✅ README covers production setup (Postgres, Redis, S3, Stripe live, PDS credentials)
- ✅ docs/LOCAL-VERIFY.md lists exactly what to validate against the real PDS CLI

**Slice 6 complete.** Failure/refund/cancel + admin + PdsCliProvider (9 stub tests), worker
process-job DI + 5 tests (happy/failure+refund/idempotent/cancel-during-gen/timeout),
cancelJob (queued+running), admin area (dashboard, cross-user jobs, failure inspection,
manual refund). Verified live: manual refund 1620→1650 then 409; non-admin blocked 307/403.

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
| 7 | Polish, e2e, docs, runbook | ✅ done |
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
