#!/usr/bin/env bash
# Serve this checkout locally *with the data files*, on http://127.0.0.1:8098.
#
#     bash build/preview.sh [port]
#
# Why this exists: `python3 -m http.server` from the repo root serves the pages
# but 404s every CSV, because the data lives in /var/lib/nothing-but-stats and
# nginx splices it in by extension (`location ~* \.csv$ { root …/public; }`).
# Every table on the site therefore renders "Failed to load data" locally,
# which makes the plain server useless for looking at anything.
#
# This builds a throwaway overlay directory of symlinks — the repo, plus the
# served data view merged into the four directories they share — and serves
# that instead. Nothing is written into the repo, so it cannot leave stray
# symlinks behind (the tracked ones were deliberately removed on 2026-08-18,
# which is what makes `git pull` a safe deploy).
#
# Still not a substitute for dev.nbn.today: there is no /api here, so anything
# authenticated — /pdc, /free-agency, team edit mode — needs the real dev host.
# This is for read-path and visual work.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
REPO="$(pwd -P)"
PORT="${1:-8098}"
DATA="${NBS_DATA_DIR:-/var/lib/nothing-but-stats}/public"

[ -d "$DATA" ] || { echo "no data view at $DATA — run build/link-public.sh first" >&2; exit 1; }

OVERLAY="$(mktemp -d -t nbn-preview-XXXXXX)"
trap 'rm -rf "$OVERLAY"' EXIT

ln -s "$REPO"/* "$OVERLAY/"
# The shared directories need to be real dirs holding both sides, since
# http.server can't route by extension the way the nginx config does.
for d in "$DATA"/*; do
    name="$(basename "$d")"
    rm -f "$OVERLAY/$name"
    mkdir -p "$OVERLAY/$name"
    [ -d "$REPO/$name" ] && ln -sf "$REPO/$name"/* "$OVERLAY/$name/" 2>/dev/null || true
    ln -sf "$d"/* "$OVERLAY/$name/"
done

echo "serving $REPO + $DATA on http://127.0.0.1:$PORT  (ctrl-c to stop)"
cd "$OVERLAY"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
