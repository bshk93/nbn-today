#!/usr/bin/env bash
# link-public.sh — (re)build the symlink view nginx serves data from.
#
# Two kinds of file are served under the same URL prefixes, and they live in
# different places because they have different lifecycles:
#
#   derived/**            R build output. Regenerable, not backed up.
#   *-roster.csv &c.      League state at the data-dir root. Irreplaceable.
#
# A directory tree can only express one of those axes, so lifecycle owns the
# directories and the web gets this view. It replaces the 149 symlinks that
# used to live in the nbn-today repo, where they were wrong: absolute paths to
# one machine's data, tracked in git.
#
# Idempotent. Run by build.sh after every build, so a newly added output file
# gets published instead of 404ing until someone remembers to re-run this.

set -euo pipefail
DATA_DIR="${NBS_DATA_DIR:-/var/lib/nothing-but-stats}"
PUBLIC="$DATA_DIR/public"

rm -rf "$PUBLIC"
mkdir -p "$PUBLIC"

# 1. Everything the build generates, at the same relative path.
if [ -d "$DATA_DIR/derived" ]; then
    while IFS= read -r rel; do
        mkdir -p "$PUBLIC/$(dirname "$rel")"
        ln -s "../../derived/$rel" "$PUBLIC/$rel"
    done < <(cd "$DATA_DIR/derived" && find . -type f -printf '%P\n')
fi

# 2. League state that pages fetch directly, all served under /data/.
mkdir -p "$PUBLIC/data"
for f in "$DATA_DIR"/*-roster.csv "$DATA_DIR"/*-picks.csv "$DATA_DIR"/*-deadcap.csv \
         "$DATA_DIR/poopoo.json" "$DATA_DIR/trade-votes.json"; do
    [ -e "$f" ] || continue
    ln -sfn "../../$(basename "$f")" "$PUBLIC/data/$(basename "$f")"
done

BROKEN=$(find "$PUBLIC" -xtype l | wc -l)
if [ "$BROKEN" -ne 0 ]; then
    echo "link-public: $BROKEN broken symlink(s)" >&2
    find "$PUBLIC" -xtype l >&2
    exit 1
fi
echo "link-public: $(find "$PUBLIC" -type l | wc -l) files published"
