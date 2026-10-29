#!/usr/bin/env python3
"""Pins how build/poopoo.py files a future pick on the rosters committee's
Draft Picks tab. Needs openpyxl and requests (poopoo's own imports), so run it
with the build venv: build/venv/bin/python3 build/test_poopoo_picks.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import poopoo  # noqa: E402


def sheet(owner, details=None, note=None, year=2027, rnd=2):
    return {"year": year, "round": rnd, "owner_raw": owner, "details": details, "note": note}


def site(owner, leaves=(), group_id=None, notes=""):
    return {"owner": owner, "leaves": [{"team": t, "description": d} for t, d in leaves],
            "group_id": group_id, "notes": notes, "frozen": False}


def cat(team, row, pick, events=None, mentions=frozenset()):
    return poopoo.classify_pick(team, row, pick, events or {}, mentions)["category"]


def test_one_team_in_common_is_not_reconciled():
    # 2027 IND 2nd, 2026-10-29: the sheet and site share NYK and nothing else.
    row = sheet("CHA/NYK", "Protected 31-55", "31-55 to CHA 56-60 to NYK")
    pick = site("NYK|MIA", [("NYK", "protected band 31-55"), ("MIA", "protected band 56-60")])
    out = poopoo.classify_pick("IND", row, pick, {})
    assert out["category"] == "parties_differ", out
    assert out["site_only_parties"] == ["MIA"] and out["sheet_only_parties"] == ["CHA"]


def test_same_teams_written_differently_is_reconciled():
    row = sheet("BOS/HOU", "More Favorable",
                "Boston will receive the more favorable of '27 San Antonio 2nd, Houston the less favorable")
    pick = site("BOS|HOU", [("BOS", "swap priority (better pick)"), ("HOU", "swap priority (worse pick)")],
                group_id="g")
    assert cat("SAS", row, pick) == "clean_match"
    row = sheet("Own*", "Pick Swap", "Boston has the right to swap with Houston's 2nd")
    assert cat("BOS", row, pick) == "same_owner_diff_representation"


def test_swap_group_parties_named_on_a_sibling_row():
    # 2027 GSW 1st: "See '27 Detroit 1st" -- the parties are spelled out there.
    row = sheet("Own*", "Less Favorable", "See '27 Detroit 1st for more details", rnd=1)
    pick = site("PHX|GSW", [("PHX", "better"), ("GSW", "worse")], group_id="g")
    assert cat("GSW", row, pick) == "parties_differ"
    assert cat("GSW", row, pick, mentions={"PHX", "GSW"}) == "same_owner_diff_representation"


def test_abbreviation_needs_upper_case():
    assert poopoo.teams_named("the minimum") == set()
    assert poopoo.teams_named("MIN keeps 1-3; L.A. Clippers get the rest") == {"MIN", "LAC"}


def test_sheet_behind_a_logged_trade():
    events = {(2027, 1, "MIA"): [{"date": "2026-07-19", "from": "NOP", "to": "UTA", "description": ""}]}
    assert cat("MIA", sheet("NOP", rnd=1), site("UTA"), events) == "committee_lag"


def test_site_pick_missing_from_sheet_is_listed():
    picks = {"WAS": [{"year": 2033, "round": 1, "orig": "WAS", "owner": "WAS", "leaves": []}],
             "BOS": [{"year": 2033, "round": 1, "orig": "BOS", "owner": "BOS", "leaves": []}]}
    report = poopoo.build_picks_report({"BOS": [sheet("Own", year=2033, rnd=1)]}, picks, [], 2026)
    assert [(r["team"], r["category"]) for r in report["rows"]] == [("WAS", "not_on_sheet")]
    assert report["checked"] == 2 and report["years"] == [2033, 2033]


def test_split_only_on_other_tabs_is_flagged():
    # 2027 DEN 2nd: the pick's own row says MEM; the GSW and MEM tabs split it.
    claims = [{"tab": "GSW", "from": "DEN", "details": "Protected 31-55", "note": "MEM Receives 31-55\nGSW Receives 56-60"},
              {"tab": "MEM", "from": "DEN", "details": "Protected 31-55", "note": "MEM Receives 31-55\nGSW Receives 56-60"}]
    out = poopoo.classify_pick("DEN", sheet("MEM"), site("MEM"), {}, frozenset(), claims)
    assert out["category"] == "needs_investigation" and out["sheet_only_parties"] == ["GSW"], out


def test_receiver_carries_over_a_wrapped_line():
    text = "Trade 70:\nSAS receives: Norman Powell\nBOS receives:Brook Lopez,2031 SAS 1st,\n2027 SAS/OKC 2nd"
    assert poopoo.pick_mentions(text, 2027, 2, "SAS") == [("BOS", "2027 SAS/OKC 2nd")]
    assert poopoo.pick_mentions("TOR receives: DAL 2030 FRP swap (favors TOR)", 2030, 1, "DAL")[0][0] == "TOR"


def test_senders_are_worked_out_and_gaps_found():
    hist = [
        {"date": "2021-02-07", "to": "HOU", "clause": "2027 LAC 2nd", "teams": {"HOU", "DET", "POR", "LAC"}},
        {"date": "2021-10-15", "to": "MEM", "clause": "LAC 2027 2nd protected", "teams": {"HOU", "MEM"}},
        {"date": "2022-07-03", "to": "TOR", "clause": "2027 LAC 2nd", "teams": {"TOR", "MEM"}},
        {"date": "2025-06-30", "to": "NOP", "clause": "2027 LAC 2nd", "teams": {"NOP", "WAS"}},
    ]
    out = poopoo.infer_senders((2027, 2, "LAC"), hist)
    assert [(e.get("from"), e.get("from_basis")) for e in out] == [
        ("LAC", "chain"), ("HOU", "chain"), ("MEM", "chain"), ("WAS", "two_team")]
    # Nothing ever gave WAS the pick.
    assert out[3]["gap_before"] == ["WAS"] and not any(e.get("gap_before") for e in out[:3])
    # Full team names count as a receiver.
    assert poopoo.pick_mentions("Memphis Receives: BOS 2022 2nd, LAC 2027 2nd protected", 2027, 2, "LAC")[0][0] == "MEM"


def test_sheet_naming_the_old_holder_is_lag():
    # 2027 LAL 2nd: sheet NOP/LAC; Trade 51 sent NOP's 31-50 to NYK.
    events = {(2027, 2, "LAL"): [{"date": "2026-08-19", "from": "NOP", "to": "NYK", "description": ""}]}
    row = sheet("NOP/LAC", "Protected 51-60", "31-50 to NOP\n51-60 to LAC")
    pick = site("NYK|LAC", [("NYK", "protected band 31-50"), ("LAC", "protected band 51-60")])
    assert cat("LAL", row, pick, events) == "committee_lag"


if __name__ == "__main__":
    poopoo.load_pick_notes = lambda: {}
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
