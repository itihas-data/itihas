"""Build the JSON files the ITIHAS website reads.

Usage:
    python build_site_data.py <repo_root> [<results_root>]

<repo_root> is the folder that holds `database/` and `site/`. The script writes the JSON into
`site/data/`, copies the downloads into `site/downloads/`, writes the calculator's test vectors
into `site/tests/`, and writes the 34 state pages from `site/states/_template.html`.
<results_root> is the folder that holds the paper's analysis outputs
(`out/analysis/...`); it defaults to the parent of <repo_root>. The money and
two-year-rule pages need it; everything else comes from `database/`.

Growth rates follow the database's own rule: the growth rate printed in a
document is used where there is one; otherwise growth is computed from two
consecutive levels printed in the same document. Rates are never computed
across documents.
"""
from __future__ import annotations

import json
import shutil
import sys
from datetime import date
from pathlib import Path

import pandas as pd

SRC = {"mospi": "mospi", "rbi_handbook": "rbi"}  # everything else is a state document
TIE_TOL = 0.005  # percentage points


def slugify(name: str) -> str:
    """URL slug for a state page: lower-case name with hyphens."""
    return "-".join("".join(ch if ch.isalnum() else " " for ch in name.lower()).split())


def r2(x, nd=2):
    return None if x is None or pd.isna(x) else round(float(x), nd)


def load(repo: Path) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    db = repo / "database"
    v = pd.read_csv(db / "data/vintages_long.csv", low_memory=False)
    rbi = pd.read_csv(db / "rbi_handbook/vintages_long_rbi.csv", low_memory=False)
    rbi = rbi[rbi.base_year == "2011-12"]
    allv = pd.concat([v, rbi], ignore_index=True)
    allv = allv[allv.series == "gsdp"].copy()
    allv["src"] = allv.source_type.map(SRC).fillna("state")
    # The paper dates a figure by when it first became public (D22).
    allv["vdate"] = allv.first_public_date.fillna(allv.release_date)
    allv["order"] = range(len(allv))  # file order, used as a stable tie-break only

    rel = pd.read_csv(db / "data/releases.csv")
    rrel = pd.read_csv(db / "rbi_handbook/releases_rbi.csv")
    rel = pd.concat([rel, rrel], ignore_index=True)
    states = pd.read_csv(db / "data/states.csv")
    return allv, rel, states


def growth_table(allv: pd.DataFrame, prices: str) -> pd.DataFrame:
    """One row per (state, release, fiscal year): level and growth for one price basis."""
    d = allv[allv.prices == prices].copy()
    d = d.sort_values("order", kind="stable").drop_duplicates(
        ["state_code", "release_id", "fiscal_year"], keep="first")
    d["fy0"] = d.fiscal_year.str[:4].astype(int)
    d = d.sort_values(["state_code", "release_id", "fy0"], kind="stable")
    prev = d[["state_code", "release_id", "fy0", "value_rs_crore"]].copy()
    prev["fy0"] += 1
    prev = prev.rename(columns={"value_rs_crore": "level_prev"})
    d = d.merge(prev, on=["state_code", "release_id", "fy0"], how="left")
    gp = pd.to_numeric(d.growth_pct_printed.astype(str).str.replace("(-)", "-", regex=False)
                       .str.replace("−", "-", regex=False).str.strip(), errors="coerce")
    gc = (d.value_rs_crore / d.level_prev - 1) * 100
    d["growth"] = gp.where(gp.notna(), gc)
    d["growth_src"] = pd.Series("printed", index=d.index).where(gp.notna(), "computed")
    d.loc[d.growth.isna(), "growth_src"] = None
    d["proj"] = is_projection(d.vdate, d.fiscal_year)
    return d.sort_values("order", kind="stable")


def is_projection(vdate: pd.Series, fy: pd.Series) -> pd.Series:
    """A figure for fiscal year t printed before 1 Oct of year t is a projection (paper rule)."""
    return pd.to_datetime(vdate, errors="coerce") < pd.to_datetime(fy.str[:4] + "-10-01")


SRC_RANK = {"mospi": 0, "rbi": 1, "state": 2}  # same-day order used by the paper's panel


