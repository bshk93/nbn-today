#!/usr/bin/env python3
"""
Cluster NBN player-seasons into archetypes.
Pools all seasons, computes within-season percentile ranks for 9 dims,
then clusters with k=10.

Usage:
  python3 players/cluster.py                     # hierarchical (default)
  python3 players/cluster.py --method kmeans
  python3 players/cluster.py --method hierarchical
  python3 players/cluster.py --k 12

Outputs players/player_clusters.json.
"""

import csv, json, math, random, sys
from collections import defaultdict

CSV_PATH  = 'players/player_seasons.csv'
OUT_PATH  = 'players/player_clusters.json'
K         = 16
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
    by_season = defaultdict(lambda: defaultdict(list))
    for ps in player_seasons:
        for dim in DIMS:
            by_season[ps['season']][dim].append(ps['raw'][dim])

    sorted_vals = {s: {d: sorted(v) for d, v in dims.items()}
                   for s, dims in by_season.items()}

    for ps in player_seasons:
        ps['pct'] = {dim: percentile_rank(ps['raw'][dim],
                                          sorted_vals[ps['season']][dim])
                     for dim in DIMS}

def make_vecs(player_seasons):
    import numpy as np
    return np.array([[ps['pct'][d] for d in DIMS] for ps in player_seasons])

# ---------- k-means (k-means++ init) ----------

def kmeans(vecs, k, seed=SEED, max_iter=MAX_ITER):
    import numpy as np
    rng = np.random.default_rng(seed)
    n   = len(vecs)

    # k-means++ init
    idx = [int(rng.integers(n))]
    for _ in range(k - 1):
        d = np.min(np.sum((vecs - vecs[idx[-1]])**2, axis=1, keepdims=False)
                   if len(idx) == 1
                   else np.array([np.min([np.sum((v - vecs[i])**2) for i in idx])
                                  for v in vecs]))
        # vectorised min-dist to existing centers
        dists = np.min(np.sum((vecs[:, None] - vecs[idx])**2, axis=2), axis=1)
        probs = dists / dists.sum()
        idx.append(int(rng.choice(n, p=probs)))

    centers = vecs[idx].copy()
    labels  = np.zeros(n, dtype=int)

    for _ in range(max_iter):
        dists   = np.sum((vecs[:, None] - centers[None])**2, axis=2)  # n×k
        new_lbl = np.argmin(dists, axis=1)
        if np.array_equal(new_lbl, labels):
            break
        labels = new_lbl
        for c in range(k):
            m = vecs[labels == c]
            if len(m):
                centers[c] = m.mean(axis=0)

    return labels.tolist(), centers

# ---------- hierarchical Ward (agglomerative) ----------

def hierarchical_ward(vecs, k):
    """
    Agglomerative clustering with Ward's linkage via the Lance-Williams
    update formula. O(n²) memory, O(n² * iters) time with numpy ops.
    Deterministic — no random init.
    """
    import numpy as np
    n = len(vecs)
    print(f'  Building {n}×{n} distance matrix...', file=sys.stderr)

    # Initial Ward distances: d(i,j) = (ni*nj/(ni+nj)) * ||ci-cj||²
    # All sizes=1 initially → d(i,j) = 0.5 * ||xi-xj||²
    diff = vecs[:, None, :] - vecs[None, :, :]   # n×n×d
    dist = 0.5 * np.sum(diff ** 2, axis=2)        # n×n
    np.fill_diagonal(dist, np.inf)

    sizes  = np.ones(n, dtype=float)
    labels = np.arange(n, dtype=int)   # labels[i] = current cluster id for point i

    print(f'  Merging {n} → {k} clusters...', file=sys.stderr)
    for step in range(n - k):
        if step % 500 == 0 and step > 0:
            print(f'    step {step}/{n-k}', file=sys.stderr)

        # Find closest active pair
        idx  = int(np.argmin(dist))
        i, j = divmod(idx, n)
        if i > j:
            i, j = j, i

        ni, nj = sizes[i], sizes[j]
        n_new  = ni + nj

        # Lance-Williams Ward update for all m simultaneously:
        # d(new, m) = ((ni+nm)/(n_new+nm))*d(i,m)
        #           + ((nj+nm)/(n_new+nm))*d(j,m)
        #           - (nm/(n_new+nm))*d(i,j)
        nm    = sizes                             # shape (n,)
        denom = n_new + nm
        new_d = ((ni + nm) / denom) * dist[i] + \
                ((nj + nm) / denom) * dist[j] - \
                (nm       / denom) * dist[i, j]

        dist[i, :] = new_d
        dist[:, i] = new_d
        dist[i, i] = np.inf

        # Deactivate j
        dist[j, :] = np.inf
        dist[:, j] = np.inf

        sizes[i]  = n_new
        sizes[j]  = 0
        labels[labels == j] = i

    # Renumber 0..k-1
    unique = np.unique(labels)
    final_labels = np.zeros(n, dtype=int)
    centroids    = []
    for new_id, old_id in enumerate(unique):
        mask = labels == old_id
        final_labels[mask] = new_id
        centroids.append(vecs[mask].mean(axis=0))

    return final_labels.tolist(), centroids

