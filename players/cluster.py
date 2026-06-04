#!/usr/bin/env python3
"""
Two-stage hierarchical clustering of NBN player-seasons.

Stage 1 — shot diet (2PA/G, 3PA/G, FTA/G percentiles) → top-level groups (number prefix)
Stage 2 — within each group, cluster on TS%, APG, TOV, BLK, STL, RPG → sub-groups (letter)

Usage:
  python3 players/cluster.py                        # two-stage (default)
  python3 players/cluster.py --method hierarchical  # single-stage Ward
  python3 players/cluster.py --method kmeans        # single-stage k-means
  python3 players/cluster.py --k 16
  python3 players/cluster.py --n-top 4 --k-sub 4   # two-stage params

Outputs players/player_clusters.json.
"""

import csv, json, math, random, sys
from collections import defaultdict

CSV_PATH  = 'players/player_seasons.csv'
OUT_PATH  = 'players/player_clusters.json'
K         = 16      # total clusters (single-stage)
N_TOP     = 4       # top-level groups  (two-stage)
K_SUB     = 4       # sub-groups per top group (two-stage → total = N_TOP * K_SUB)
MIN_GAMES = 20
SEED      = 42
MAX_ITER  = 300

SUM_FIELDS = ['G','MIN','PTS','REB','AST','STL','BLK','TOV','PF',
              'FGM','FGA','3PM','3PA','FTM','FTA']

# Dims shown on the radar chart
DISPLAY_DIMS = ['PPG','APG','TOV','TS%','3PA','RPG','BLK','STL','FTA']

# Two-stage feature sets
STAGE1_DIMS = ['3pt_rate','ft_rate','usage']         # shot diet (ratios) → top-level split
STAGE2_DIMS = ['TS%','APG','TOV','BLK','STL','RPG']  # efficiency/playmaking/defense → sub-split

# All dims we need percentiles for
ALL_DIMS = list(dict.fromkeys(DISPLAY_DIMS + STAGE1_DIMS))

# ---------- load & aggregate ----------

