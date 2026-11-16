# nbn-today

The site at [nbn.today](https://nbn.today): team pages, player profiles,
standings, stats, the league's committees and front-office tools for the NBN
fantasy basketball GM league. Static HTML, CSS and JavaScript with no build
step and no framework. The data and the API come from the sibling repo,
`nbn-api`.

## Start here

- **`CLAUDE.md`**: the operating picture: the production box's rules, dev and
  live checkouts, where data lives, roles, the data model, and a task lookup
  (which file to open for which change).
- **`docs/runbook.md`**: one page on what runs where and what to do when
  something breaks.
- **`docs/design-system.md`**: the shared components, tokens and icons every
  page uses.
- **`BACKLOG.md`**: everything still open.

## Look at a change

```bash
python3 build/preview_live.py
```

Serves this checkout on http://127.0.0.1:8099 with the data and `/api` read
from nbn.today. It refuses writes unless you pass `--allow-writes`, because
that API is live.

## Checks

```bash
git config core.hooksPath build/hooks
```

The pre-commit hook runs the generators' `--check`s, the node unit tests in
`tests/`, the design-drift and duplicate-helper ratchets, and, on the server,
the data-contract smoke test; it also bumps the version from the changelog.
CI (`.github/workflows/ci.yml`) runs the same checks and renders every page
in `tests/frontend/run.js` on every push.
