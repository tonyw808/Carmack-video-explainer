# PDS CLI — discovered interface and what still needs local verification

Phase 0 finding: the PDS CLI **is publicly installable** and was interrogated offline in this
environment. Its API host is unreachable here, so nothing below has been executed against the
real service — every mutation attempt fails at `Error: fetch failed` (expected; the package
README itself warns that sandboxed agent sessions block the host).

## Verified facts (from the installed package, not guessed)

- Package: **`@promptdriven/pds`** on npm, version **0.1.11** (12 published versions,
  maintainer gltanaka), bin name **`pds`**, unpacked 532 kB, zero deps, requires Node ≥ 20.
  - Install: `npm install -g @promptdriven/pds`
  - NOTE: the unscoped npm package `pds` is an **unrelated** Barco projector controller. Do
    not install that.
- Homepage/docs: https://video.promptdriven.ai/agents/cli (unreachable from this sandbox;
  readable from a normal browser).
- The CLI is a thin client for the "webapp agent API": *"it does not run generation, upload,
  or provider code directly"*. Model: project → script → pipeline run (stages) → artifacts.
- Global options: `--api-url <url>`, `--token <token>`, `--profile <name>`, `--project <id>`,
  `--json` (one final JSON object), `--jsonl` (event per line), `--verbose`, `--version`.
- Env vars referenced by README: **`PDS_API_URL`**, **`PDS_TOKEN`**, **`PDS_PROJECT_ID`**.
- Command groups: `auth`, `projects`, `project`, `script`, `artifacts`, `pipeline`, `jobs`,
  `github-release-video`, `distribution`, `reference-library`, `release-video`.

### Commands relevant to Reelforge's per-job flow (help text captured verbatim in this repo's history)

| Step | Command | Verified detail |
|---|---|---|
| Create project | `pds projects create` | exists; per-command help not printed (falls through to global usage); goes straight to network |
| Set script | `pds script set --project <id> --file <path> [--target tts] --idempotency-key <key> --json` | writes the main script by default; only alternate target is `tts` |
| Generate script | `pds script generate` | exists (server-side generation from a prompt, presumably) |
| Run pipeline | `pds pipeline run --project <id> [--to <target>] [--stage <stage>] [--mode <mode>] [--dry-run] [--wait] [--force-regenerate] [--idempotency-key <key>] [--json]` | full help captured; `--wait` is default unless `--dry-run`; stages named in examples: `specs`, `compositions`, `veo`, target example `--to render`; selector flags `--sections/--files/--segments/--clips` |
| Status | `pds pipeline status --project <id> --json` | full help captured |
| Watch | `pds jobs watch --run-id <id> [--jsonl]` | `--run-id` is required (verified by error message) |
| Cancel | `pds jobs cancel --job-id <id>` (flag `--job-id` seen in binary strings) + `pds pipeline stop` | exists |
| Artifacts | `pds artifacts list --project <id>` / `pds artifacts delete` | "Missing project id. Pass --project or set PDS_PROJECT_ID." (verified error) |

### Auth (verified from help + README)

- Interactive: `pds auth login` — **device login**; needs a browser on any machine plus API
  egress from the CLI host. Not usable for a headless worker.
- **Server/CI path (what Reelforge's worker will use):** mint an agent token once
  (`pds auth token create --label <l> --project <id> --scopes <s,...> --expires-in 30d --json`
  or from the Studio UI), store the returned-once `rawToken` in the secret store, and pass it
  as **`PDS_TOKEN`** with **`PDS_API_URL`** on every invocation. README's recommended scope set
  for automation: `project:create,project:read,project:write,pipeline:run,artifact:read`
  (+`distribution:*` only if publishing — Reelforge does not publish).
- Idempotency: non-dry-run mutating commands require/accept `--idempotency-key`; server-side
  idempotency is atomic. Reelforge will derive keys from its own job ids
  (`reelforge:job:<id>:<step>`).

## How PdsCliProvider is structured against this (packages/video-provider/src/pds-cli.ts)

Per job, in an isolated working directory (`.data/pds/<jobId>/`):
1. `pds projects create --name reelforge-<jobId> --json` → parse project id.
2. Write the user prompt (+ params) to `script.md`; `pds script set --project <id> --file
   script.md --idempotency-key reelforge:job:<jobId>:script --json`.
3. `pds pipeline run --project <id> --to <PDS_PIPELINE_TARGET> --wait --json
   --idempotency-key reelforge:job:<jobId>:run` under the hard timeout.
4. On success `pds artifacts list --project <id> --json` → locate mp4 + thumbnail → hand
   paths/URLs to the StorageDriver.
5. Cancel → `pds pipeline stop --project <id>` (and/or `jobs cancel`).

Every subprocess call: `PDS_API_URL`+`PDS_TOKEN` env, `--json`, captured stdout/stderr
persisted to the job's provider log, env-configurable hard timeout (default 15 min), bounded
retries with exponential backoff for transient failures, concurrency cap (default 2).

## MUST VERIFY LOCALLY (in order) — none of this is guessable from the sandbox

1. **Onboarding**: read https://video.promptdriven.ai/agents/cli; create an account; confirm
   how an agent token is minted for a fresh account (Studio UI vs `pds auth token create`
   after device login) and which scopes a plain text-to-video flow actually needs.
2. **`pds projects create` exact flags** (its `--help` prints only global usage): confirm
   `--name` (seen in binary strings) and the JSON response shape → which field is the
   project id.
3. **The minimal text-to-video pipeline**: what `--to <target>` value produces a rendered
   video for a plain prompt (examples show `--to render`; stage list shows `specs`,
   `compositions`, `veo`); whether `script generate --prompt-file` fits better than
   `script set` for a raw user prompt; what `--mode` values exist.
4. **`pipeline run --wait --json` terminal payload**: field names for success/failure, the
   run id (for `jobs watch --run-id`), and CLI **exit codes** on success / provider failure /
   cancellation / timeout. Exit codes are completely unverified.
5. **Artifact retrieval mechanism**: what `artifacts list --json` returns (signed URLs?
   storage paths? artifact ids?) and how bytes are actually downloaded (the flag inventory
   shows `--path` and `--file` strings; there may or may not be a `download` subcommand).
   This determines whether PdsCliProvider's `collectArtifacts` does HTTP GETs or file copies.
6. **Reference image support**: whether a per-job reference image maps to the
   `reference-library` group (verified to exist, admin-gated by server feature flag) or a
   simpler per-project upload; Reelforge passes `referenceImagePath` to the provider either
   way.
7. **Cancellation semantics**: `pipeline stop` vs `jobs cancel --job-id`; whether cancelled
   paid work is charged; propagate to Reelforge's refund policy for `canceled`.
8. **Cost/quota semantics**: how PDS charges per run (the CLI mentions "paid work" and
   `--audit-fix-max-spend-pddc`), so Reelforge credit pricing can be margin-aware.
9. **Progress signal**: whether `jobs watch --jsonl` events carry a usable progress
   percentage to surface in the queue UI.
10. **Version drift**: re-run `pds --help` after `npm i -g @promptdriven/pds@latest`; the
    package is a week old and moving (12 versions), so re-capture help before finalizing.

Verification harness for all of the above: `docs/LOCAL-VERIFY.md` step "PDS CLI dry run",
plus `PDS_SMOKE=1 pnpm --filter @reelforge/video-provider test:pds-smoke` which runs the
provider against the real CLI with a $0 `--dry-run` first.
