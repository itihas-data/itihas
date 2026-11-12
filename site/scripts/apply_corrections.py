"""Patch the ITIHAS site's generated data files with the corrected v1 numbers (12 Nov 2026).

Reads only (never writes) the project's corrected outputs:
  - FC: unrounded fc_core shares on the D30 ratio files (D45), as out/rebuild_12nov/fc_tables.py does
  - NBC: out/rebuild_12nov/nbc_d44/nbc_counterfactual_primary.csv (D44, J&K counted once)
  - Two-year rule: out/checks_12nov/d42_root/out/analysis/maturity_curve.csv (D42)
  - Hand check: release/database/build_report.json (31 = hand_checked_ok + hand_checked_corrected)
Writes: release/site/data/money.json, two_year.json, site.json (counts.hand_checked only).
Usage: python -I patch_site_data.py <project_root> [--dry-run]
"""
import json, sys
from pathlib import Path
import pandas as pd

ROOT = Path(sys.argv[1]).resolve()
DRY = "--dry-run" in sys.argv
sys.path.insert(0, str(ROOT / "scripts" / "fc"))
from fc_core import Formula, moved_pp  # noqa: E402

SITE = ROOT / "release/site/data"
FC = ROOT / "out/analysis/fc"
RF = str(ROOT / "research/fc")
# Pools as in the generator (POOLS) and fc_tables.py; the site books the 16th FC as one year at the 2026-27 BE.
POOL = {"fc15_interim": (594997, 1), "fc15_final": (898392 + 948407 + 1129494 + 1274121 + 1392971, 5), "fc16": (1526255, 1)}
VN = {"fc15_interim": ("HB 2019-03-03", "HB 2020-10-13"), "fc15_final": ("HB 2020-10-13", "HB 2021-11-24"),
      "fc16": ("MoSPI 2025-08-01", "MoSPI 2026-04-15")}

def r(x, n):
    return float(round(x, n))

money = json.loads((SITE / "money.json").read_text())
changes = []

# ---------- Finance Commission: summary and by_state from unrounded shares ----------
new_by = {}
new_sum = {}
for w, (tot, nyears) in POOL.items():
    f = Formula(RF, w)
    base = f.shares()
    for vn, vint in zip(["V", "V_alt"], VN[w]):
        al = pd.read_csv(FC / f"alt_detail_{w}_{vn}.csv")
        rat = {(x.state, x.fy): x.ratio for x in al.itertuples()}
        sh = f.shares_from_ratios(rat)
        pp = moved_pp(base, sh)
        new_sum[(w, vint)] = dict(share_moved_pp=round(pp, 3), rs_crore_moved_total=int(round(pp / 100 * tot)),
                                  rs_crore_moved_per_year=int(round(pp / 100 * tot / nyears)))
        for s in base:
            new_by[(w, vint, s)] = dict(share_pct_base=r(base[s], 4), share_pct_cf=r(sh[s], 4),
                                        dpp=r(sh[s] - base[s], 4), rs_crore=r((sh[s] - base[s]) / 100 * tot, 4))

for row in money["summary"]:
    k = (row["award"], row["base_vintage"])
    for fld, v in new_sum[k].items():
        if row[fld] != v:
            changes.append(f"summary {k} {fld}: {row[fld]} -> {v}")
            row[fld] = v
for row in money["by_state"]:
    k = (row["award"], row["base_vintage"], row["state"])
    for fld, v in new_by[k].items():
        if abs(row[fld] - v) > 1e-9:
            row[fld] = v
            changes.append(f"by_state {k} {fld}")
assert len(money["by_state"]) == len(new_by), (len(money["by_state"]), len(new_by))

# Cross-check against the rebuild's own outputs (Figure 6 and Table 6).
fig6 = pd.read_csv(ROOT / "out/rebuild_12nov/figure6_fc15_final_by_state.csv").set_index("state")
for s, x in fig6.rs_crore_2021_26.items():
    assert abs(new_by[("fc15_final", "HB 2020-10-13", s)]["rs_crore"] - x) < 1e-3, s
ta = pd.concat([pd.read_csv(ROOT / f"out/rebuild_12nov/table6_panel{p}.csv") for p in "AC"])
for t in ta.itertuples():
    ns = new_sum[(t.award, t.base_vintage)]
    assert abs(ns["share_moved_pp"] - t.share_moved_pp) < 6e-4
    assert ns["rs_crore_moved_per_year"] == int(round(t.rs_crore_per_year)), (t.award, t.base_vintage)

# ---------- Borrowing ceilings: D44 ----------
nbc = pd.read_csv(ROOT / "out/rebuild_12nov/nbc_d44/nbc_counterfactual_primary.csv")
r2 = lambda x, n: None if pd.isna(x) else round(float(x), n)  # as the generator's r2
new_nbc = dict(
    n=int(len(nbc)), states=int(nbc.state.nunique()),
    years=sorted(nbc.fy.unique().tolist()),
    median_abs_pct=r2(nbc.d_pct_of_nbc.abs().median(), 1),
    gross=r2(nbc.dNBC.abs().sum(), 0), net=r2(nbc.dNBC.sum(), 0),
    by_year=[dict(fy=fy, gross=r2(g.dNBC.abs().sum(), 0), net=r2(g.dNBC.sum(), 0)) for fy, g in nbc.groupby("fy")],
)
assert new_nbc["gross"] == 281040 and new_nbc["net"] == -144135 and new_nbc["median_abs_pct"] == 4.6
for k in new_nbc:
    if money["nbc"][k] != new_nbc[k]:
        changes.append(f"nbc {k}: {money['nbc'][k]} -> {new_nbc[k]}")
money["nbc"] = new_nbc

# ---------- Two-year rule: D42 ----------
two = json.loads((SITE / "two_year.json").read_text())
mc = pd.read_csv(ROOT / "out/checks_12nov/d42_root/out/analysis/maturity_curve.csv")
new_mat = [dict(age=x.age_months, n=int(x.n), states=int(x.states), rms=r2(x.rms_revision_pp, 2),
                mae=r2(x.mean_abs_revision_pp, 2), corr=r2(x.cross_state_corr_with_latest, 2), r2=r2(x.r2, 2))
           for x in mc.itertuples()]
for old, new in zip(two["maturity"], new_mat):
    if old != new:
        changes.append(f"maturity {old} -> {new}")
two["maturity"] = new_mat

# ---------- Hand check: 31 values checked by hand ----------
site = json.loads((SITE / "site.json").read_text())
val = json.loads((ROOT / "release/database/build_report.json").read_text())["validation"]
hc = val["hand_checked_ok"] + val["hand_checked_corrected"]
assert hc == 31
changes.append(f"site.counts.hand_checked: {site['counts']['hand_checked']} -> {hc}")
site["counts"]["hand_checked"] = hc

print("\n".join(c for c in changes if not c.startswith("by_state")))
print(sum(c.startswith("by_state") for c in changes), "by_state field changes")
if not DRY:
    dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    (SITE / "money.json").write_text(json.dumps(money, separators=(",", ":"), allow_nan=False))
    (SITE / "two_year.json").write_text(json.dumps(two, separators=(",", ":"), allow_nan=False))
    (SITE / "site.json").write_text(dump(site))
    print("written")
