#!/usr/bin/env python3
"""Give every page its static Open Graph / description tags.

    python3 build/og_tags.py            # write the tags
    python3 build/og_tags.py --check    # fail if any page is missing or stale

These are deliberately **static** rather than injected by nav.js: the consumers
are crawlers — Discord's unfurler above all, since that is where league links
actually get pasted — and none of them run our JavaScript.

Four pages are not fully covered by this map, for that same reason. Each is one
shell serving many items:

    /news/view/?id=    /players/?p=    /proposals/view/?id=    /members/{name}

so the entries below are placeholders and every item unfurled as the same card.
nginx routes those four to nbn-api's routers/og.py when the User-Agent is a
known unfurler ($nbn_unfurler in /etc/nginx/sites-enabled/nbn.today), which
renders the real item's head; the entries below are what everything else sees,
and are also what og.py serves back when there is no item to render (it reads
the block out of the shell rather than restating it). A fifth per-item page
would want the same treatment — see nbn-api/CLAUDE.md § Link previews.

PAGES below is the source of truth for every page's description, so a new page
means a new entry here. --check runs from the pre-commit hook and fails when
one is missing, which is what stops the map from quietly rotting as pages are
added.

Re-runnable: an existing NBN:og block is replaced, never duplicated.

The card images themselves (og-default.png, og/team-*.png) are generated
artefacts committed to the repo; build/og_cards.py rebuilds them.
"""
import re, sys, pathlib

CHECK = '--check' in sys.argv
ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = 'https://nbn.today'

BEGIN = '  <!-- NBN:og -->'
END = '  <!-- /NBN:og -->'

TAGLINE = 'Nothing But Net — fantasy basketball GM simulation league'