# ---------- dendrogram (meta-merge of k final clusters) ----------

def build_dendrogram(centers, cluster_sizes):
    """
    Run k-1 Ward merges on the k final cluster centroids/sizes.
    Returns linkage list: [{'a': id, 'b': id, 'dist': float}]
    Leaf IDs are 0..k-1; internal node IDs are k, k+1, ...
    """
    import numpy as np

    k     = len(centers)
    cents = [np.array(c) for c in centers]
    szs   = list(map(float, cluster_sizes))
    ids   = list(range(k))      # current node ID for each active slot
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

        # Merge jj into ii
        cents[ii] = (ni * cents[ii] + nj * cents[jj]) / (ni + nj)
        szs[ii]   = ni + nj
        ids[ii]   = next_id
        next_id  += 1

        cents.pop(jj); szs.pop(jj); ids.pop(jj)

    return linkage

# ---------- build output ----------

def build_output(player_seasons, vecs, labels, centers, k, method):
    import numpy as np
    import math

    clusters = []
    for c in range(k):
        mask    = [i for i, l in enumerate(labels) if l == c]
        center  = np.array(centers[c])
        members = []
        for i in mask:
            ps   = player_seasons[i]
            v    = vecs[i]
            dist = float(np.sqrt(np.sum((v - center) ** 2)))
            members.append((dist, ps))
        members.sort(key=lambda x: x[0])

        centroid_dict = {DIMS[j]: round(float(centers[c][j]), 4) for j in range(len(DIMS))}
        top = [{
            'slug':   ps['slug'],
            'player': ps['player'],
            'season': ps['season'],
            'team':   ps['team'],
            'dist':   round(d, 4),
            'pct':    {dim: round(ps['pct'][dim], 3) for dim in DIMS},
        } for d, ps in members[:15]]

        clusters.append({
            'id':       c,
            'name':     '',
            'size':     len(mask),
            'centroid': centroid_dict,
            'top':      top,
        })

    clusters.sort(key=lambda c: -c['centroid']['PPG'])
    for i, c in enumerate(clusters):
        c['id'] = i

    # Build dendrogram on the final k clusters
    final_cents  = [c['centroid'] for c in clusters]
    final_cents_arr = [[v for v in cent.values()] for cent in final_cents]
    final_sizes  = [c['size'] for c in clusters]
    linkage = build_dendrogram(final_cents_arr, final_sizes)

    return {
        'dims':     DIMS,
        'method':   method,
        'k':        k,
        'n':        len(player_seasons),
        'clusters': clusters,
        'linkage':  linkage,
    }

# ---------- main ----------

def main():
    import numpy as np

    args   = sys.argv[1:]
    method = 'hierarchical'
    k      = K
    for i, a in enumerate(args):
        if a == '--method' and i + 1 < len(args):
            method = args[i + 1]
        if a == '--k' and i + 1 < len(args):
            k = int(args[i + 1])

    print(f'Method: {method}, k={k}', file=sys.stderr)
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
    vecs = make_vecs(player_seasons)

    if method == 'kmeans':
        print(f'Running k-means k={k}...', file=sys.stderr)
        labels, centers = kmeans(vecs, k)
    else:
        print(f'Running hierarchical Ward k={k}...', file=sys.stderr)
        labels, centers = hierarchical_ward(vecs, k)

    output = build_output(player_seasons, vecs, labels, centers, k, method)

    with open(OUT_PATH, 'w') as f:
        json.dump(output, f, indent=2)

    print(f'Wrote {OUT_PATH}', file=sys.stderr)
    for c in output['clusters']:
        top3 = ', '.join(f"{p['player']} {p['season']}" for p in c['top'][:3])
        print(f"  Cluster {c['id']:2d} (n={c['size']:3d}): {top3}", file=sys.stderr)

if __name__ == '__main__':
    main()