def first_latest(g: pd.DataFrame) -> pd.DataFrame:
    """First and latest published growth per state and fiscal year, as in the paper's panel:
    dated documents only, projections dropped, ordered by date, then source."""
    d = g[g.growth.notna() & g.vdate.notna() & ~g.proj].copy()
    d["srank"] = d.src.map(SRC_RANK)
    d = d.sort_values(["vdate", "srank", "order"], kind="stable")
    out = []
    for (st, fy), grp in d.groupby(["state_code", "fiscal_year"], sort=True):
        fdate, ldate = grp.vdate.iloc[0], grp.vdate.iloc[-1]
        fset = grp[grp.vdate == fdate]
        lset = grp[grp.vdate == ldate]
        out.append(dict(
            state=st, fy=fy,
            first=float(fset.growth.iloc[0]), first_date=fdate, first_src=fset.src.iloc[0],
            first_release=fset.release_id.iloc[0],
            first_tie=bool(fset.growth.max() - fset.growth.min() > TIE_TOL),
            latest=float(lset.growth.iloc[-1]), latest_date=ldate, latest_src=lset.src.iloc[-1],
            latest_release=lset.release_id.iloc[-1],
            latest_tie=bool(lset.growth.max() - lset.growth.min() > TIE_TOL),
            n=int(grp.release_id.nunique()),
        ))
    fl = pd.DataFrame(out)
    fl["revision"] = fl.latest - fl.first
    return fl


