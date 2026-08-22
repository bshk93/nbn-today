#!/usr/bin/env bash
# Drive build/test_dialogs.html with headless Chrome and fail on any FAIL line.
#
# Deliberately not in the pre-commit hook: it needs a Chrome binary, and a
# fresh checkout has no guarantee of one. Run it by hand after touching the
# dialog primitives in nav.js or css/dialogs.css.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

CHROME="${CHROME:-$(ls -d "$HOME"/.cache/puppeteer/chrome/*/chrome-linux64/chrome 2>/dev/null | tail -1)}"
[ -x "${CHROME:-}" ] || { echo "No Chrome binary found; set CHROME=/path/to/chrome" >&2; exit 2; }

PORT="${PORT:-8099}"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null || true' EXIT
sleep 1

out=$("$CHROME" --headless --disable-gpu --no-sandbox --virtual-time-budget=4000 --dump-dom \
        "http://127.0.0.1:$PORT/build/test_dialogs.html" 2>/dev/null \
      | sed -n '/<pre id="out">/,/<\/pre>/p' | sed 's/<[^>]*>//g')

echo "$out"
[ -n "$out" ] || { echo "no results — the page did not run" >&2; exit 1; }
! grep -q '^FAIL' <<<"$out"
