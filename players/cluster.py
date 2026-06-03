#!/usr/bin/env python3
"""
One-off k-means clustering of NBN player-seasons into archetypes.
Pools all seasons, computes within-season percentile ranks for 9 dims,
then clusters with k=10. Outputs players/player_clusters.json.
"""

import csv, json, math, random, sys
from collections import defaultdict

CSV_PATH  = 'players/player_seasons.csv'
OUT_PATH  = 'players/player_clusters.json'
K         = 10
MIN_GAMES = 20
SEED      = 42
MAX_ITER  = 300

SUM_FIELDS = ['G','MIN','PTS','REB','AST','STL','BLK','TOV','PF',
              'FGM','FGA','3PM','3PA','FTM','FTA']

DIMS = ['PPG','APG','TOV','TS%','3PA','RPG','BLK','STL','FTA']

# ---------- load & aggregate ----------

def load_rows():
    rows = []
    with open(CSV_PATH, newline='', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            rows.append(r)
    return rows

def aggregate(rows):
    """Aggregate multi-team seasons into one row per (SLUG, SEASON)."""
    buckets = defaultdict(lambda: defaultdict(float))
    meta    = {}
    for r in rows:
        key = (r['SLUG'], r['SEASON'])
        for f in SUM_FIELDS:
            v = r[f]
            buckets[key][f] += float(v) if v and v != 'NA' else 0
        if key not in meta:
            meta[key] = {'PLAYER': r['PLAYER'], 'SLUG': r['SLUG'],
                         'SEASON': r['SEASON'], 'TEAM': r['TEAM']}
        else:
            meta[key]['TEAM'] = 'TOT'
    result = []
    for key, sums in buckets.items():
        row = dict(meta[key])
        row.update(sums)
        result.append(row)
    return result

# ---------- feature computation ----------

def ts_pct(r):
    denom = 2 * (r['FGA'] + 0.44 * r['FTA'])
    return r['PTS'] / denom if denom > 0 else 0

def features_raw(r):
    g = max(1, r['G'])
    return {
        'PPG': r['PTS'] / g,
        'APG': r['AST'] / g,
        'TOV': r['TOV'] / g,
        'TS%': ts_pct(r),
        '3PA': r['3PA'] / g,
        'RPG': r['REB'] / g,
        'BLK': r['BLK'] / g,
        'STL': r['STL'] / g,
        'FTA': r['FTA'] / g,
    }

def percentile_rank(val, sorted_vals):
    lo = 0
    for v in sorted_vals:
        if v < val:
            lo += 1
    return lo / len(sorted_vals)

def compute_percentiles(player_seasons):
    """Compute within-season percentile ranks for each dim."""
    # Group raw values by season
    by_season = defaultdict(lambda: defaultdict(list))
    for ps in player_seasons:
        for dim in DIMS:
            by_season[ps['season']][dim].append(ps['raw'][dim])

    # Sort each season's values once
    sorted_vals = {s: {d: sorted(v) for d, v in dims.items()}
                   for s, dims in by_season.items()}

    for ps in player_seasons:
        ps['pct'] = {dim: percentile_rank(ps['raw'][dim],
                                          sorted_vals[ps['season']][dim])
                     for dim in DIMS}

# ---------- k-means ----------

def vec(ps):
    return [ps['pct'][d] for d in DIMS]

def dist2(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b))

def centroid(vecs):
    n = len(vecs)
    return [sum(v[i] for v in vecs) / n for i in range(len(vecs[0]))]

def kmeans(player_seasons, k, seed=SEED, max_iter=MAX_ITER):
    rng = random.Random(seed)
    vecs = [vec(ps) for ps in player_seasons]
    n    = len(vecs)

    # k-means++ init
    centers = [vecs[rng.randrange(n)]]
    for _ in range(k - 1):
        dists = [min(dist2(v, c) for c in centers) for v in vecs]
        total = sum(dists)
        r = rng.random() * total
        cum = 0
        for i, d in enumerate(dists):
            cum += d
            if cum >= r:
                centers.append(vecs[i])
                break

    labels = [0] * n
    for _ in range(max_iter):
        new_labels = [min(range(k), key=lambda c: dist2(vecs[i], centers[c]))
                      for i in range(n)]
        if new_labels == labels:
            break
        labels = new_labels
        for c in range(k):
            cluster_vecs = [vecs[i] for i in range(n) if labels[i] == c]
            if cluster_vecs:
                centers[c] = centroid(cluster_vecs)

    return labels, centers

# ---------- main ----------

def main():
    print('Loading...', file=sys.stderr)
    rows = load_rows()
    agg  = aggregate(rows)

    player_seasons = []
    for r in agg:
        if r['G'] < MIN_GAMES:
            continue
        raw = features_raw(r)
        player_seasons.append({
            'slug':   r['SLUG'],
            'player': r['PLAYER'],
            'season': r['SEASON'],
            'team':   r['TEAM'],
            'raw':    raw,
        })

    print(f'{len(player_seasons)} player-seasons (>={MIN_GAMES}G)', file=sys.stderr)

    compute_percentiles(player_seasons)

    print(f'Running k-means k={K}...', file=sys.stderr)
    labels, centers = kmeans(player_seasons, K)

    # Attach cluster id and distance to centroid
    for i, ps in enumerate(player_seasons):
        v = vec(ps)
        ps['cluster'] = labels[i]
        ps['dist']    = math.sqrt(dist2(v, centers[labels[i]]))

    # Build output: per-cluster centroid (as dict) + top 15 representative players
    clusters = []
    for c in range(K):
        members = [ps for ps in player_seasons if ps['cluster'] == c]
        members.sort(key=lambda ps: ps['dist'])
        centroid_dict = {DIMS[i]: round(centers[c][i], 4) for i in range(len(DIMS))}
        top = [{
            'slug':   ps['slug'],
            'player': ps['player'],
            'season': ps['season'],
            'team':   ps['team'],
            'dist':   round(ps['dist'], 4),
            'pct':    {d: round(ps['pct'][d], 3) for d in DIMS},
        } for ps in members[:15]]
        clusters.append({
            'id':       c,
            'name':     '',
            'size':     len(members),
            'centroid': centroid_dict,
            'top':      top,
        })

    # Sort clusters by PPG centroid descending for consistent ordering
    clusters.sort(key=lambda c: -c['centroid']['PPG'])
    for i, c in enumerate(clusters):
        c['id'] = i

    output = {
        'dims':     DIMS,
        'k':        K,
        'n':        len(player_seasons),
        'clusters': clusters,
    }

    with open(OUT_PATH, 'w') as f:
        json.dump(output, f, indent=2)

    print(f'Wrote {OUT_PATH}', file=sys.stderr)
    for c in clusters:
        top3 = ', '.join(f"{p['player']} {p['season']}" for p in c['top'][:3])
        print(f"  Cluster {c['id']:2d} (n={c['size']:3d}): {top3}", file=sys.stderr)

if __name__ == '__main__':
    main()
