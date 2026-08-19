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
export NBN_OUT_DIR="${NBN_OUT_DIR:-$NBS_DATA_DIR/derived}"
export NBN_BUILD_DIR="$SCRIPT_DIR"

# The aggregation is Python, in nbn-api (`stats_build`), since 2026-08-19 —
# see docs/stats-pipeline-port-spec.md. R is kept dormant for one full season
# so every seasonal path (playoffs, awards, rings) runs at least once under
# the new code before it goes; `NBN_STATS_ENGINE=r bash build.sh` is how you
# reach it, and it is the rollback if the Python build ever misbehaves.
NBN_STATS_ENGINE="${NBN_STATS_ENGINE:-python}"
NBN_API_DIR="${NBN_API_DIR:-/home/skim/projects/nbn-api}"

echo "=== nbn build started at $(date) ==="
echo "Engine: $NBN_STATS_ENGINE"

echo "--- syncing owners.csv from members.json ---"
python3 "$SCRIPT_DIR/sync_owners.py"

if [[ "$NBN_STATS_ENGINE" == "python" ]]; then
  echo "--- running Python build ($NBN_API_DIR) ---"
  PY="$NBN_API_DIR/venv/bin/python3"
  [[ -x "$PY" ]] || PY=python3
  # Run from the API root so `-m` puts it on sys.path. stats_build is
  # stdlib-only, so the venv is a consistency choice, not a requirement. The
  # season is resolved inside it (stats_build/buildargs.py) and echoed there —
  # there is deliberately no second copy of the Sep 30 cutoff on this path.
  ( cd "$NBN_API_DIR" && "$PY" -m stats_build )

elif [[ "$NBN_STATS_ENGINE" == "r" ]]; then
  # Dormant path. The season inference below is the last copy of the cutoff
  # rule outside Python, and it goes when R does (port spec Phase 4).
  current_year=$(TZ=America/New_York date +%Y)
  current_month=$(TZ=America/New_York date +%-m)
  if [[ "$current_month" -le 9 ]]; then
    y1=$(( current_year - 1 )); y2=$current_year
  else
    y1=$current_year; y2=$(( current_year + 1 ))
  fi
  SEASON="${y1: -2}-${y2: -2}"
  PLAYOFFS_FROM=""
  if [[ -f "$SEASONS_CONF" ]]; then
    PLAYOFFS_FROM=$(grep "^${SEASON}=" "$SEASONS_CONF" | cut -d= -f2 || true)
  fi
  echo "--- running R build (dormant engine) ---"
  echo "Season: $SEASON, Playoffs From: ${PLAYOFFS_FROM:-none}"
  Rscript "$JOB_R" "$SEASON" "${PLAYOFFS_FROM:-}" ""

else
  echo "!!! unknown NBN_STATS_ENGINE '$NBN_STATS_ENGINE' (expected 'python' or 'r')"
  exit 2
fi

# Verify the build's output still satisfies what the pages read. The docroot is
# a symlink to this tree, so anything broken here is already live — surface it
# loudly rather than letting a renamed column ship silently.
echo "--- publishing the served view ---"
bash "$SCRIPT_DIR/link-public.sh"

echo "--- verifying data contract ---"
SMOKE_STATUS=0
python3 "$SCRIPT_DIR/smoke_test.py" --quiet || SMOKE_STATUS=$?

if [[ "$SMOKE_STATUS" -ne 0 ]]; then
  echo "!!! DATA CONTRACT BROKEN — pages are reading columns the build no longer writes"
fi

echo "=== nbn build completed at $(date) ==="
exit "$SMOKE_STATUS"
