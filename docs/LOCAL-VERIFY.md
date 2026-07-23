# LOCAL-VERIFY — validate against the real PDS CLI on your machine

Everything in Reelforge runs and is tested in the cloud dev environment **except** the real
PDS video provider: `video.promptdriven.ai` is unreachable from that sandbox, so
`PdsCliProvider` was built against the CLI's *captured help output* but never executed against
the live service. This checklist is what to run on a machine with real PDS credentials and
network access before trusting `VIDEO_PROVIDER=pds-cli` — especially before the first **paid**
run.

The provider's code marks every unverified assumption with a `LOCAL-VERIFY` comment
(`packages/video-provider/src/pds-cli.ts`); this doc is the companion runbook. Background on
what was discovered offline is in `docs/pds-cli-notes.md`.

## 0. Prerequisites

```bash
npm install -g @promptdriven/pds        # the scoped package; NOT the unrelated "pds" projector CLI
pds --version                            # expect >= 0.1.11, Node >= 20
```

Read the onboarding guide first: <https://video.promptdriven.ai/agents/cli>.

## 1. Auth — mint an agent token

Reelforge's worker is headless, so it uses an agent token (not interactive device login):

```bash
pds auth login --api-url https://video.promptdriven.ai --profile reelforge   # device login (one-time, interactive)
pds auth token create \
  --label reelforge-worker \
  --all-my-projects \
  --scopes project:create,project:read,project:write,pipeline:run,artifact:read \
  --expires-in 30d --json
```

- [ ] Confirm which scopes a **plain text-to-video** flow actually needs (the set above is
      the README's automation recommendation; trim if the server rejects any).
- [ ] Store the returned-once `rawToken` as `PDS_TOKEN`; set `PDS_API_URL`.
- [ ] `pds auth status --json` shows the expected token id, scopes, and project allowlist.

## 2. Verify each command Reelforge calls (use `--dry-run` where available)

Run these by hand and **record the real JSON shapes and exit codes** — then reconcile them
with the `pick([...])` field-name guesses and the artifact parsing in `pds-cli.ts`.

- [ ] **`pds projects create --name reelforge-test --json`** — its `--help` only prints global
      usage, so confirm `--name` is correct and note **which field is the project id** (the code
      tries `id` / `projectId` / `project_id`).
- [ ] **`pds script set --project <id> --file script.md --idempotency-key k1 --json`** —
      confirm it accepts the prompt-as-script and succeeds (exit 0).
- [ ] **`pds pipeline run --project <id> --to <TARGET> --wait --json --idempotency-key k2`** —
      the critical one. Determine:
  - [ ] which `--to` **target** produces a rendered video for a plain prompt (examples show
        `--to render`; the stage list mentions `specs`, `compositions`, `veo`). Set
        `PDS_PIPELINE_TARGET` accordingly.
  - [ ] the terminal JSON **status** field name/values (code matches
        `succeeded|success|complete|completed|ready`).
  - [ ] the **run id** field (for `jobs watch --run-id`).
  - [ ] the **exit code** on success vs provider failure vs cancel vs timeout (completely
        unverified — the retry/backoff and failure mapping depend on this).
  - [ ] whether `script generate --prompt-file` is a better fit than `script set` for a raw
        user prompt.
- [ ] **`pds artifacts list --project <id> --json`** — the biggest unknown. Determine whether
      it returns **local paths**, **signed URLs**, or **artifact ids**, and how to fetch the
      actual mp4 + thumbnail bytes. `pds-cli.ts::materialize()` currently assumes a local
      `path`; if it's URLs/ids, implement the documented download step there.
  - [ ] confirm real **width / height / duration** are available (or add an ffprobe step).
- [ ] **Cancellation**: `pds pipeline stop --project <id>` vs `pds jobs cancel --job-id <id>`;
      whether cancelled paid work is charged (affects the refund policy for canceled jobs).

## 3. Wire it into Reelforge and run one real job

```bash
export VIDEO_PROVIDER=pds-cli
export PDS_API_URL=https://video.promptdriven.ai
export PDS_TOKEN=...            # the rawToken from step 1
export PDS_PIPELINE_TARGET=render   # from step 2
pnpm dev
```

- [ ] Submit a short, cheap generation through the UI.
- [ ] Watch the worker log: `projects create → script set → pipeline run → artifacts list`.
- [ ] Confirm the mp4 + thumbnail land in storage and play in `/library`.
- [ ] Force a provider failure (e.g. an intentionally bad request) and confirm the job is
      marked failed with a user-safe message **and credits are refunded**.
- [ ] Cancel a running job and confirm the pipeline actually stops server-side.

## 4. Cost / margin

- [ ] Determine how PDS charges per run (the CLI mentions "paid work" and
      `--audit-fix-max-spend-pddc`). Re-price `packages/core/src/pricing.ts` so a job's credit
      cost comfortably exceeds the real provider cost.

## 5. Version drift

- [ ] `@promptdriven/pds` is young and moving fast (12 published versions in the first weeks).
      Re-capture `pds --help` and each group's `--help` after upgrading, and re-run this
      checklist, before relying on it in production.

---

When every box is checked, update `docs/pds-cli-notes.md` and remove the `LOCAL-VERIFY`
markers in `pds-cli.ts` that you've resolved, replacing the guessed field names with the real
ones.
