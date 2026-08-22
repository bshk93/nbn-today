#!/usr/bin/env bash
# Report every piece of text on the site that fails WCAG AA in a given theme.
#
#     bash build/contrast_audit.sh [theme] [page ...]
#
#     bash build/contrast_audit.sh                      # light theme, whole site
#     bash build/contrast_audit.sh lavender-rose        # lavender, whole site
#     bash build/contrast_audit.sh nbn-today-light hof standings
#
# Themes are the ids in nav.js's THEMES: nbn-today, nbn-today-light,
# lavender-rose.
#
# How it works, and why it is not just a grep: it builds a throwaway copy of
# each page with the theme forced into localStorage and build/contrast_probe.js
# appended, renders it in headless Chrome, and reads back what the probe
# measured. The failures that matter cannot be found statically — a page
# hardcodes a dark background while its text colour comes from a token three
# files away, and only the rendered result shows the two disagreeing.
#
# The dark theme is the one the site was built in and should come back nearly
# clean; the light themes are where the drift lives.
#
# Needs a Chrome binary (set CHROME= to override) and the data view that
# build/preview.sh serves. Nothing is written into the repo.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
REPO="$(pwd -P)"

THEME="${1:-nbn-today-light}"
shift || true
CHROME="${CHROME:-$(ls -d "$HOME"/.cache/puppeteer/chrome/*/chrome-linux64/chrome 2>/dev/null | tail -1)}"
[ -x "${CHROME:-}" ] || { echo "No Chrome binary found; set CHROME=/path/to/chrome" >&2; exit 2; }
DATA="${NBS_DATA_DIR:-/var/lib/nothing-but-stats}/public"
PORT="${PORT:-8094}"

WORK="$(mktemp -d -t nbn-contrast-XXXXXX)"
trap 'rm -rf "$WORK"; kill $server 2>/dev/null || true' EXIT

# Same overlay build as build/preview.sh — repo plus the data view, merged.
ln -s "$REPO"/* "$WORK/"
if [ -d "$DATA" ]; then
    for d in "$DATA"/*; do
        n="$(basename "$d")"; rm -f "$WORK/$n"; mkdir -p "$WORK/$n"
        [ -d "$REPO/$n" ] && ln -sf "$REPO/$n"/* "$WORK/$n/" 2>/dev/null || true
        ln -sf "$d"/* "$WORK/$n/"
    done
fi

python3 - "$REPO" "$WORK" "$THEME" "$@" <<'PY'
import pathlib, sys
repo, work, theme = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3]
only = set(sys.argv[4:])
probe = (repo / 'build/contrast_probe.js').read_text()
seed = f"<script>try{{localStorage.setItem('nbn_theme_pref','{theme}')}}catch(e){{}}</script>"
n = 0
for src in repo.rglob('index.html'):
    rel = src.relative_to(repo)
    # teams/ are 30 identical shells rendered entirely by team.js; auditing one
    # would be enough, and auditing thirty is thirty Chrome launches.
    if rel.as_posix().startswith(('build/', 'teams/')):
        continue
    name = rel.parent.as_posix() or '.'
    if only and name not in only:
        continue
    t = src.read_text()
    if '<head>' not in t or '</body>' not in t:
        continue
    t = t.replace('<head>', '<head>\n' + seed, 1).replace(
        '</body>', f'<script>window.addEventListener("load",()=>setTimeout(()=>{{{probe}}},1200))</script>\n</body>', 1)
    d = work / '_contrast' / name
    d.mkdir(parents=True, exist_ok=True)
    (d / 'index.html').write_text(t)
    n += 1
print(f'{n} pages to audit in {theme}', file=sys.stderr)
PY

cd "$WORK"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
server=$!
sleep 1

total=0
for d in $(cd "$WORK/_contrast" && find . -name index.html -printf '%h\n' | sed 's|^\./||' | sort); do
    html=$(timeout 25 "$CHROME" --headless --disable-gpu --no-sandbox \
             --virtual-time-budget=3500 --dump-dom \
             "http://127.0.0.1:$PORT/_contrast/$d/" 2>/dev/null)
    json=$(printf '%s' "$html" | sed -n 's/.*<pre id="contrast-report">\(.*\)<\/pre>.*/\1/p' | head -1)
    [ -n "$json" ] || continue
    count=$(printf '%s' "$json" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))' 2>/dev/null || echo 0)
    [ "$count" = "0" ] && continue
    total=$((total + count))
    echo
    echo "== /$d  ($count)"
    printf '%s' "$json" | python3 -c '
import json, sys
for it in json.load(sys.stdin):
    sel, col, bg = it["sel"][:38], it["color"], it["bg"]
    print("   %5s  need %s  %-39s %18s on %-18s %s" % (it["ratio"], it["need"], sel, col, bg, it["text"][:30]))
'
done

echo
echo "total: $total failures in $THEME"
