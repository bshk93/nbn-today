#!/usr/bin/env bash
# deploy.sh — pull main into the live checkout.
#
# The docroot (/var/www/nbn.today) is a symlink to this tree, so a pull *is*
# the deploy: the moment it lands, it is what nbn.today serves. There is no
# build step and nothing to copy.
#
# Two guards, both of which have a specific failure in mind:
#
#   * **Dirty tree refuses.** The admin box-score UI spawns a Claude session
#     with cwd= this checkout (nbn-api/routers/misc.py), so live can pick up
#     edits nobody meant to deploy. Merging on top of them is how a live/main
#     divergence gets discovered during an outage.
#   * **--ff-only.** A silent merge commit in live means live is no longer any
#     commit that exists on the remote, and `git reset --hard <sha>` — the
#     rollback — stops meaning what it says.
#
# Rollback is `git reset --hard <previous-sha>`. It rolls back **code only**;
# the data lives in /var/lib/nothing-but-stats and is recovered from its own
# git repo (see docs/dev-deploy-setup-spec.md).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

# Refuse to run from the dev checkout. This script is tracked, so it exists in
# both, and `cd $(dirname $0)` means running it from -dev would pull into dev —
# a deploy that touches neither the tree it pulled nor the tree that serves.
LIVE="/home/skim/projects/nbn-today"
if [ "$(pwd -P)" != "$LIVE" ]; then
    echo "REFUSING: this is the deploy script for $LIVE, and you are in $(pwd -P)." >&2
    echo "Edit here, push, then run $LIVE/deploy.sh." >&2
    exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "REFUSING TO DEPLOY: the live tree has uncommitted changes." >&2
    git status --short >&2
    echo "Resolve them first — commit, stash, or checkout." >&2
    exit 1
fi

BEFORE=$(git rev-parse --short HEAD)
git pull --ff-only
AFTER=$(git rev-parse --short HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
    echo "already up to date at $AFTER"
    exit 0
fi

echo "deployed $BEFORE -> $AFTER"
git --no-pager log --oneline "$BEFORE..$AFTER"
echo
echo "Rollback: git reset --hard $BEFORE"
