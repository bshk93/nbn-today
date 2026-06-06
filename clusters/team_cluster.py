#!/usr/bin/env python3
"""
Two-stage hierarchical clustering of NBN team-seasons.

Dimensions:
  OFF_RTG    – opponent-adjusted offensive differential (from standings)
  DEF        – opponent-adjusted defensive differential (from standings; higher = better)
  ASSIST_RATE– assists per FGM (ball movement vs isolation)
  3PA_RATE   – 3-point attempts per FGA (shot diet)
  FTA_RATE   – free throw attempts per FGA (paint aggression)
  PACE       – possessions per game (FGA + 0.44·FTA − OREB + TO)
  ROT_DEPTH  – avg players with ≥10 min per game (rotation breadth)
  STAR_SHARE – avg share of minutes for top-2 players (star concentration)

Stage 1: shot diet + tempo + ball movement (3PA_RATE, FTA_RATE, PACE, ASSIST_RATE)
Stage 2: execution quality + depth (OFF_RTG, DEF, ROT_DEPTH, STAR_SHARE)

Output: clusters/team_clusters.json
"""

import csv, json, sys, glob, os
from collections import defaultdict

ALLSTATS_GLOB  = '/var/lib/nothing-but-stats/allstats-*.csv'
STANDINGS_PATH = 'standings/standings-history.csv'
OUT_PATH       = 'clusters/team_clusters.json'

MIN_GAMES = 30
N_TOP     = 4
K_SUB     = 3     # 4×3 = 12 clusters
SEED      = 42
MAX_ITER  = 300

DISPLAY_DIMS = ['OFF_RTG', 'DEF', 'ASSIST_RATE', '3PA_RATE', 'FTA_RATE', 'PACE', 'ROT_DEPTH', 'STAR_SHARE']
STAGE1_DIMS  = ['3PA_RATE', 'FTA_RATE', 'PACE', 'ASSIST_RATE']
STAGE2_DIMS  = ['OFF_RTG', 'DEF', 'ROT_DEPTH', 'STAR_SHARE']
ALL_DIMS     = list(dict.fromkeys(DISPLAY_DIMS + STAGE1_DIMS + STAGE2_DIMS))

# ── Load data ─────────────────────────────────────────────────────────────────

def load_allstats():
    """Return dict: (team, season) -> {date -> [player_rows]}"""
    team_games = defaultdict(lambda: defaultdict(list))
    for path in sorted(glob.glob(ALLSTATS_GLOB)):
        basename = os.path.basename(path)
        if 'playoffs' in basename:
            continue
        season = basename.replace('allstats-', '').replace('.csv', '')
        with open(path, newline='', encoding='utf-8') as f:
            for r in csv.DictReader(f):
                if r.get('gametype', '').strip() != 'REG':
                    continue
                team_games[(r['TEAM'], season)][r['DATE']].append(r)
    return team_games