def build_states(repo: Path, out: Path, allv, rel, states, gc, gk, fl) -> tuple[list[dict], dict]:
    rel_idx = rel.set_index("release_id")
    summaries, releases_by_state = [], {}
    (out / "states").mkdir(parents=True, exist_ok=True)
    for _, s in states.iterrows():
        code = s.state_code
        sub_k, sub_c = gk[gk.state_code == code], gc[gc.state_code == code]
        rids = pd.concat([sub_k, sub_c]).drop_duplicates("release_id").sort_values(
            ["vdate", "order"], kind="stable", na_position="last").release_id.tolist()
        releases = []
        for rid in rids:
            r = rel_idx.loc[rid] if rid in rel_idx.index else None
            src = (sub_k[sub_k.release_id == rid].src.tolist() or sub_c[sub_c.release_id == rid].src.tolist())[0]
            pages = sorted({str(p) for p in allv[(allv.release_id == rid) & (allv.state_code == code)].page.dropna()})
            releases.append(dict(
                id=rid,
                date=None if r is None or pd.isna(r.first_public_date) and pd.isna(r.release_date)
                else (r.release_date if pd.isna(r.first_public_date) else r.first_public_date),
                printed_date=None if r is None or pd.isna(r.release_date) else r.release_date,
                src=src,
                publisher=None if r is None else r.publisher,
                title=None if r is None or pd.isna(r.get("title")) else r.title,
                url=None if r is None or pd.isna(r.get("url")) else r.url,
                pages=pages[:6] if src == "state" else [],
            ))

        def series(sub, field, nd):
            res = {}
            for rid, grp in sub.groupby("release_id", sort=False):
                vals = {fy: r2(x, nd) for fy, x in zip(grp.fiscal_year, grp[field]) if pd.notna(x)}
                if vals:
                    res[rid] = vals
            return res

        fls = fl[fl.state == code]
        data = dict(
            code=code, name=s.state_name, type=s.type,
            note=None if pd.isna(s.notes) else s.notes,
            releases=releases,
            growth=series(sub_k, "growth", 2),
            growth_src={rid: {fy: gs for fy, gs in zip(grp.fiscal_year, grp.growth_src) if isinstance(gs, str)}
                        for rid, grp in sub_k.groupby("release_id", sort=False)},
            proj={rid: sorted(grp.fiscal_year[grp.proj].tolist())
                  for rid, grp in sub_k.groupby("release_id", sort=False) if grp.proj.any()},
            level={"constant": series(sub_k, "value_rs_crore", 0),
                   "current": series(sub_c, "value_rs_crore", 0)},
            first_latest=[dict(fy=r.fy, first=r2(r.first), first_date=r.first_date, first_src=r.first_src,
                               first_release=r.first_release, first_tie=r.first_tie,
                               latest=r2(r.latest), latest_date=r.latest_date, latest_src=r.latest_src,
                               latest_release=r.latest_release, latest_tie=r.latest_tie,
                               revision=r2(r.revision), n=int(r.n)) for r in fls.itertuples()],
        )
        (out / "states" / f"{code}.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False))
        n_state_docs = sum(1 for r in releases if r["src"] == "state")
        releases_by_state[code] = releases
        summaries.append(dict(
            code=code, name=s.state_name, slug=slugify(s.state_name), type=s.type,
            n_values=int(len(allv[(allv.state_code == code)])),
            n_state_docs=n_state_docs, n_releases=len(releases),
            # which revision-triangle CSVs exist for this state (state and MoSPI documents only)
            triangles=[t for t in ("gsdp_constant", "gsdp_current")
                       if (repo / "database/data/triangles" / t / f"{code}.csv").exists()],
        ))
    return summaries, releases_by_state


def build_asof(out: Path, gk: pd.DataFrame, fl: pd.DataFrame, releases_by_state: dict) -> None:
    """asof.json: every dated growth estimate, in the order the paper's panel uses, so a page can
    show what was known on any date without loading all 34 state files.

    docs: [id, date, source, publisher, title], one entry per document (RBI and MoSPI documents
          are shared by every state).
    rel:  state code -> indices into docs, in the order of the state file (dated first).
    est:  state code -> fiscal year -> [[doc index, growth], ...] oldest first. Dated documents
          only, projections dropped, same-day order MoSPI, RBI, state: the rule first_latest()
          uses, so the first and last entries are the `f` and `l` of site.json's cells.
    """
    docs, index = [], {}
    rel = {}
    for code, releases in releases_by_state.items():
        rel[code] = []
        for r in releases:
            if r["id"] not in index:
                index[r["id"]] = len(docs)
                docs.append([r["id"], r["date"], r["src"], r["publisher"], r["title"]])
            rel[code].append(index[r["id"]])
    d = gk[gk.growth.notna() & gk.vdate.notna() & ~gk.proj].copy()
    d["srank"] = d.src.map(SRC_RANK)
    d = d.sort_values(["vdate", "srank", "order"], kind="stable")
    est = {}
    for (st, fy), grp in d.groupby(["state_code", "fiscal_year"], sort=True):
        est.setdefault(st, {})[fy] = [[index[rid], r2(g)] for rid, g in zip(grp.release_id, grp.growth)]
    # The map's "today" must be the same number as everywhere else on the site.
    for r in fl.itertuples():
        seq = est[r.state][r.fy]
        assert seq[0][1] == r2(r.first) and seq[-1][1] == r2(r.latest), (r.state, r.fy)
        assert docs[seq[0][0]][1] == r.first_date and docs[seq[-1][0]][1] == r.latest_date, (r.state, r.fy)
    (out / "asof.json").write_text(json.dumps(dict(docs=docs, rel=rel, est=est), ensure_ascii=False,
                                              separators=(",", ":"), allow_nan=False))


def write_state_pages(repo: Path, summaries: list[dict]) -> None:
    """One page per state, written from site/states/_template.html."""
    site = repo / "site"
    template = site / "states/_template.html"
    if not template.exists():
        return
    html = template.read_text()
    order = sorted(summaries, key=lambda s: s["name"])
    for i, s in enumerate(order):
        page = (html.replace("{{code}}", s["code"]).replace("{{name}}", s["name"])
                .replace("{{slug}}", s["slug"])
                .replace("{{prev}}", order[i - 1]["slug"]).replace("{{prev_name}}", order[i - 1]["name"])
                .replace("{{next}}", order[(i + 1) % len(order)]["slug"])
                .replace("{{next_name}}", order[(i + 1) % len(order)]["name"]))
        folder = site / "states" / s["slug"]
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "index.html").write_text(page)


