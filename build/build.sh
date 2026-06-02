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

# Infer current season (Sep 30 cutoff)
current_year=$(date +%Y)
current_month=$(date +%-m)
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

echo "=== nbn build completed at $(date) ==="