def load_rows():
    rows = []
    with open(CSV_PATH, newline='', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            rows.append(r)
    return rows

def aggregate(rows):
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
    g    = max(1, r['G'])
    fga  = max(r['FGA'], 1)
    return {
        'PPG':     r['PTS']  / g,
        'APG':     r['AST']  / g,
        'TOV':     r['TOV']  / g,
        'TS%':     ts_pct(r),
        '3PA':     r['3PA']  / g,
        'RPG':     r['REB']  / g,
        'BLK':     r['BLK']  / g,
        'STL':     r['STL']  / g,
        'FTA':     r['FTA']  / g,
        '3pt_rate': r['3PA'] / fga,          # fraction of FGA that are 3s
        'ft_rate':  r['FTA'] / fga,           # free throw attempts per FGA
        'usage':    r['FGA'] / g,             # total shot volume per game
    }

def percentile_rank(val, sorted_vals):
    return sum(1 for v in sorted_vals if v < val) / len(sorted_vals)

def compute_percentiles(player_seasons):
    by_season = defaultdict(lambda: defaultdict(list))
    for ps in player_seasons:
        for dim in ALL_DIMS:
            by_season[ps['season']][dim].append(ps['raw'][dim])

    sorted_vals = {s: {d: sorted(v) for d, v in dims.items()}
                   for s, dims in by_season.items()}

    for ps in player_seasons:
        ps['pct'] = {dim: percentile_rank(ps['raw'][dim],
                                          sorted_vals[ps['season']][dim])
                     for dim in ALL_DIMS}

def make_vecs(player_seasons, dims):
    import numpy as np
    return np.array([[ps['pct'][d] for d in dims] for ps in player_seasons])

# ---------- k-means ----------

def kmeans(vecs, k, seed=SEED, max_iter=MAX_ITER):
    import numpy as np
    rng = np.random.default_rng(seed)
    n   = len(vecs)

    dists_to_centers = lambda centers: np.min(
        np.sum((vecs[:, None] - centers[None]) ** 2, axis=2), axis=1)

    idx = [int(rng.integers(n))]
    for _ in range(k - 1):
        d     = dists_to_centers(vecs[idx])
        probs = d / d.sum()
        idx.append(int(rng.choice(n, p=probs)))

    centers = vecs[idx].copy()
    labels  = np.zeros(n, dtype=int)
    for _ in range(max_iter):
        new_lbl = np.argmin(np.sum((vecs[:, None] - centers[None]) ** 2, axis=2), axis=1)
        if np.array_equal(new_lbl, labels):
            break
        labels = new_lbl
        for c in range(k):
            m = vecs[labels == c]
            if len(m):
                centers[c] = m.mean(axis=0)

    return labels.tolist(), centers

# ---------- hierarchical Ward ----------

def hierarchical_ward(vecs, k):
    import numpy as np
    n = len(vecs)
    if n <= k:
        return list(range(n)), vecs.copy()

    diff = vecs[:, None, :] - vecs[None, :, :]
    dist = 0.5 * np.sum(diff ** 2, axis=2)
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

# ---------- two-stage clustering ----------

def two_stage(player_seasons, n_top=N_TOP, k_sub=K_SUB):
    """
    Stage 1: Ward on shot diet (2PA, 3PA, FTA) → n_top groups.
    Stage 2: Ward within each group on TS%, APG, TOV, BLK, STL, RPG → k_sub sub-groups.
    Returns (labels, group_structure).
    group_structure[cluster_id] = (top_group_idx, sub_group_idx)
    """
    import numpy as np
    letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

    s1_vecs = make_vecs(player_seasons, STAGE1_DIMS)
    s2_vecs = make_vecs(player_seasons, STAGE2_DIMS)

    print(f'  Stage 1: shot diet (2PA/3PA/FTA), k={n_top}...', file=sys.stderr)
    s1_labels, _ = hierarchical_ward(s1_vecs, n_top)

    # Sort top groups by mean 3pt_rate: inside-dominant (low 3pt rate) first
    group_score = {}
    for g in range(n_top):
        idxs = [i for i, l in enumerate(s1_labels) if l == g]
        group_score[g] = float(np.mean([player_seasons[i]['pct']['3pt_rate'] for i in idxs]))
    sorted_top = sorted(range(n_top), key=lambda g: group_score[g])  # low 3pt rate first

    final_labels = [-1] * len(player_seasons)
    group_structure = {}  # cluster_id → (top_idx, sub_idx)
    cluster_id = 0

    for top_new, top_old in enumerate(sorted_top):
        idxs = [i for i, l in enumerate(s1_labels) if l == top_old]
        k_actual = min(k_sub, max(1, len(idxs) // 10))

        print(f'  Stage 2: group {top_new+1} (n={len(idxs)}), k={k_actual}...', file=sys.stderr)

        group_s2 = s2_vecs[idxs]
        sub_labels, _ = hierarchical_ward(group_s2, k_actual)

        # Sort sub-groups: high TS% first
        sub_ts = {}
        for sg in range(k_actual):
            sub_idxs = [idxs[i] for i, l in enumerate(sub_labels) if l == sg]
            sub_ts[sg] = float(np.mean([player_seasons[i]['pct']['TS%'] for i in sub_idxs]))
        sorted_subs = sorted(range(k_actual), key=lambda sg: -sub_ts[sg])
        sub_remap = {old: new for new, old in enumerate(sorted_subs)}

        for i, orig_idx in enumerate(idxs):
            sub_new = sub_remap[sub_labels[i]]
            final_labels[orig_idx] = cluster_id + sub_new

        for sg_new in range(k_actual):
            group_structure[cluster_id + sg_new] = (top_new, sg_new)
        cluster_id += k_actual

    return final_labels, group_structure

# ---------- dendrogram ----------

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
        szs[ii]   = ni + nj
        ids[ii]   = next_id
        next_id  += 1
        cents.pop(jj); szs.pop(jj); ids.pop(jj)

    return linkage

# ---------- build output ----------

def build_output(player_seasons, vecs_display, labels, k_total, method,
                 group_structure=None):
    import numpy as np
    letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

    clusters = []
    for c in range(k_total):
        mask   = [i for i, l in enumerate(labels) if l == c]
        center = vecs_display[mask].mean(axis=0)
        dists  = np.sqrt(np.sum((vecs_display[mask] - center) ** 2, axis=1))
        order  = np.argsort(dists)

        centroid_dict = {DISPLAY_DIMS[j]: round(float(center[j]), 4)
                         for j in range(len(DISPLAY_DIMS))}
        top = [{
            'slug':   player_seasons[mask[i]]['slug'],
            'player': player_seasons[mask[i]]['player'],
            'season': player_seasons[mask[i]]['season'],
            'team':   player_seasons[mask[i]]['team'],
            'dist':   round(float(dists[i]), 4),
            'pct':    {d: round(player_seasons[mask[i]]['pct'][d], 3) for d in DISPLAY_DIMS},
        } for i in order]

        hier = ''
        if group_structure and c in group_structure:
            top_idx, sub_idx = group_structure[c]
            hier = f'{top_idx + 1}{letters[sub_idx]}'

        clusters.append({
            'id':        c,
            'hier_name': hier,
            'name':      '',
            'size':      len(mask),
            'centroid':  centroid_dict,
            'top':       top,
        })

    # If no group_structure, fall back to dendrogram-based naming
    if not group_structure:
        final_cents_arr = [[v for v in c['centroid'].values()] for c in clusters]
        final_sizes     = [c['size'] for c in clusters]
        linkage_tmp = build_dendrogram(final_cents_arr, final_sizes)
        from itertools import chain
        # assign names via dendrogram traversal (old method)
        nodes = {c['id']: {'id': c['id'], 'leaf': True} for c in clusters}
        for i, m in enumerate(linkage_tmp):
            nid = k_total + i
            nodes[nid] = {'id': nid, 'leaf': False,
                          'left': m['a'], 'right': m['b'], 'dist': m['dist']}
        root = k_total + len(linkage_tmp) - 1

        def leaf_order(nid):
            nd = nodes[nid]
            return [nid] if nd['leaf'] else leaf_order(nd['left']) + leaf_order(nd['right'])

        active = [root]
        while len(active) < 4:
            expandable = [(nodes[nid]['dist'], nid)
                          for nid in active if not nodes[nid]['leaf']]
            if not expandable: break
            _, best = max(expandable)
            active.remove(best)
            active += [nodes[best]['left'], nodes[best]['right']]

        all_leaves = leaf_order(root)
        pos = {lid: i for i, lid in enumerate(all_leaves)}
        groups = sorted([leaf_order(nid) for nid in active], key=lambda g: pos[g[0]])
        name_map = {}
        for gi, leaves in enumerate(groups):
            for li, leaf_id in enumerate(leaves):
                name_map[leaf_id] = f'{gi+1}{letters[li]}'
        for c in clusters:
            c['hier_name'] = name_map[c['id']]

    # Sort by hier_name then re-assign IDs
    clusters.sort(key=lambda c: c['hier_name'])
    for i, c in enumerate(clusters):
        c['id'] = i

    final_cents_arr = [[v for v in c['centroid'].values()] for c in clusters]
    final_sizes     = [c['size'] for c in clusters]
    linkage = build_dendrogram(final_cents_arr, final_sizes)

    return {
        'dims':     DISPLAY_DIMS,
        'method':   method,
        'k':        k_total,
        'n':        len(player_seasons),
        'clusters': clusters,
        'linkage':  linkage,
    }

# ---------- main ----------

def main():
    import numpy as np

    args   = sys.argv[1:]
    method = 'twostage'
    k      = K
    n_top  = N_TOP
    k_sub  = K_SUB
    for i, a in enumerate(args):
        if a == '--method' and i + 1 < len(args): method = args[i + 1]
        if a == '--k'      and i + 1 < len(args): k      = int(args[i + 1])
        if a == '--n-top'  and i + 1 < len(args): n_top  = int(args[i + 1])
        if a == '--k-sub'  and i + 1 < len(args): k_sub  = int(args[i + 1])

    print(f'Method: {method}', file=sys.stderr)
    rows = load_rows()
    agg  = aggregate(rows)

    player_seasons = []
    for r in agg:
        if r['G'] < MIN_GAMES: continue
        player_seasons.append({
            'slug':   r['SLUG'],
            'player': r['PLAYER'],
            'season': r['SEASON'],
            'team':   r['TEAM'],
            'raw':    features_raw(r),
        })

    print(f'{len(player_seasons)} player-seasons (>={MIN_GAMES}G)', file=sys.stderr)
    compute_percentiles(player_seasons)

    vecs_display = make_vecs(player_seasons, DISPLAY_DIMS)

    if method == 'twostage':
        k_total = n_top * k_sub
        print(f'Two-stage: {n_top} top groups × {k_sub} sub-groups = {k_total} clusters',
              file=sys.stderr)
        labels, group_structure = two_stage(player_seasons, n_top, k_sub)
        k_total = max(labels) + 1
    elif method == 'kmeans':
        print(f'k-means k={k}...', file=sys.stderr)
        labels, _ = kmeans(vecs_display, k)
        group_structure = None
        k_total = k
    else:
        print(f'Hierarchical Ward k={k}...', file=sys.stderr)
        print(f'  Building {len(player_seasons)}×{len(player_seasons)} distance matrix...',
              file=sys.stderr)
        labels, _ = hierarchical_ward(vecs_display, k)
        group_structure = None
        k_total = k

    output = build_output(player_seasons, vecs_display, labels, k_total, method,
                          group_structure)

    with open(OUT_PATH, 'w') as f:
        json.dump(output, f, indent=2)

    print(f'Wrote {OUT_PATH}', file=sys.stderr)
    for c in output['clusters']:
        top3 = ', '.join(p['player'].split(', ')[-1] + ' ' + p['player'].split(', ')[0]
                         for p in c['top'][:2])
        print(f"  {c['hier_name']:4s} [{c['id']:2d}] n={c['size']:3d}: {top3}",
              file=sys.stderr)

if __name__ == '__main__':
    main()