# path -> (title override or None, description)
PAGES = {
 '/': (None, 'Owner history, team pages, standings, player profiles, draft history and stats leaderboards for the NBN fantasy basketball GM simulation league.'),
 '/awards/': (None, 'NBN award winners by season — MVP, DPOY, All-NBN teams and the rest of the ballot.'),
 '/awards/24-25/': ('2024-25 Awards — NBN', 'The 2024-25 NBN awards ballot and results.'),
 '/awards/24-25/results/': ('2024-25 Award Results — NBN', 'Full voting results for the 2024-25 NBN awards.'),
 '/awards/24-25/vote/': ('2024-25 Award Voting — NBN', 'Cast your ballot in the 2024-25 NBN awards.'),
 '/awards/25-26/': ('2025-26 Awards — NBN', 'The 2025-26 NBN awards ballot and results.'),
 '/awards/25-26/results/': ('2025-26 Award Results — NBN', 'Full voting results for the 2025-26 NBN awards.'),
 '/awards/25-26/vote/': ('2025-26 Award Voting — NBN', 'Cast your ballot in the 2025-26 NBN awards.'),
 '/backlog/': (None, 'Internal working list of what needs doing on the NBN site.'),
 '/bet/': (None, 'Put NB¥ on NBN games and league outcomes.'),
 '/boxscores/': (None, 'Every NBN box score, searchable by game, team and player.'),
 '/boxscores/submit/': (None, 'Submit a box score to the NBN stats database.'),
 '/calendar/': (None, 'Key dates in the NBN league year — free agency, the draft, deadlines and windows.'),
 '/cap-settings/': (None, 'League-wide cap, apron and minimum-salary settings by season.'),
 '/cap-summary/': (None, 'Where all 30 NBN teams sit against the cap, the aprons and the roster floor.'),
 '/champions/': (None, 'Every NBN champion, finals matchup and title run.'),
 '/changelog/': (None, 'What changed on nbn.today, release by release.'),
 '/cleanup/': (None, 'Fill in missing player data and resolve unlogged transactions — and get paid NB¥ for it.'),
 '/clusters/': ('Archetypes — NBN', 'Statistical archetypes for NBN players and teams.'),
 '/clusters/players/': (None, 'NBN players grouped into statistical archetypes by how they actually play.'),
 '/clusters/teams/': (None, 'NBN teams grouped into statistical archetypes by how they actually play.'),
 '/compare/': (None, 'Put any two NBN players side by side, career or season.'),
 '/constitution/': (None, 'The founding document of the NBN sim league.'),
 '/context/': (None, 'Project context for the nbn.today codebase.'),
 '/draft/': (None, 'Every NBN draft, pick by pick, with who took whom and where they landed.'),
 '/draft/guide/': (None, 'How the NBN draft works — order, rounds, rookie scale and signing rights.'),
 '/draft/live/': (None, 'The NBN draft as it happens, pick by pick.'),
 '/draft/pick/': (None, 'Make your selection in the NBN draft.'),
 '/extensions/': (None, 'Contract extensions across NBN — who is eligible, who has signed and on what terms.'),
 '/free-agency/': (None, 'NBN free agency: the pool, open bidding windows and where your team’s offers stand.'),
 '/frivolities/': (None, 'Odd corners of the NBN data — charts, career earnings, and every trade regraded.'),
 '/h2h/': (None, 'All-time head-to-head records between every NBN team and every owner.'),
 '/hof/': (None, 'NBN Hall of Fame scores, rings and career totals for the league’s best players.'),
 '/how-to-rosters/': (None, 'How to read and edit your NBN roster, contracts and draft picks.'),
 '/inbox/': (None, 'Your NBN notifications.'),
 '/invest/': (None, 'Buy and sell shares in NBN players. Wall Street, but the asset is a power forward.'),
 '/invest/preview/': (None, 'How the NBN Wall Street pricing algorithm values a player.'),
 '/join/': (None, 'How to join the NBN sim league — what a GM does and how to get a team.'),
 '/legal/': (None, 'NBN disciplinary record — filings, findings and penalties.'),
 '/legal/nothing-but-net-sim-league-v-jdbeats/': (None, 'Disciplinary findings in NBN Sim League v. JDBeats.'),
 '/members/': (None, 'Everyone in NBN — tenures, teams, achievements and rings.'),
 '/members/profile/': (None, 'An NBN member’s tenures, achievements and league history.'),
 '/nbntv-classics/': (None, 'The greatest playoff performances in NBN history, ranked and annotated.'),
 '/news/': (None, 'League news, written by NBN members.'),
 '/news/new/': (None, 'Write an article for NBN News.'),
 '/news/rankings/': ('Power Rankings Ballot — NBN', 'Rank all 30 teams and write the blurbs for an NBN power-rankings edition.'),
 '/news/view/': (None, 'An article from NBN News.'),
 '/owners/': (None, 'Career records, ratings and playoff résumés for every NBN general manager.'),
 '/pdc/': (None, 'The Player Decision Committee dashboard — free-agency review, ballots and rulings.'),
 '/perry/': (None, 'The daily NBN Perry game. One guess a day.'),
 '/players/': (None, 'Every player in NBN — career stats, contracts, ratings, awards and game logs.'),
 '/poeltl/': (None, 'The daily NBN Poeltl. Guess the player in eight tries.'),
 '/poopoo/': (None, 'Where the site and the league cap sheet disagree, line by line.'),
 '/poopoo/2028-pick-chain/': (None, 'Untangling the 2028 first-round pick chain.'),
 '/proposals/': (None, 'Rule proposals up for a vote in NBN.'),
 '/proposals/new/': (None, 'Put a rule change to the NBN league.'),
 '/proposals/view/': (None, 'A rule proposal before the NBN league.'),
 '/ratings-changes/': (None, 'Every OVR, position, attribute and badge change the 2K ratings scrape has picked up, player by player.'),
 '/roles/': (None, 'Who can do what in NBN — roles, committees and permissions.'),
 '/rookie-scale/': (None, 'The § 7.1 rookie scale — what every first-round pick is owed.'),
 '/rulebook/': (None, 'The NBN rulebook: salary cap, trades, free agency, extensions and the draft.'),
 '/season-summary/': (None, 'Every NBN season at a glance — champion, award winners and statistical leaders.'),
 '/standings/': (None, 'NBN standings season by season, with every playoff bracket.'),
 '/stats/': (None, 'NBN leaderboards — career totals and single-game highs in every category.'),
 '/stats/highs/': (None, 'The biggest single games in NBN history, by category.'),
 '/stats/highs/p/': (None, 'The highest-scoring single games in NBN history.'),
 '/stats/highs/r/': (None, 'The biggest rebounding games in NBN history.'),
 '/stats/highs/a/': (None, 'The biggest assist games in NBN history.'),
 '/stats/highs/s/': (None, 'The biggest steal games in NBN history.'),
 '/stats/highs/b/': (None, 'The biggest shot-blocking games in NBN history.'),
 '/stats/highs/3pm/': (None, 'The biggest three-point shooting games in NBN history.'),
 '/stats/seasons/': (None, 'Season-by-season statistical leaders across NBN.'),
 '/stats/totals/': (None, 'NBN career leaderboards in every counting category.'),
 '/stats/totals/p/': (None, 'NBN career scoring leaders.'),
 '/stats/totals/r/': (None, 'NBN career rebounding leaders.'),
 '/stats/totals/a/': (None, 'NBN career assist leaders.'),
 '/stats/totals/s/': (None, 'NBN career steals leaders.'),
 '/stats/totals/b/': (None, 'NBN career blocks leaders.'),
 '/stats/totals/3pm/': (None, 'NBN career three-point leaders.'),
 '/skills/': (None, 'The Claude Code commands defined for this project.'),
 '/strikes/': (None, 'The NBN strike record — who has one and what for.'),
 '/suggestions/': (None, 'Suggest a change to NBN, and see what the league thinks of it.'),
 '/teams/': (None, 'All 30 NBN franchises — rosters, salary cap, draft picks and franchise history.'),
 '/trade-retros/': (None, 'Moved — trade retrospectives are now a tab on /frivolities.'),
 '/trade-sim/': (None, 'Moved — the trade simulator now lives at /transaction-sim.'),
 '/tradeblock/': (None, 'Who’s available around NBN — every team’s listed players and picks.'),
 '/tradevotes/': (None, 'How every NBN member has voted on every trade.'),
 '/transaction-sim/': (None, 'Model a trade, signing or extension and see every cap rule it passes or fails — before you submit it.'),
 '/transactions/': (None, 'Every trade, signing, extension and release in NBN, with the cap rules each one cleared.'),
 '/trivia/': (None, 'NBN trivia. How well do you actually know this league?'),
}


