Parse a snapshot of player OVR ratings from free-form text and add them to the OVR history.

$ARGUMENTS format: `YYYY-MM-DD <text>` — the snapshot date is the first token; everything after is the raw text to parse.

## Steps

### 1. Split arguments

Extract `DATE` (first whitespace-delimited token from $ARGUMENTS, must match `\d{4}-\d{2}-\d{2}`) and `TEXT` (everything after the date).

### 2. Load the player universe

Read `/var/lib/nothing-but-stats/player-bios.json`. Build a name lookup by running:

```python
import json, difflib

with open('/var/lib/nothing-but-stats/player-bios.json') as f:
    bios = json.load(f)

# Build: lowercase "first last" → slug
name_to_slug = {}
for slug, bio in bios.items():
    last, first = bio['name'].split(', ', 1)
    full = f"{first.title()} {last.title()}".lower()
    name_to_slug[full] = slug
```

### 3. Extract (player_name, ovr) pairs from TEXT

Read the TEXT carefully and identify all player name + OVR pairs. The format is flexible — it may look like:
- `88 (+2) Luke Kornet`
- `Luke Kornet 88 (+2)`
- `Luke Kornet: 88`
- A table or list with names and numbers

Rules for extraction:
- OVR values are integers in the range 50–99
- The change in parentheses like `(+2)`, `(-1)`, `(=)` is noise — ignore it, do not treat it as the OVR
- Team names, city names, position labels (PG, SG, SF, PF, C), and headings are not player names — skip them
- Roster numbers (jersey #) are usually 0–55 and appear separately from OVR in context; don't confuse them with OVR
- Extract the name as it appears in the source text (e.g., "Luke Kornet", not "Kornet, Luke")

Produce a list of `(extracted_name, ovr_int)` tuples.

### 4. Fuzzy-match names to slugs

For each extracted name, run this Python to find the best slug match:

```python
query = extracted_name.lower()
matches = difflib.get_close_matches(query, name_to_slug.keys(), n=3, cutoff=0.55)
if matches:
    best = matches[0]
    slug = name_to_slug[best]
    # also show the matched display name for the user to verify
```

Group results into:
- **Matched** — at least one close match found (use the best one)
- **Unmatched** — no match above cutoff

### 5. Present results and resolve unmatched

Print a summary table of matched entries:

```
DATE: <DATE>

MATCHED (<N>):
  Luke Kornet      → kornet-luke        OVR 88
  Bam Adebayo      → adebayo-bam        OVR 91
  ...

UNMATCHED (<M>):
  "Collin Sexton-Smith" — no close match found
  ...
```

For each unmatched entry, ask the user to either:
- Provide the correct slug (they can look it up in player-bios.json or the players page)
- Confirm it should be skipped (e.g. a coaching staff name, non-player text)

Wait for the user's response before proceeding to step 6. Incorporate any corrections into the final list.

### 6. Get the admin token

Check the environment variable `NBN_TOKEN` by running `echo $NBN_TOKEN`. If it is non-empty, use it. Otherwise ask the user to paste their admin token (it will be sent as `Authorization: Bearer <token>`).

### 7. Submit to the API

POST the matched entries to the local API:

```bash
curl -s -X POST http://localhost:8001/api/ovr/batch \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '<JSON array of {slug, date, ovr}>'
```

The JSON body should be:
```json
[
  {"slug": "kornet-luke", "date": "2025-12-01", "ovr": 88},
  {"slug": "adebayo-bam", "date": "2025-12-01", "ovr": 91}
]
```

### 8. Report outcome

Print the API response. If `ok: true`, confirm how many entries were saved. If there's an error, show the detail and do not retry automatically.
