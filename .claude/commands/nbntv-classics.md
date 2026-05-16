Write a blurb for the NBNTV Classics entry at rank $ARGUMENTS.

## Steps

1. Read `/home/skim/projects/nbn-today/nbntv-classics/playoff-classics.csv`. Find the row where RANK = $ARGUMENTS. Extract: SEASON, DATE, PLAYER, TEAM, OPP, ROUND, GAME, P, R, A, S, B, 3PM, FGM, FGA, GMSC.

2. Derive the season file suffix: take the last two digits of the SEASON string (e.g. "20-21 Playoffs" → "21"). Read `/var/lib/nothing-but-stats/allstats-playoffs-{suffix}.csv`. Filter to rows where DATE matches the game date. This gives you the full box score for both teams — every player who played. Use this to understand the full story of the game (teammates' contributions, how the opponent was held, who else stood out).

3. Read `/var/lib/nothing-but-stats/league-history.csv`. Find the row for the base season (strip " Playoffs" from SEASON). Use the champion, MVP, award winners, and stat leaders for narrative context about the season.

4. Read `/var/lib/nothing-but-stats/owners.csv`. Find who owned the featured TEAM on the game DATE (match team, check start_date ≤ DATE ≤ next owner's start_date). Also find the owner of the opposing team (OPP). Use owner names to humanize the rivalry.

5. Check `/home/skim/projects/nothing-but-stats/app/R/metadata.R` for `get_champion_list()` to determine whether the featured team ultimately won the championship that year, and how far they went.

6. Compute the stable key: `{DATE}_{player-slug}` where the slug is the PLAYER name lowercased with any run of non-alphanumeric characters replaced by a single hyphen (e.g. "Curry, Stephen" → "curry-stephen", so key = "2021-06-20_curry-stephen").

7. Write a single proper paragraph blurb — roughly 80–120 words — and insert it into the BLURBS object in `/home/skim/projects/nbn-today/nbntv-classics/index.html` at the matching key.

## Writing rules

**You may reference:**
- The player's full stat line and shooting efficiency
- What teammates scored / the team's collective output
- How the opposing team performed as a whole (held to X points, their leading scorer had Y)
- The round, game number, and series stakes (elimination game, clinching game, etc.)
- Whether the team won that series and/or the championship
- The season's broader context (was this team a favorite? an underdog? a dynasty?)
- The team's owner and any relevant ownership narrative
- The player's career arc in NBN at that point (seasons played, accolades if you can find them in league-history.csv)

**You must not:**
- Describe specific plays, shot types, sequences, or moments (no buzzer-beaters, no "with 30 seconds left", no "hit a pull-up jumper")
- Invent quotes from players, coaches, or anyone
- Reference crowd reactions, atmosphere, or broadcast moments
- Describe quarter-by-quarter or half-time scoring
- State anything that cannot be directly verified from the data you read

## Tone

Proper paragraph. Dramatic but grounded — like a passage from a well-researched sports history book. Lead with the scale of the performance, then give it context (what was at stake, who was watching, what it meant for the team/season).
