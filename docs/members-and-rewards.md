# Members, suggestions, and NB¥ rewards

Detail split out of `CLAUDE.md` on 2026-08-24. Member identity is the join key
between the members system and the stats pipeline, so the curl recipes here are
the sanctioned way to change one.

## Member management

Members are the canonical identity for all league participants. Stored in `/var/lib/nothing-but-stats/members.json` as `{ "username": { "token": "<hex>", "roles": [...], "tenures": [{team, start, end, position}] } }`.

The member name (key) is the canonical name that matches `owner` in `owners.csv` and `owner_stats.csv` — this is the join key between the members system and the stats pipeline.

**Tenure positions:** `owner`, `gm`, `coach`, `none`

Member management UI is at `/members/`. Admin creates members (token auto-generated, shown once). BOD can edit tenures. Token rotation and deletion are admin-only.

**Create a member** (use the UI at `/members/` — token is shown once in-browser):
```bash
curl -X POST https://nbn.today/api/members \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "username", "roles": ["rosters"], "tenures": []}'
```

**List all members (public):**
```bash
curl https://nbn.today/api/members/public
```

**List all members with tokens (admin):**
```bash
curl https://nbn.today/api/members -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Update member roles (admin) or tenures (admin/bod):**
```bash
curl -X PATCH https://nbn.today/api/members/username \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"roles": ["rosters", "phx"], "tenures": [{"team": "PHX", "start": "2020-07-01", "end": null, "position": "owner"}]}'
```

**Rotate a token:**
```bash
curl -X POST https://nbn.today/api/members/username/rotate-token \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Delete a member:**
```bash
curl -X DELETE https://nbn.today/api/members/username \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

The old `/api/tokens/*` endpoints remain as compatibility shims backed by members.json.

## Suggestions board

`/suggestions` is the member-facing idea board (`routers/suggestions.py`,
`suggestions.json`). `BACKLOG.md` is the internal list; this is the one members
can write to. Suggestion **numbers come from a monotonic `seq`**, never from
`max(existing)`, so a number is a permanent reference even after deletions.

| Endpoint | Auth |
|---|---|
| `GET /api/suggestions` | public |
| `POST /api/suggestions` | any member token |
| `PATCH /api/suggestions/{id}` | author (title/description, while open) · bod/admin (anything, any status) |
| `DELETE /api/suggestions/{id}` | author while open · bod/admin any time |
| `POST /api/suggestions/{id}/comments` | any member token, **any status** |
| `PATCH`/`DELETE /api/suggestions/{id}/comments/{cid}` | comment's author · bod/admin |

**One thread, two kinds of entry.** `suggestion["comments"]` holds both
`kind="comment"` and `kind="status"` entries in a single append-ordered list, so
the ordering between a decision and the discussion around it is real rather than
reconstructed at render time. A status entry (`{from, to, author}`) is appended
by `PATCH` whenever the status actually changes — a no-op change appends
nothing. **Status entries are the record: they are never editable or deletable**,
by the author or by BOD. Only comments are.

Commenting is deliberately allowed on every status, including `complete` and
`closed` — posting updates as a suggestion is worked, and after it lands, is the
whole point. Editing the suggestion *body* is not: once BOD triages it, the
author can no longer rewrite what was triaged, and the page shows the Edit
button **disabled with that reason** rather than hiding it, pointing at the
comment thread instead.

Suggestions predating comments have no `comments` key; `list_suggestions`
defaults it in the response so no client guards for its absence, without
writing the key back. `tests/test_suggestions.py` pins all of the above.

## Achievement NB¥ awards (background job)

`build/achievement-notify.js` (Node) awards NB¥ whenever a member unlocks or
upgrades an achievement. Achievements are computed statelessly in the browser,
so this job recomputes them server-side using the **same** engine the site uses
(`members/achievements.js`, which is `require()`-able under Node), diffs against
the snapshot `achievement-state.json` in NBS_DATA_DIR, and awards on every tier
upgrade by calling `POST /api/bets/admin/adjust` (which writes the balance +
ledger under the API lock). It uses an admin token read from members.json.

Reward scale (by tier): bronze 250, silver 500, gold 1000, single-tier 500.
Betting/investing achievements are excluded. The snapshot is **monotonic** — an
entry only advances after a successful award, so awards can't double-fire and a
failed award retries next run. The first run (no snapshot) seeds silently, so
existing achievements are **not** awarded retroactively. No Discord/webhook
output — the ledger entry (`Achievement: …`) is the record.

Every included achievement is scored from `computeAchData`'s `shared` argument
alone, so `scoreAll` feeds every member `{}` for `perMember` and still gets a
correct score. **Archivist** was the one exception — it counted approved "Clean
Up the Poo Poo" submissions and needed a real per-member
`cleanupStats.approved_count` read straight off `cleanup-submissions.json`. That
game was retired on 2026-09-19 along with its page, its router and this tier, so
there is no longer a per-member input to build. If a future achievement needs
one, `perMember` is still the argument for it.

### Where it reads from, and the six weeks it didn't

Every path the job reads is declared in one place — `INPUTS` at the top of
`build/achievement-notify.js`. Five are derived CSVs read through
`$NBS_DATA_DIR/public`, the symlink view nginx serves; three are JSON at the
data-dir root. The public view rather than `derived/` is deliberate: this job
runs the same engine the site runs, so it should score off the same bytes the
site displays (same reasoning as `build/smoke_test.py`).

**It was broken from 2026-08-18 to 2026-09-19 and nothing caught it.** The
derived CSVs used to be in the repo as tracked symlinks; when the data moved out
to NBS_DATA_DIR the job kept reading them from the checkout and died with ENOENT
on every 10-minute run for six weeks. It awarded nothing the whole time.

The reason it stayed invisible is worth keeping: this job has *no output that
anyone looks at*. No Discord post, no page that goes blank, no failing request —
just an exception in its own journal. And its success state and its failure
state look identical from outside, because "no achievements were awarded" is
also what a quiet week looks like.

`build/test_achievement_inputs.js` is the guard, and it runs from the pre-commit
hook. It asserts every `INPUTS` path resolves to a non-empty file, that each CSV
still carries the one column the engine joins it on, and that `buildShared()` +
`scoreAll()` actually produce tiers end to end. The join-column check exists
because the looser end-to-end floor does not catch a single renamed input — the
other four carry it over the line on their own.

Run by a systemd timer every 10 min. `DRY_RUN=1` previews without granting,
`NBN_ACH_STATE` overrides the snapshot path, `NBN_API_BASE` the API URL, and
`NBS_DATA_DIR` the data directory (which is what makes the test above able to
point at a scratch copy).

```bash
systemctl list-timers nbn-achievements.timer   # next run
journalctl -u nbn-achievements.service -n 20    # recent runs / awards
DRY_RUN=1 node build/achievement-notify.js       # preview pending awards
node build/test_achievement_inputs.js             # can it still read its inputs?
```

To re-baseline (e.g. after editing the achievement list), delete the snapshot
and let the next run seed it: `rm $NBS_DATA_DIR/achievement-state.json`.