def build_results(res_root: Path, out: Path) -> None:
    a = res_root / "out/analysis"
    mc = pd.read_csv(a / "maturity_curve.csv")
    rs = pd.read_csv(a / "revision_stats.csv", index_col=0)
    two = dict(
        maturity=[dict(age=r.age_months, n=int(r.n), states=int(r.states), rms=r2(r.rms_revision_pp),
                       mae=r2(r.mean_abs_revision_pp), corr=r2(r.cross_state_corr_with_latest),
                       r2=r2(r.r2)) for r in mc.itertuples()],
        headline={k: r2(rs.iloc[0][c], 2) for k, c in
                  [("n", "n"), ("states", "states"), ("mean", "mean_rev"), ("mae", "mean_abs_rev"),
                   ("rmse", "rmse_rev"), ("gt2", "share_abs_rev_gt2pp")]},
    )
    (out / "two_year.json").write_text(json.dumps(two, separators=(",", ":"), allow_nan=False))

    fc = a / "fc"
    summ = pd.read_csv(fc / "fc_counterfactual_summary.csv")
    bys = pd.read_csv(fc / "fc_counterfactual_by_state.csv")
    plc = pd.read_csv(a / "fc_ext/e1_placebo_commissions.csv")
    e1 = pd.read_csv(a / "fc_ext/e1_summary.csv")
    own = pd.read_csv(a / "fc_ext/e1b_own_gsdp_sensitivity.csv")
    tu = pd.read_csv(a / "fc_ext/trueup_illustration_fc15_final.csv")
    reb = pd.read_csv(a / "fc_ext/e2b_rebase_scenario.csv")
    nbc = pd.read_csv(a / "nbc/nbc_counterfactual_primary.csv")
    money = dict(
        summary=summ.to_dict("records"),
        by_state=bys[["award", "base_vintage", "state", "share_pct_base", "share_pct_cf", "dpp", "rs_crore"]]
        .round(4).to_dict("records"),
        placebo=plc.to_dict("records"),
        placebo_summary=e1.rename(columns={"actual_rank_of_n (1=largest)": "actual_rank"}).to_dict("records"),
        own=own.round(4).to_dict("records"),
        trueup=tu.to_dict("records"),
        rebase=reb.to_dict("records"),
        nbc=dict(
            n=int(len(nbc)), states=int(nbc.state.nunique()),
            years=sorted(nbc.fy.unique().tolist()),
            median_abs_pct=r2(nbc.d_pct_of_nbc.abs().median(), 1),
            gross=r2(nbc.dNBC.abs().sum(), 0), net=r2(nbc.dNBC.sum(), 0),
            by_year=[dict(fy=fy, gross=r2(g.dNBC.abs().sum(), 0), net=r2(g.dNBC.sum(), 0))
                     for fy, g in nbc.groupby("fy")],
        ),
    )
    money = json.loads(pd.Series([money]).to_json(orient="values"))[0]  # NaN -> null
    (out / "money.json").write_text(json.dumps(money, separators=(",", ":"), allow_nan=False))


# Pools for the calculator, Rs crore a year: actual devolution (15th interim: 2020-21; 15th final:
# 2021-26 average); the 16th uses the 2026-27 budget estimate, the only figure yet.
POOLS = {
    "fc15_interim": (594997, "2020–21 actual devolution"),
    "fc15_final": ((898392 + 948407 + 1129494 + 1274121 + 1392971) / 5, "2021–26 average actual devolution"),
    "fc16": (1526255, "2026–27 budget estimate"),
}


