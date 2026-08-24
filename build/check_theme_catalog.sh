#!/usr/bin/env bash
# Check that every theme the API sells has a CSS block that renders it.
#
#     bash build/check_theme_catalog.sh                 # against live
#     API=https://dev.nbn.today bash build/check_theme_catalog.sh
#
# The two halves of the theme system live in different repos: prices and the
# list of what exists are in nbn-api (routers/themes.py), the colours are here
# (css/theme.css). Selling an id with no block takes 5,000 NB¥ for a theme
# that changes nothing on the page and has no refund path, which is the one
# failure mode worth a script.
#
# It also reports blocks with no catalog entry — harmless (dead CSS), but
# usually means a team was generated and never listed in LIVE_TEAM_THEMES.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

API="${API:-https://nbn.today}"
CSS="css/theme.css"

catalog="$(curl -fsS "$API/api/themes" | python3 -c 'import json,sys; print("\n".join(t["id"] for t in json.load(sys.stdin)["themes"]))')"
# The bare :root block is "nbn-today"; the rest are [data-theme="..."].
# The `[a-z0-9-]` filter drops the file's own header comment, which spells the
# selector out as :root[data-theme="..."] while explaining it.
blocks="$(printf 'nbn-today\n'; grep -o ':root\[data-theme="[a-z0-9-]*"\]' "$CSS" | sed 's/.*="//;s/"\]//' | sort -u)"

fail=0
while read -r id; do
    [ -n "$id" ] || continue
    if ! printf '%s\n' "$blocks" | grep -qx "$id"; then
        echo "SOLD BUT NOT STYLED: $API sells '$id' and $CSS has no block for it" >&2
        fail=1
    fi
done <<< "$catalog"

while read -r id; do
    [ -n "$id" ] || continue
    printf '%s\n' "$catalog" | grep -qx "$id" || echo "unlisted: $CSS styles '$id', which the catalog does not offer"
done <<< "$blocks"

[ "$fail" = 0 ] && echo "ok — every theme on sale has a block in $CSS"
exit "$fail"
