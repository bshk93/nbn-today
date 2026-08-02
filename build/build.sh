#!/usr/bin/env bash
set -e
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SEASONS_CONF="$SCRIPT_DIR/seasons.conf"
JOB_R="$SCRIPT_DIR/job.R"
LOG_FILE="/var/log/nbn-build.log"

exec > >(tee -a "$LOG_FILE") 2>&1
trap 'echo "Error at $(date). Exiting!"; exit 1' ERR
trap 'echo "Build exited at $(date)"' EXIT

export NBS_DATA_DIR="${NBS_DATA_DIR:-/var/lib/nothing-but-stats}"
export NBN_REPO_ROOT="$REPO_ROOT"
export NBN_BUILD_DIR="$SCRIPT_DIR"

# Infer current season (Sep 30 cutoff).
# League time, not the host clock: the box runs UTC, so on Sep 30 the cutoff
# would flip to the next season at 8pm ET on the 30th rather than at midnight.
current_year=$(TZ=America/New_York date +%Y)
current_month=$(TZ=America/New_York date +%-m)
if [[ "$current_month" -le 9 ]]; then
  y1=$(( current_year - 1 ))
  y2=$current_year
else
  y1=$current_year
  y2=$(( current_year + 1 ))
fi
SEASON="${y1: -2}-${y2: -2}"

# Auto-lookup playoffs_from from seasons.conf
PLAYOFFS_FROM=""
if [[ -f "$SEASONS_CONF" ]]; then
  PLAYOFFS_FROM=$(grep "^${SEASON}=" "$SEASONS_CONF" | cut -d= -f2 || true)
fi

echo "=== nbn build started at $(date) ==="
echo "Season: $SEASON, Playoffs From: ${PLAYOFFS_FROM:-none}"

echo "--- syncing owners.csv from members.json ---"
python3 "$SCRIPT_DIR/sync_owners.py"

echo "--- running R build ---"
Rscript "$JOB_R" "$SEASON" "${PLAYOFFS_FROM:-}" ""

# Verify the build's output still satisfies what the pages read. The docroot is
# a symlink to this tree, so anything broken here is already live — surface it
# loudly rather than letting a renamed column ship silently.
echo "--- verifying data contract ---"
SMOKE_STATUS=0
python3 "$SCRIPT_DIR/smoke_test.py" --quiet || SMOKE_STATUS=$?

if [[ "$SMOKE_STATUS" -ne 0 ]]; then
  echo "!!! DATA CONTRACT BROKEN — pages are reading columns the build no longer writes"
fi

echo "=== nbn build completed at $(date) ==="
exit "$SMOKE_STATUS"