def url_for(p: pathlib.Path) -> str:
    rel = p.relative_to(ROOT).as_posix()
    return '/' + rel[:-len('index.html')] if rel.endswith('index.html') else '/' + rel


def block(title, desc, url, image, alt):
    esc = lambda s: (s.replace('&', '&amp;').replace('<', '&lt;')
                      .replace('>', '&gt;').replace('"', '&quot;'))
    return '\n'.join([
        BEGIN,
        f'  <meta name="description" content="{esc(desc)}">',
        f'  <meta property="og:type" content="website">',
        f'  <meta property="og:site_name" content="NBN">',
        f'  <meta property="og:title" content="{esc(title)}">',
        f'  <meta property="og:description" content="{esc(desc)}">',
        f'  <meta property="og:url" content="{SITE}{url}">',
        f'  <meta property="og:image" content="{SITE}{image}">',
        f'  <meta property="og:image:width" content="1200">',
        f'  <meta property="og:image:height" content="630">',
        f'  <meta property="og:image:alt" content="{esc(alt)}">',
        f'  <meta name="twitter:card" content="summary_large_image">',
        f'  <meta name="theme-color" content="#111827">',
        END,
    ])


TEAMS = dict(re.findall(
    r'(\w{3}):\s*"([^"]+)"',
    re.search(r'const TEAMS = \{(.*?)\n\};', (ROOT / 'teams/team.js').read_text(), re.S).group(1)))
assert len(TEAMS) == 30

changed = missing = stale = 0
for p in sorted(ROOT.rglob('*.html')):
    rel = p.relative_to(ROOT).as_posix()
    # build/ holds test fixtures, not pages anyone links to or shares.
    if rel.startswith('build/') or '/node_modules/' in rel:
        continue
    url = url_for(p)
    text = p.read_text()

    m = re.match(r'^/teams/([A-Z]{3})/$', url)
    if m:
        ab = m.group(1)
        name = TEAMS[ab]
        title = f'{name} — NBN'
        desc = f'{name} on NBN: current roster, salary cap situation, draft picks, franchise records and season history.'
        image = f'/og/team-{ab.lower()}.png'
        alt = f'{name} — Nothing But Net'
        # these shells ship a placeholder <title>NBN</title>
        text = re.sub(r'<title>[^<]*</title>', f'<title>{title}</title>', text, count=1)
    elif url in PAGES:
        override, desc = PAGES[url]
        tm = re.search(r'<title>([^<]*)</title>', text)
        title = override or (tm.group(1) if tm and tm.group(1).strip() else 'NBN')
        if override and tm:
            text = re.sub(r'<title>[^<]*</title>', f'<title>{override}</title>', text, count=1)
        elif override and not tm:
            text = text.replace('</head>', f'  <title>{override}</title>\n</head>', 1)
        image = '/og-default.png'
        alt = TAGLINE
    else:
        print(f'  ! no entry in PAGES for {url}', file=sys.stderr)
        missing += 1
        continue

    text = re.sub(re.escape(BEGIN) + r'.*?' + re.escape(END) + r'\n', '', text, flags=re.S)

    blk = block(title, desc, url, image, alt)
    if '<title>' in text:
        text = re.sub(r'(<title>[^<]*</title>\n)', r'\1' + blk + '\n', text, count=1)
    else:
        text = text.replace('</head>', blk + '\n</head>', 1)

    if text != p.read_text():
        stale += 1
        if not CHECK:
            p.write_text(text)
    changed += 1

if CHECK:
    if missing or stale:
        print(f'{missing} page(s) with no PAGES entry, {stale} with stale tags — '
              f'run: python3 build/og_tags.py', file=sys.stderr)
        sys.exit(1)
    print(f'og tags up to date on {changed} pages')
else:
    print(f'{changed} pages tagged ({stale} rewritten), {missing} skipped')
    sys.exit(1 if missing else 0)