def build_calc(res_root: Path, repo: Path, out: Path) -> None:
    """Export each award's prepared inputs for the browser port of scripts/fc/fc_core.py,
    plus test vectors computed by the Python original."""
    import random
    sys.path.insert(0, str(res_root / "scripts/fc"))
    from fc_core import Formula  # noqa: E402

    R = str(res_root / "research/fc")
    calc, vectors = {}, {}
    rng = random.Random(20261110)
    for w in ("fc15_final", "fc15_interim", "fc16"):
        f = Formula(R, w)
        d = dict(
            which=w, S=f.S, years=f.years, W=f.W, published=f.published, P11=f.P11, fixedC=f.fixedC,
            gsdp={s: {fy: f.gsdp[(s, fy)] for fy in f.years} for s in f.S},
            pop={s: {fy: f.pop[(s, fy)] for fy in f.years} for s in f.S},
            pool=POOLS[w][0], pool_note=POOLS[w][1],
        )
        if w != "fc16":
            d.update(tey=f.tey, pcotr=f.pcotr,
                     pc_printed={s: {fy: f.pc_printed[(s, fy)] for fy in f.tey if fy not in f.years} for s in f.S})
        calc[w] = d
        cases = [{"ratios": {}, "shares": f.shares()}]
        for _ in range(50):
            k = rng.choice([1, 2, 5, 15, len(f.S)])
            ratios = {}
            for s in rng.sample(f.S, k):
                for fy in f.years:
                    if rng.random() < 0.7:
                        ratios[f"{s}|{fy}"] = round(1 + rng.uniform(-0.15, 0.15), 6)
            ov = {tuple(key.split("|")): f.gsdp[tuple(key.split("|"))] * r for key, r in ratios.items()}
            cases.append({"ratios": ratios, "shares": f.shares(ov)})
        vectors[w] = cases
    (out / "calc.json").write_text(json.dumps(calc, separators=(",", ":"), allow_nan=False))
    tests = repo / "site/tests"
    tests.mkdir(exist_ok=True)
    (tests / "fc_vectors.json").write_text(json.dumps(vectors, separators=(",", ":"), allow_nan=False))


def main() -> None:
    repo = Path(sys.argv[1]).resolve()
    res_root = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else repo.parent
    out = repo / "site/data"  # also holds the Data and Methods pages, so nothing here is ever deleted wholesale
    out.mkdir(parents=True, exist_ok=True)

    allv, rel, states = load(repo)
    gk, gc = growth_table(allv, "constant"), growth_table(allv, "current")
    fl = first_latest(gk)
    summaries, releases_by_state = build_states(repo, out, allv, rel, states, gc, gk, fl)
    build_asof(out, gk, fl, releases_by_state)

    fys = sorted(fl.fy.unique().tolist())
    report = json.loads((repo / "database/build_report.json").read_text())
    site = dict(
        built=date.today().isoformat(),
        version="1.0.0",
        counts=dict(
            open_values=report["open_values"], state_values=report["state_values"],
            mospi_values=report["mospi_values"], state_docs=report["state_releases"],
            state_publishers=report["states_with_own_releases"], rbi_values=report["rbi_values"],
            rbi_editions=report["rbi_editions"], states=len(summaries),
            text=report["extraction"]["text"], ocr=report["extraction"]["ocr"],
            hand_checked=report["validation"]["hand_checked_ok"] + report["validation"]["hand_checked_corrected"],  # values a person checked against the page
        ),
        fiscal_years=fys,
        states=summaries,
        cells=[dict(s=r.state, fy=r.fy, f=r2(r.first), l=r2(r.latest), r=r2(r.revision), n=int(r.n),
                    fd=r.first_date, ld=r.latest_date, fs=r.first_src, ls=r.latest_src,
                    t=bool(r.first_tie or r.latest_tie))
               for r in fl.itertuples()],
    )
    (out / "site.json").write_text(json.dumps(site, ensure_ascii=False, separators=(",", ":"), allow_nan=False))

    build_results(res_root, out)
    build_calc(res_root, repo, out)
    # Apply the corrections of 12 Nov 2026 (decisions D42, D44, D45): unrounded Finance Commission shares,
    # the J&K borrowing-ceiling fix and the same-day release rule. See apply_corrections.py.
    import subprocess
    subprocess.run([sys.executable, "-I", str(Path(__file__).with_name("apply_corrections.py")), str(res_root)], check=True)

    # Downloads served next to the site.
    dl = repo / "site/downloads"
    if dl.exists():
        shutil.rmtree(dl)
    shutil.copytree(repo / "database/data", dl / "data")
    for name in ("codebook.md", "validation.md", "LICENSE-DATA.md", "CHANGELOG.md"):
        shutil.copy2(repo / "database" / name, dl / name)
    write_state_pages(repo, summaries)
    print(json.dumps(site["counts"]), len(fys), "fiscal years,", len(site["cells"]), "state-years")


if __name__ == "__main__":
    main()
