# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**NBN (Nothing But Net)** is a static website for a fantasy basketball simulation GM league. It serves as the public-facing hub linking out to stats, rosters, news, and Discord, and hosts an owner history stats page.

## Running locally

No build step. Serve with any static file server from the project root:

```
python3 -m http.server 8080
```

The owners page fetches `/owner_stats.csv` at runtime, so the server must be rooted at the project root (not inside `owners/`).

## Data source

`owner_stats.csv` is a symlink to `/var/lib/nothing-but-stats/owner_stats.csv`. This file is updated externally by a separate system — do not replace or rewrite it. The CSV headers are:

`owner, teams, seasons, best_reg_season, best_reg_pct, worst_reg_season, worst_reg_pct, reg_w, reg_l, reg_pct, playoff_w, playoff_l, playoff_pct, total_w, total_l, total_pct, playoff_appearances, po_r2, po_conf_finals, po_finals, championships, off_rtg, def_rtg`

## Architecture

Two self-contained HTML files, no framework or dependencies:

- `index.html` — landing page with nav cards linking out to external tools (stats.nbn.today, news.nbn.today, Discord, etc.)
- `owners/index.html` — data table page, all logic is inline `<script>`

### owners/index.html data flow

1. `fetch('/owner_stats.csv')` → `parseCSV(text)` → array of row objects keyed by CSV header
2. `buildTable(rows)` creates the `<table>`, renders `<thead>` from the `COLS` array, attaches sort click handlers, calls `rebuildBody`
3. `rebuildBody(rows, tbody)` sorts rows and re-renders all `<td>` cells on every sort change

### COLS array

Each entry in `COLS` (`owners/index.html:164`) defines a column:
- `key` — CSV field name (used as fallback cell text)
- `sortField` — the CSV field actually sorted on (may differ from `key`)
- `cls` — space-separated CSS classes applied to both `<th>` and `<td>`
- `display(row)` — optional function returning the cell's display string; omit to use `row[key]` directly
- `defaultDir` — sort direction when first clicking this column (`-1` = descending, `1` = ascending)

### Special cell rendering (rebuildBody)

Custom rendering is done inside the `COLS.forEach` block in `rebuildBody` (`owners/index.html:302`). The `championships` column is the existing example: it creates a `.trophy.trophy-gold` `<span>` instead of plain text. Follow this pattern for any column needing non-text content (icons, badges, etc.).

RTG columns (`off_rtg`, `def_rtg`) get heat-map coloring via inline `td.style` after the cell is populated.
