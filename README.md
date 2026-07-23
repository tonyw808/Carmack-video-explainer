# Reelforge

A production-grade, paid AI **video generation** platform (in the spirit of Runway /
Higgsfield): users sign up, buy credits, submit a text prompt (plus optional reference image
and settings), and receive an AI-generated video they can preview, download, and manage in a
library. Payments are real (Stripe), the job queue is real, and real video files are
delivered.

Video generation is performed by the **PDS CLI** (`@promptdriven/pds`,
[video.promptdriven.ai](https://video.promptdriven.ai)), invoked server-side by a worker.
The web app never generates video itself — it orchestrates the provider behind a clean
interface, so a **MockProvider** stands in wherever the real CLI can't run (e.g. CI, this
repo's cloud dev environment).

> **New to this repo?** Read `PLAN.md` (the build plan), then `docs/STATE.md` (current
> status), `docs/DECISIONS.md` (why things are the way they are), `docs/ENVIRONMENT.md`
> (dev-environment findings), and `docs/LOCAL-VERIFY.md` (what to check against the real PDS
> CLI on your machine).

---

## Architecture

Monorepo (pnpm workspaces):

| Package | Role |
|---|---|
| `apps/web` | Next.js 15 (App Router) — UI + API routes + Auth.js + Stripe |
| `apps/worker` | Node worker — claims jobs, orchestrates the video provider |
| `packages/core` | Pricing, moderation, rate-limit, shared zod schemas, env loader |
| `packages/db` | Prisma schema + client, credit ledger, job lifecycle |
| `packages/queue` | `QueueDriver` interface + `memory` / `db` / `bullmq` drivers |
| `packages/storage` | `StorageDriver` interface + `local` / `s3` drivers |
| `packages/video-provider` | `VideoProvider` interface + `MockProvider` / `PdsCliProvider` |

Everything swappable is behind an interface with a dev driver (zero external infra) and a
production driver:

| Concern | Dev / this environment | Production |
|---|---|---|
| Database | **SQLite** via Prisma (`file:./.data/dev.db`) | **Postgres** (`schema.postgres.prisma`) |
| Queue | **`db`** driver (atomic row-claim, no infra) | **`bullmq`** on Redis |
| Storage | **`local`** disk, served by an authenticated route | **`s3`** (AWS S3 / Cloudflare R2) with signed URLs |
| Payments | **`DEV_FAKE_CHECKOUT`** → real, signed webhook | Stripe Checkout (test or live) + webhooks |
| Auth email | magic link **logged to console** | SMTP delivery |
| Video | **MockProvider** (real sample mp4s) | **PdsCliProvider** (real PDS CLI) |

The credit ledger is append-only: a user's balance is exactly `SUM(delta)` over their rows.
Credits are reserved on enqueue inside a serializable transaction and refunded automatically
on failure or cancellation. See `docs/DECISIONS.md` D9.

---

## Quick start (dev profile — no external services)

Requires **Node ≥ 20** and **pnpm 10** (`corepack enable` or `npm i -g pnpm`).

```bash
pnpm install
pnpm db:migrate        # create + migrate the SQLite dev database
pnpm db:seed           # seed pricing + credit packs
pnpm dev               # start web (http://localhost:3000) AND the worker
```

Then, in the browser:

1. **Sign in** at `/signin` with any email. The magic link is **printed to the server
   console** (and available at `/api/dev/magic-link?email=you@example.com`). Open it to
   finish signing in — this creates your account.
2. **Buy credits** at `/billing`. With no Stripe keys, purchases run through the dev
   fake-checkout, which posts a correctly **signed** `checkout.session.completed` event to
   the real webhook route — so crediting, signature verification, and idempotency are all
   exercised for real.
3. **Generate** at `/generate`: prompt, duration, aspect ratio, style, optional reference
   image, with a live cost preview. Submit → the job appears in `/queue`.
4. **Watch it render** in `/queue` (live progress), then play and download it from
   `/library`.

No `.env` is needed for dev — committed defaults live in `.env.defaults`. Copy `.env.example`
to `.env` to override anything.

### Commands

```bash
pnpm dev            # web + worker (dev orchestrator)
pnpm dev:web        # web only
pnpm dev:worker     # worker only
pnpm typecheck      # tsc across all packages
pnpm lint           # eslint
pnpm test           # vitest (unit + integration)
pnpm e2e            # Playwright golden-path e2e (starts its own stack on port 3210)
pnpm check          # typecheck + lint + test
pnpm db:migrate     # prisma migrate dev (SQLite)
pnpm db:seed        # seed price config
pnpm db:check-schemas  # verify the SQLite and Postgres schemas are in sync
```

The BullMQ queue driver is integration-tested against a real Redis when `REDIS_URL` is set:

```bash
redis-server --daemonize yes
REDIS_URL=redis://localhost:6379 pnpm test
```

---

## Environment variables

`.env.example` is the full catalogue with inline guidance. Precedence: real environment >
`.env` > committed `.env.defaults`. Highlights:

- **Database**: `DATABASE_URL`
- **Auth**: `AUTH_SECRET`, `AUTH_URL`, `APP_URL`, optional `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, optional `EMAIL_SERVER`/`EMAIL_FROM`
- **Queue**: `QUEUE_DRIVER` (`db`|`bullmq`|`memory`), `REDIS_URL`
- **Storage**: `STORAGE_DRIVER` (`local`|`s3`), `STORAGE_LOCAL_ROOT`, `S3_*`
- **Provider**: `VIDEO_PROVIDER` (`mock`|`pds-cli`), `MOCK_*`, `PDS_*`
- **Worker**: `WORKER_CONCURRENCY`, `WORKER_SHUTDOWN_GRACE_MS`, `PROVIDER_TIMEOUT_MS`, `PROVIDER_MAX_RETRIES`
- **Stripe**: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `DEV_FAKE_CHECKOUT`
- **Product**: `SIGNUP_BONUS_CREDITS`, `RATE_LIMIT_JOBS_PER_MINUTE`, `ADMIN_EMAILS`

Secrets are **never** committed. `ADMIN_EMAILS` (comma-separated) grants the admin role at
sign-in; admins get `/admin` (usage dashboard, cross-user jobs, failure inspection, manual
refunds).

---

## Production setup / deploy runbook

### 1. PostgreSQL

The Prisma schema is portable (no enums, no JSON columns — see `docs/DECISIONS.md` D3). The
Postgres profile is generated from the SQLite source of truth and kept in sync by a checked
test.

```bash
export DATABASE_URL="postgresql://USER:PASS@HOST:5432/reelforge?schema=public"
pnpm --filter @reelforge/db sync-schemas          # regenerate schema.postgres.prisma
pnpm --filter @reelforge/db exec prisma migrate deploy --schema prisma/schema.postgres.prisma
pnpm db:seed
```

### 2. Redis (BullMQ queue)

```bash
export QUEUE_DRIVER=bullmq
export REDIS_URL="redis://:PASSWORD@HOST:6379"
```

Run one or more `apps/worker` processes; BullMQ distributes jobs and guarantees single
delivery. `WORKER_CONCURRENCY` caps concurrent jobs per worker.

### 3. S3 / R2 storage

```bash
export STORAGE_DRIVER=s3
export S3_ENDPOINT="https://<account>.r2.cloudflarestorage.com"   # omit for AWS S3
export S3_REGION=auto
export S3_BUCKET=reelforge
export S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=...
export S3_FORCE_PATH_STYLE=1                                       # R2/minio: 1, AWS: 0
export S3_SIGNED_URL_TTL_SECONDS=900
```

Videos are private; clients receive time-limited signed GET URLs (the `/api/files` route is
only used by the local driver).

### 4. Stripe (live or test mode)

```bash
export STRIPE_SECRET_KEY=sk_live_...           # or sk_test_...
export STRIPE_PUBLISHABLE_KEY=pk_live_...
export STRIPE_WEBHOOK_SECRET=whsec_...         # from the Stripe dashboard webhook endpoint
unset DEV_FAKE_CHECKOUT                          # MUST be off in production
```

Create a webhook endpoint in the Stripe dashboard pointing at
`https://YOUR_HOST/api/stripe/webhook` for the `checkout.session.completed` event. The
handler verifies signatures with Stripe's documented scheme, is idempotent (event id +
ledger reference), and derives credits from the purchased pack (never from the event
amount).

### 5. PDS credentials (real video generation)

```bash
export VIDEO_PROVIDER=pds-cli
export PDS_API_URL=https://video.promptdriven.ai
export PDS_TOKEN=<agent token rawToken>        # scopes: project:create,project:read,project:write,pipeline:run,artifact:read
export PDS_BIN=pds                              # npm i -g @promptdriven/pds
export PDS_PIPELINE_TARGET=render              # VERIFY locally first — see docs/LOCAL-VERIFY.md
```

**Before the first paid run**, work through `docs/LOCAL-VERIFY.md`: the CLI's command
names/flags are captured from its real help output, but its JSON response shapes, exit
codes, and artifact-download mechanism must be confirmed against the live service.

### 6. Auth email delivery

Set `EMAIL_SERVER` (SMTP URL) and `EMAIL_FROM` so magic links are emailed instead of logged.
Generate a real `AUTH_SECRET` (`openssl rand -base64 32`). Configure Google OAuth by setting
`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

### 7. Build & run

```bash
pnpm --filter @reelforge/web build
pnpm --filter @reelforge/web start     # Next.js server
pnpm --filter @reelforge/worker start  # one or more workers
```

Run the web app and worker(s) as separate services. Workers shut down gracefully on
SIGTERM/SIGINT: they stop claiming new jobs and re-queue any in-flight job within
`WORKER_SHUTDOWN_GRACE_MS`.

---

## Safety & security

- **Prompt moderation** blocks clearly prohibited content (sexual content involving minors,
  targeted real-person sexual/deepfake content, incitement to violence) in one reviewable
  module (`packages/core/src/moderation.ts`) before any spend.
- **Per-user rate limiting** on job submission (`RATE_LIMIT_JOBS_PER_MINUTE`).
- **Input validation** everywhere via zod.
- **Storage objects are private** — owner-scoped access (or admin), signed URLs in prod.
- All secrets via env; `.env.example` documents everything; nothing sensitive is committed.

---

## Testing

- **Unit + integration**: `pnpm test` (vitest). Covers pricing, moderation, the credit
  ledger (including a concurrency no-overdraw invariant), Stripe signature/idempotency,
  storage, all three queue drivers (BullMQ against real Redis when `REDIS_URL` is set), both
  providers (MockProvider + PdsCliProvider against a stub CLI), and the worker's
  happy/failure/refund/cancel/timeout paths.
- **End-to-end**: `pnpm e2e` (Playwright) drives the full golden path in a real browser
  against a self-contained stack: sign up → buy credits → generate → watch → download, plus
  automatic refund on a failed job.