def load_standings():
    """Return dict: (team, season) -> {DEF_RTG, OFF_RTG, W, L, SEED, PLAYOFF_RESULT}"""
    info = {}
    with open(STANDINGS_PATH, newline='', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            key = (r['TEAM'], r['SEASON'])
            info[key] = {
                'w':             int(r['W']),
                'l':             int(r['L']),
                'seed':          r['SEED'],
                'playoff_result': r['PLAYOFF_RESULT'],
                'def_rtg':       float(r['DEF_RTG']) if r['DEF_RTG'] else None,
                'off_rtg':       float(r['OFF_RTG']) if r['OFF_RTG'] else None,
            }
    return info

# ── Feature computation ───────────────────────────────────────────────────────

def f(row, col):
    v = row.get(col, '') or '0'
    try: return float(v)
    except: return 0.0

def compute_team_features(team_games, standings):
    team_seasons = []

    for (team, season), games in team_games.items():
        if len(games) < MIN_GAMES:
            continue

        total_fga = total_fgm = total_3pa = total_fta = total_poss = total_ast = 0
        rot_sizes = []
        star_shares = []

        for date, players in games.items():
            # Game totals (sum across players)
            game_fga  = sum(f(r, 'FGA') for r in players)
            game_fgm  = sum(f(r, 'FGM') for r in players)
            game_3pa  = sum(f(r, '3PA') for r in players)
            game_fta  = sum(f(r, 'FTA') for r in players)
            game_oreb = sum(f(r, 'OR')  for r in players)
            game_to   = sum(f(r, 'TO')  for r in players)
            game_ast  = sum(f(r, 'A')   for r in players)

            total_fga  += game_fga
            total_fgm  += game_fgm
            total_3pa  += game_3pa
            total_fta  += game_fta
            total_ast  += game_ast
            # Possessions: FGA + 0.44·FTA − OREB + TO
            total_poss += game_fga + 0.44 * game_fta - game_oreb + game_to

            # Per-player minutes this game (combine split rows for same player+date)
            min_by_player = defaultdict(float)
            for r in players:
                min_by_player[r.get('PLAYER', r.get('M',''))] += f(r, 'M')

            all_mins = sorted(min_by_player.values(), reverse=True)
            rot_sizes.append(sum(1 for m in all_mins if m >= 10))

            team_min = sum(all_mins)
            if team_min > 0:
                top2_min = sum(all_mins[:2])
                star_shares.append(top2_min / team_min)

        n_games = len(games)

        # OFF_RTG and DEF_RTG from standings (opponent-adjusted differentials)
        standing = standings.get((team, season), {})
        def_rtg  = standing.get('def_rtg')
        off_rtg  = standing.get('off_rtg')
        if def_rtg is None or off_rtg is None:
            continue  # skip if no standings data

        raw = {
            'OFF_RTG':    off_rtg,
            'DEF':        def_rtg,
            'ASSIST_RATE': total_ast / max(total_fgm, 1),
            '3PA_RATE':   total_3pa / max(total_fga, 1),
            'FTA_RATE':   total_fta / max(total_fga, 1),
            'PACE':       total_poss / n_games,
            'ROT_DEPTH':  sum(rot_sizes) / len(rot_sizes) if rot_sizes else 0,
            'STAR_SHARE': sum(star_shares) / len(star_shares) if star_shares else 0,
        }

        team_seasons.append({
            'team':           team,
            'season':         season,
            'w':              standing.get('w', 0),
            'l':              standing.get('l', 0),
            'seed':           standing.get('seed', ''),
            'playoff_result': standing.get('playoff_result', ''),
            'raw':            raw,
        })

    return team_seasons

# ── Percentiles ───────────────────────────────────────────────────────────────

def percentile_rank(val, sorted_vals):
    return sum(1 for v in sorted_vals if v < val) / len(sorted_vals)

def compute_percentiles(team_seasons):
    by_season = defaultdict(lambda: defaultdict(list))
    for ts in team_seasons:
        for dim in ALL_DIMS:
            by_season[ts['season']][dim].append(ts['raw'][dim])

    sorted_vals = {s: {d: sorted(v) for d, v in dims.items()}
                   for s, dims in by_season.items()}

    for ts in team_seasons:
        ts['pct'] = {dim: percentile_rank(ts['raw'][dim],
                                          sorted_vals[ts['season']][dim])
                     for dim in ALL_DIMS}

# ── Clustering (Ward hierarchical) ───────────────────────────────────────────

def make_vecs(team_seasons, dims):
    import numpy as np
    return np.array([[ts['pct'][d] for d in dims] for ts in team_seasons])

def hierarchical_ward(vecs, k):
    import numpy as np
    n = len(vecs)
    if n <= k:
        return list(range(n)), vecs.copy()

    diff   = vecs[:, None, :] - vecs[None, :, :]
    dist   = 0.5 * np.sum(diff ** 2, axis=2)
    np.fill_diagonal(dist, np.inf)
    sizes  = np.ones(n, dtype=float)
    labels = np.arange(n, dtype=int)

    for _ in range(n - k):
        idx  = int(np.argmin(dist))
        i, j = divmod(idx, n)
        if i > j: i, j = j, i

        ni, nj = sizes[i], sizes[j]
        n_new  = ni + nj
        nm     = sizes
        denom  = n_new + nm
        new_d  = ((ni + nm) / denom) * dist[i] + \
                 ((nj + nm) / denom) * dist[j] - \
                 (nm        / denom) * dist[i, j]

        dist[i, :] = new_d; dist[:, i] = new_d; dist[i, i] = np.inf
        dist[j, :] = np.inf; dist[:, j] = np.inf
        sizes[i] = n_new; sizes[j] = 0
        labels[labels == j] = i

    unique = np.unique(labels)
    final  = np.zeros(n, dtype=int)
    cents  = []
    for new_id, old_id in enumerate(unique):
        mask = labels == old_id
        final[mask] = new_id
        cents.append(vecs[mask].mean(axis=0))

    return final.tolist(), cents

def two_stage(team_seasons, n_top=N_TOP, k_sub=K_SUB):
    import numpy as np
    letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

    s1_vecs = make_vecs(team_seasons, STAGE1_DIMS)
    s2_vecs = make_vecs(team_seasons, STAGE2_DIMS)

    print(f'  Stage 1: shot diet + pace, k={n_top}...', file=sys.stderr)
    s1_labels, _ = hierarchical_ward(s1_vecs, n_top)

    # Sort top groups by mean 3PA_RATE (inside-first teams → group 1)
    group_score = {}
    for g in range(n_top):
        idxs = [i for i, l in enumerate(s1_labels) if l == g]
        group_score[g] = float(np.mean([team_seasons[i]['pct']['3PA_RATE'] for i in idxs]))
    sorted_top = sorted(range(n_top), key=lambda g: group_score[g])

    final_labels   = [-1] * len(team_seasons)
    group_structure = {}
    cluster_id     = 0

    for top_new, top_old in enumerate(sorted_top):
        idxs    = [i for i, l in enumerate(s1_labels) if l == top_old]
        k_actual = min(k_sub, max(1, len(idxs) // 5))

        print(f'  Stage 2: group {top_new+1} (n={len(idxs)}), k={k_actual}...', file=sys.stderr)

        group_s2 = s2_vecs[idxs]
        sub_labels, _ = hierarchical_ward(group_s2, k_actual)

        # Sort sub-groups: high OFF_RTG first
        sub_ts = {}
        for sg in range(k_actual):
            sub_idxs = [idxs[i] for i, l in enumerate(sub_labels) if l == sg]
            sub_ts[sg] = float(np.mean([team_seasons[i]['pct']['OFF_RTG'] for i in sub_idxs]))
        sorted_subs = sorted(range(k_actual), key=lambda sg: -sub_ts[sg])
        sub_remap   = {old: new for new, old in enumerate(sorted_subs)}

        for i, orig_idx in enumerate(idxs):
            sub_new = sub_remap[sub_labels[i]]
            final_labels[orig_idx] = cluster_id + sub_new

        for sg_new in range(k_actual):
            group_structure[cluster_id + sg_new] = (top_new, sg_new)
        cluster_id += k_actual

    return final_labels, group_structure

# ── Dendrogram ────────────────────────────────────────────────────────────────

def build_dendrogram(centers, cluster_sizes):
    import numpy as np
    k     = len(centers)
    cents = [np.array(c) for c in centers]
    szs   = list(map(float, cluster_sizes))
    ids   = list(range(k))
    next_id = k
    linkage = []

    while len(ids) > 1:
        best_d, best_ii, best_jj = float('inf'), 0, 1
        for ii in range(len(ids)):
            for jj in range(ii + 1, len(ids)):
                ni, nj = szs[ii], szs[jj]
                sq_d   = float(np.sum((cents[ii] - cents[jj]) ** 2))
                ward_d = (ni * nj) / (ni + nj) * sq_d
                if ward_d < best_d:
                    best_d, best_ii, best_jj = ward_d, ii, jj

        ii, jj = best_ii, best_jj
        na, nb = ids[ii], ids[jj]
        ni, nj = szs[ii], szs[jj]
        linkage.append({'a': na, 'b': nb, 'dist': round(best_d, 6)})
        cents[ii] = (ni * cents[ii] + nj * cents[jj]) / (ni + nj)
        szs[ii] = ni + nj
        ids[ii] = next_id
        next_id += 1
        cents.pop(jj); szs.pop(jj); ids.pop(jj)

    return linkage

# ── PCA 2D projection ─────────────────────────────────────────────────────────

def pca_2d(vecs):
    """Return (n,2) array of 2D PCA projections normalized to [0.05, 0.95]."""
    import numpy as np
    X = vecs - vecs.mean(axis=0)
    cov = X.T @ X / (len(X) - 1)
    vals, vecs2 = np.linalg.eigh(cov)
    # eigh returns ascending order; take top 2
    pc = vecs2[:, -2:][:, ::-1]
    proj = X @ pc
    lo, hi = proj.min(axis=0), proj.max(axis=0)
    span = hi - lo
    span[span == 0] = 1
    return 0.05 + 0.90 * (proj - lo) / span

# ── Build output ──────────────────────────────────────────────────────────────

def build_output(team_seasons, vecs_display, labels, k_total, group_structure):
    import numpy as np
    letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

    # PCA positions for individual team-seasons
    coords_2d = pca_2d(vecs_display)

    clusters = []
    for c in range(k_total):
        mask   = [i for i, l in enumerate(labels) if l == c]
        center = vecs_display[mask].mean(axis=0)
        dists  = np.sqrt(np.sum((vecs_display[mask] - center) ** 2, axis=1))
        order  = np.argsort(dists)

        centroid_dict = {DISPLAY_DIMS[j]: round(float(center[j]), 4)
                         for j in range(len(DISPLAY_DIMS))}

        top = []
        for i in order:
            ts  = team_seasons[mask[i]]
            idx = mask[i]
            top.append({
                'team':           ts['team'],
                'season':         ts['season'],
                'record':         f"{ts['w']}-{ts['l']}",
                'seed':           ts['seed'],
                'playoff_result': ts['playoff_result'],
                'dist':           round(float(dists[i]), 4),
                'pct':            {d: round(ts['pct'][d], 3) for d in DISPLAY_DIMS},
                'x':              round(float(coords_2d[idx, 0]), 4),
                'y':              round(float(coords_2d[idx, 1]), 4),
            })

        hier = ''
        if group_structure and c in group_structure:
            top_idx, sub_idx = group_structure[c]
            hier = f'{top_idx + 1}{letters[sub_idx]}'

        # Cluster centroid PCA position (mean of member coords)
        cx = float(np.mean([coords_2d[i, 0] for i in mask]))
        cy = float(np.mean([coords_2d[i, 1] for i in mask]))

        clusters.append({
            'id':        c,
            'hier_name': hier,
            'name':      '',
            'size':      len(mask),
            'centroid':  centroid_dict,
            'top':       top,
            'x':         round(cx, 4),
            'y':         round(cy, 4),
        })

    clusters.sort(key=lambda c: c['hier_name'])
    for i, c in enumerate(clusters):
        c['id'] = i

    final_cents_arr = [list(c['centroid'].values()) for c in clusters]
    final_sizes     = [c['size'] for c in clusters]
    linkage = build_dendrogram(final_cents_arr, final_sizes)

    return {
        'dims':     DISPLAY_DIMS,
        'method':   'twostage',
        'k':        k_total,
        'n':        len(team_seasons),
        'clusters': clusters,
        'linkage':  linkage,
    }

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    import numpy as np

    print('Loading allstats...', file=sys.stderr)
    team_games = load_allstats()
    print(f'  {len(team_games)} (team, season) pairs found', file=sys.stderr)

    print('Loading standings...', file=sys.stderr)
    standings = load_standings()

    print('Computing features...', file=sys.stderr)
    team_seasons = compute_team_features(team_games, standings)
    print(f'  {len(team_seasons)} team-seasons (>={MIN_GAMES}G)', file=sys.stderr)

    compute_percentiles(team_seasons)

    vecs_display = make_vecs(team_seasons, DISPLAY_DIMS)

    k_total = N_TOP * K_SUB
    print(f'Two-stage: {N_TOP} top groups × {K_SUB} sub = {k_total} max clusters', file=sys.stderr)
    labels, group_structure = two_stage(team_seasons, N_TOP, K_SUB)
    k_total = max(labels) + 1

    output = build_output(team_seasons, vecs_display, labels, k_total, group_structure)

    with open(OUT_PATH, 'w') as f:
        json.dump(output, f, indent=2)

    print(f'\nWrote {OUT_PATH} ({output["k"]} clusters, {output["n"]} team-seasons)',
          file=sys.stderr)
    for c in output['clusters']:
        sample = ', '.join(f"{e['team']} {e['season']}" for e in c['top'][:3])
        print(f"  {c['hier_name']:4s} n={c['size']:3d}: {sample}", file=sys.stderr)

if __name__ == '__main__':
    main()
