#!/usr/bin/env bash
# End-to-end PDS pipeline for the Carmack AI-memory explainer video.
#
# Prereqs:
#   - npm install -g @promptdriven/pds   (CLI >= 0.1.10)
#   - Network access to https://video.promptdriven.ai
#   - Either PDS_TOKEN set (raw agent token) or an interactive browser for
#     device login.
#
# The final render length is driven by the script: script.md is ~500 spoken
# words, which lands at roughly 3 minutes of narration.
#
# All mutating commands carry a fixed --idempotency-key so the whole file is
# safe to re-run after a dropped connection.

set -euo pipefail

API_URL="${PDS_API_URL:-https://video.promptdriven.ai}"
PROFILE="${PDS_PROFILE:-carmack}"
PROJECT_ID="${PDS_PROJECT_ID:-carmack-ai-memory-explainer}"
PROJECT_NAME="Carmack AI Memory Explainer"
SCRIPT_FILE="$(cd "$(dirname "$0")" && pwd)/script.md"
IDEM_PREFIX="carmack-explainer:v1"

pdsc() { pds --api-url "$API_URL" --profile "$PROFILE" "$@"; }

echo "== 1. Authenticate =="
if ! pdsc auth status --json >/dev/null 2>&1; then
  if [[ -n "${PDS_TOKEN:-}" ]]; then
    printf '%s\n' "$PDS_TOKEN" | pdsc auth login \
      --with-token --token-stdin --overwrite --json
  else
    # Device login: prints a verification URL to approve in a browser.
    pdsc auth login --json
  fi
fi
pdsc auth status --json

echo "== 2. Create project (idempotent) =="
pdsc projects create \
  --name "$PROJECT_NAME" \
  --project-id "$PROJECT_ID" \
  --idempotency-key "$IDEM_PREFIX:project-create" \
  --json || true   # tolerate already-exists on re-run
pdsc --project "$PROJECT_ID" project get --json

echo "== 3. Set script =="
pdsc --project "$PROJECT_ID" script set \
  --file "$SCRIPT_FILE" \
  --idempotency-key "$IDEM_PREFIX:script-set" \
  --json

echo "== 4. Plan pipeline =="
pdsc --project "$PROJECT_ID" pipeline plan --json

echo "== 5. Run pipeline (waits and follows events; capture runId/eventsUrl) =="
RUN_JSON="$(pdsc --project "$PROJECT_ID" pipeline run \
  --idempotency-key "$IDEM_PREFIX:pipeline-run" \
  --json)"
printf '%s\n' "$RUN_JSON"
RUN_ID="$(printf '%s' "$RUN_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const dig=o=>o&&typeof o==='object'?(o.runId??o.run_id??dig(o.data)??dig(o.run)):undefined;process.stdout.write(String(dig(j)??''))})")"

echo "== 6. Poll status / watch events =="
pdsc --project "$PROJECT_ID" pipeline status --json
if [[ -n "$RUN_ID" ]]; then
  pdsc --project "$PROJECT_ID" jobs watch --run-id "$RUN_ID" --jsonl
fi
pdsc --project "$PROJECT_ID" pipeline status --json

echo "== 7. List artifacts (final video location) =="
pdsc --project "$PROJECT_ID" artifacts list --json
