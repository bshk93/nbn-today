# Unlockable themes

Detail split out of `CLAUDE.md` on 2026-08-24. Entitlement is server-side,
selection is not; the team blocks in `css/theme.css` are **generated** and
regenerating overwrites hand-edits.

## Unlockable themes

Two themes are free for everyone (`nbn-today` dark, `nbn-today-light`); **every
other one is bought once with NB¥ at a flat 5,000** — Lavender Rose, and one
theme per team. **A member's own team's theme is free for them**, and priced
like any other for everyone else.

The price was 1,000 flat, own team included, until 2026-08-24. Making the
own-team theme free took the obvious purchase off the table, so the rest were
re-priced upward to match an avatar (5,000) rather than a cosmetics update
(500): against a median balance of ~2,250 a theme is now something to save for
instead of something to collect, and the one a member would actually wear costs
nothing.

**Free-for-you is derived, not granted.** `own_team_theme` in
`nbn-api/routers/themes.py` reads the member's open tenure every time it is
asked — any position, owner/GM/coach alike — so the entitlement lapses when the
tenure does and nothing is ever written into `cosmetics.themes`. Buying your own
team's theme is a 400, not a 5,000 NB¥ donation; a member who *bought* that
theme before joining the team keeps it afterwards, because the purchase is its
own row. It reaches the picker as `free_themes` on `/api/members/me` rather than
through the catalog, because `GET /api/themes` is public and cached per browser
— a per-member price in it would be wrong for whoever signs in next.

**Entitlement is server-side; selection is not.** `nbn-api/routers/themes.py` is
the only thing that decides who paid for what, storing it in
`members[name]["cosmetics"]["themes"]` beside the name colour, and returning it
on the `/api/members/me` the nav already fetches. Which theme a browser is
*showing* stays in `localStorage`, because `nav.js` applies the theme at the top
of the file, before any fetch — waiting on the network to paint would put a
flash of the wrong colours on every page load for every visitor, in exchange for
guarding a palette whose CSS is public either way. So the page is trusted to
render honestly and only the charge is guarded. `_canUseTheme` falls back to the
default for a locked id, which is about a fresh browser rather than about theft.

| Piece | Where |
|---|---|
| Catalog, price, purchase | `THEME_PRICE` / `LIVE_TEAM_THEMES` — `nbn-api/routers/themes.py`; `GET /api/themes` (public), `POST /api/members/me/themes/{id}` |
| Your own team's theme, free | `own_team_theme` / `free_theme_ids` — `nbn-api/routers/themes.py`, returned as `free_themes` by `GET /api/members/me` |
| Picker, lock state, buy flow | `_themeMenuItems` / `_unlockTheme` / `_hasTheme` — `nav.js` |
| Colours | `css/theme.css`, one `:root[data-theme="…"]` block of 59 tokens each |
| Team blocks | **generated** by `build/make_team_theme.py` from `build/team-colors.json` |

Five things to know before touching it:

- **`nav.js` hardcodes only the two universally free themes.** It is on every page including
  signed-out ones, and a picker that can't render without a successful fetch
  disappears whenever the API hiccups. Everything else comes from
  `GET /api/themes`, cached in `localStorage` so it paints on first load. **No
  price is ever written in the page**, and the 402 refusal string is the
  server's — the same rule `/free-agency` follows. The member's own team's
  theme is cached separately (`nbn_themes_free`) from the bought ones
  (`nbn_themes_owned`), for the same reason the server keeps them apart: one is
  a purchase and one is a tenure.
- **Locked themes stay in the menu with their price**, not hidden — the same
  "disabled with the reason" pattern as the roster ⋯ menu and the suggestions
  Edit button. The price *is* the reason. Clicking one **applies it for real**
  and asks whether to keep it; the preview touches only the `data-theme`
  attribute and never `localStorage`, so cancelling (or Escape, or the scrim)
  reverts with nothing stored and nothing charged. Buying blind off a name was
  the thing to avoid — "Suns" says nothing about reading tables in it.
- **A team theme's row shows that team's logo**, from `/logos/logo-{abbr}.png`,
  keyed off the catalog entry's `team` field — the catalog's icon is the same 🏀
  for all 30 and identifies none of them. Built by `_themeIcon` in `nav.js`,
  which also feeds the nav button when a team theme is active, and keeps the
  emoji as the fallback node for a logo that fails to load. The rows carry the
  URL in `data-src` and load nothing until the menu is first opened
  (`_hydrateThemeLogos`): the 30 logos are ~1.6MB and the menu is built on every
  page, so an eager `src` would put that on every page load.
- **Team blocks are generated, and regenerating overwrites hand-edits.** The
  recipe: keep the dark theme's *lightness* for every token and change only the
  hue — primary hue for backgrounds/borders/text at a low chroma, accent hue for
  the accent family, semantic colours (danger/success/gold) left alone so red
  still means alarm. `--text-on-accent` is *computed* black-or-white, which is
  what stops the gold and silver teams shipping unreadable buttons. Contrast
  repair is capped at what the same token already achieved in the dark theme, so
  a team theme inherits that theme's contrast character exactly — never worse,
  and never silently better.
- **Two things the recipe gets wrong if you rebuild it from scratch**, both
  found by shipping them:
  - *Chroma is not inherited.* The first version reused the dark theme's own
    background chroma (0.028) on the theory that it was already as strong as a
    page could take. But that near-black is **blue**-tinted, so a hue swap at
    the same strength moved PHX's page by **ΔE 0.9 — below the threshold of
    vision**, and Suns rendered *identical* to the default. It hit every team
    sitting near blue (UTA 0.6, DAL, DEN, MIN) and spared the ones far from it
    (BOS 5.1), which is exactly how one hand-checked team hides it. `C_BG` is
    0.075 now; every team lands between ΔE 2.6 and 9.4.
  - *A grey has no hue.* `#1A1A1A` computes to hue 89.9 (olive) and `#A1A1A4`
    to 286 (violet) — rounding noise, amplified to full saturation. BKN, SAS
    and POR all came out the same olive-brown, and BKN's silver accent came out
    cyan. `NEUTRAL_CHROMA` now sends a near-grey source to a near-grey output,
    which for the black-and-silver teams *is* the identity.
- **A team is only listed once its block exists.** `LIVE_TEAM_THEMES` in the API
  is the gate; adding a team there without generating the CSS sells 5,000 NB¥ of
  nothing — and hands that team's own members a free theme that does nothing. `bash build/check_theme_catalog.sh` checks the two repos agree.

Two checks, and they answer different questions:

```bash
python3 build/make_team_theme.py --all --check   # seconds, all 30
bash build/contrast_audit.sh team-bos            # ~15 min, one theme
```

`--check` compares each theme's tokens against the dark theme's and reports
only a pair that **crosses** a WCAG bar the dark theme cleared — drift within a
bar is meaningless and reporting it buries the real thing (team-phx reads
0.2-0.4 lower on five pairs and still audited at exact parity). It cannot see
interactions with colours a page hardcodes, which is what the rendered audit is
for. **Run `--check` on every generation; run the audit on a sample.** All 30
were shipped on PHX audited in full plus SAS/IND/BKN/POR/MIL sampled — the
colours most likely to break a recipe: pale accents, near-black primaries,
cream.

> `build/team-colors.json` is the generator's colour source. Three older
> hardcoded copies of team colours still exist (`champions/index.html`,
> `frivolities/index.html`, `nbn-api/routers/discord.py`) and are **not** fed
> from it — unifying them is a separate job.
