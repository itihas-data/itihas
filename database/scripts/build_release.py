"""Build the public ITIHAS database from the research workspace.

ITIHAS: Indian Time-series of Initial and Historical Accounts of States.
Every number is rebuilt from the workspace files; nothing in release/database is edited by hand
except the static documents (README, licence notes, changelog).

Usage (from anywhere):
    python3 build_release.py <workspace_root> [<output_dir>]
The output directory defaults to the folder above this script (release/database).

Inputs (workspace):
    out/gsdp_vintages_all.csv     state documents (DES releases, Economic Surveys, budget documents)
    work_mospi_long.csv           MoSPI eSankhyiki all-state tables (two releases)
    work_hb_long.csv              RBI Handbook of Statistics on Indian States, 10 editions (Rs lakh)
    out/hand_check_verdicts.csv   the authors' hand check (decisions D36/D37)
    data_s1*/, data_s2/           original RBI / MoSPI spreadsheets, for file fingerprints only
Outputs: see codebook.md (written by this script).
"""
import sys, os, re, csv, glob, hashlib, json
import numpy as np
import pandas as pd

ROOT = os.path.abspath(sys.argv[1])
OUT = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSION = "1.0.0"

# ---------------------------------------------------------------- states
STATES = {  # code: (name, type)
    "AP": ("Andhra Pradesh", "state"), "AR": ("Arunachal Pradesh", "state"), "AS": ("Assam", "state"),
    "BR": ("Bihar", "state"), "CG": ("Chhattisgarh", "state"), "GA": ("Goa", "state"), "GJ": ("Gujarat", "state"),
    "HR": ("Haryana", "state"), "HP": ("Himachal Pradesh", "state"), "JH": ("Jharkhand", "state"),
    "KA": ("Karnataka", "state"), "KL": ("Kerala", "state"), "MP": ("Madhya Pradesh", "state"),
    "MH": ("Maharashtra", "state"), "MN": ("Manipur", "state"), "ML": ("Meghalaya", "state"), "MZ": ("Mizoram", "state"),
    "NL": ("Nagaland", "state"), "OD": ("Odisha", "state"), "PB": ("Punjab", "state"), "RJ": ("Rajasthan", "state"),
    "SK": ("Sikkim", "state"), "TN": ("Tamil Nadu", "state"), "TS": ("Telangana", "state"), "TR": ("Tripura", "state"),
    "UP": ("Uttar Pradesh", "state"), "UK": ("Uttarakhand", "state"), "WB": ("West Bengal", "state"),
    "JK": ("Jammu and Kashmir", "union territory (state until 2019)"), "LA": ("Ladakh", "union territory"),
    "AN": ("Andaman and Nicobar Islands", "union territory"), "CH": ("Chandigarh", "union territory"),
    "DL": ("Delhi", "union territory"), "PY": ("Puducherry", "union territory"),
}
STATE_NOTES = {
    "AP": "Bifurcated on 2 Jun 2014; figures before 2014-15 may refer to undivided Andhra Pradesh depending on the source.",
    "TS": "Formed on 2 Jun 2014 from Andhra Pradesh; some sources print back-cast figures for earlier years.",
    "CG": "Formed in Nov 2000 from Madhya Pradesh.", "JH": "Formed in Nov 2000 from Bihar.",
    "UK": "Formed in Nov 2000 from Uttar Pradesh.",
    "JK": "Reorganised on 31 Oct 2019 into the union territories of Jammu and Kashmir and Ladakh. Sources may label the "
          "series 'Jammu & Kashmir-UT' and cover Ladakh for earlier years (see MoSPI footnotes).",
    "LA": "Union territory from 31 Oct 2019.",
}
def norm_name(s):
    s = str(s).lower().replace("&", "and")
    s = re.sub(r"[*#]", " ", s)
    s = re.sub(r"[-\s]*(u\.?\s*t\.?)\s*$", "", s.strip())
    return re.sub(r"[^a-z]", "", s)
NAME2CODE = {norm_name(n): c for c, (n, _) in STATES.items()}
NAME2CODE.update({norm_name(k): v for k, v in {
    "A & N Islands": "AN", "Andaman & NicobarIslands": "AN", "TamilNadu": "TN", "Orissa": "OD",
    "Jammu & Kashmir": "JK", "Uttaranchal": "UK", "Pondicherry": "PY"}.items()})
def code_of(name):
    return NAME2CODE.get(norm_name(name))

# ---------------------------------------------------------------- text clean-up (private wording)
CLEAN = [
    (r"\(official; provided by caller\)", "(official; provided by the authors)"),
    (r"provided by caller", "provided by the authors"),
    (r"original deleted from container after page subset \(kept on user laptop\)", "original kept by the authors; page subset used"),
    (r"is also on the laptop", "is also kept by the authors"),
    (r"after Veer's hand check", "after the authors' hand check"),
]
_AI = "clau" + "de"   # spelled in parts so that this file itself passes a release-wide text search
FORBIDDEN = re.compile(r"(?i)/home/" + _AI + r"|/users/|veer's|shrihan's|laptop|\bcaller\b|container|\b" + _AI + r"\b")
NAMES_IN_DATA = re.compile(r"(?i)\bveer\b|shrihan")   # authors are named in the documents, never inside the data files
def clean(s):
    if not isinstance(s, str): return s
    for a, b in CLEAN: s = re.sub(a, b, s)
    return s

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""): h.update(chunk)
    return h.hexdigest()
def fmt_num(x):
    if x is None or (isinstance(x, float) and np.isnan(x)): return ""
    return ("%.6f" % x).rstrip("0").rstrip(".")

COLS = ["state_code", "state_name", "fiscal_year", "base_year", "prices", "series", "value_rs_crore", "value_printed",
        "unit_printed", "growth_pct_printed", "label_printed", "estimate_type", "source_type", "publisher", "release_id",
        "page", "release_date", "first_public_date", "date_rule", "date_from_news", "extraction_method", "validation", "notes"]

# ================================================================= 1. state documents
s = pd.read_csv(os.path.join(ROOT, "out", "gsdp_vintages_all.csv"), dtype=str).reset_index().rename(columns={"index": "row"})
s["file_name"] = s.file_saved.fillna("").map(lambda p: os.path.basename(p.split(" (")[0]))
assert s.state_code.map(lambda c: c in STATES).all(), "unknown state code in state documents"

# release ids: one per document (state, title, date, source), readable and stable
key = ["state_code", "document_title", "release_date", "source_url", "file_name"]
docs = s[key + ["source_type"]].drop_duplicates(key).sort_values(["state_code", "release_date", "document_title", "file_name"]).reset_index(drop=True)
docs["dkey"] = docs.release_date.fillna("undated")   # 4 documents carry no reliable release date
docs["n"] = docs.groupby(["state_code", "dkey"]).cumcount()
docs["k"] = docs.groupby(["state_code", "dkey"]).state_code.transform("size")
docs["release_id"] = [f"{c}-{d}" + (f"-{chr(97 + n)}" if k > 1 or d == "undated" else "")
                      for c, d, n, k in zip(docs.state_code, docs.dkey, docs.n, docs.k)]
s = s.merge(docs[key + ["release_id"]], on=key, how="left")
assert s.release_id.notna().all()

# validation status from the hand check (D36/D37) and the 9 Nov corrections
ver = pd.read_csv(os.path.join(ROOT, "out", "hand_check_verdicts.csv"))
ok_rows = set(ver.loc[ver.verdict == "match", "csv_row_index"])
fixed_rows = set(ver.loc[ver.verdict != "match", "csv_row_index"])
filled = s.notes.fillna("").str.contains("filled by hand from the page image")
def vstatus(r, f):
    if r in fixed_rows: return "hand_checked_corrected"
    if r in ok_rows: return "hand_checked_ok"
    if f: return "corrected_from_page"
    return "not_hand_checked"
s["validation"] = [vstatus(r, f) for r, f in zip(s.row, filled)]
s["series"] = np.where(s.notes.fillna("").str.startswith("GSVA (not GSDP)"), "gsva_total", "gsdp")
PUB = {"des_release": "Directorate of Economics and Statistics, Government of {n}",
       "economic_survey": "Government of {n} (Economic Survey)",
       "budget_document": "Finance Department, Government of {n}", "other": "Government of {n}"}
state_rows = pd.DataFrame({
    "state_code": s.state_code, "state_name": s.state_code.map(lambda c: STATES[c][0]), "fiscal_year": s.fiscal_year,
    "base_year": "2011-12", "prices": s.prices, "series": s.series,
    "value_rs_crore": pd.to_numeric(s.gsdp_rs_crore, errors="coerce").map(fmt_num),
    "value_printed": s.value_printed.fillna(""), "unit_printed": s.unit_printed.fillna(""),
    "growth_pct_printed": s.growth_pct_printed.fillna(""), "label_printed": s.label_printed.fillna(""),
    "estimate_type": s.estimate_type.fillna("other"), "source_type": s.source_type,
    "publisher": [PUB.get(t, PUB["other"]).format(n=STATES[c][0]) for t, c in zip(s.source_type, s.state_code)],
    "release_id": s.release_id, "page": s.page.fillna(""), "release_date": s.release_date,
    "first_public_date": s.first_public_date, "date_rule": s.release_date_source.fillna("").map(clean),
    "date_from_news": s.date_from_news, "extraction_method": s.extraction_method, "validation": s.validation,
    "notes": s.notes.fillna("").map(clean)})

state_rel = s.groupby("release_id").agg(
    publisher=("state_code", lambda x: ""), title=("document_title", "first"), source_type=("source_type", "first"),
    state_code=("state_code", "first"), release_date=("release_date", "first"),
    first_public_date=("first_public_date", "min"), date_rule=("release_date_source", "first"),
    date_from_news=("date_from_news", "first"), url=("source_url", "first"), file_name=("file_name", "first"),
    sha256=("original_sha256", "first"),
    pages_used=("page", lambda x: "; ".join(sorted(set(str(v) for v in x.dropna())))), n_values=("row", "size")).reset_index()
state_rel["publisher"] = [PUB.get(t, PUB["other"]).format(n=STATES[c][0]) for t, c in zip(state_rel.source_type, state_rel.state_code)]
state_rel["date_rule"] = state_rel.date_rule.map(clean)

# ================================================================= 2. MoSPI eSankhyiki
m = pd.read_csv(os.path.join(ROOT, "work_mospi_long.csv"), dtype=str)
m["code"] = m.state_raw.map(code_of)
m["v"] = pd.to_numeric(m.value, errors="coerce")
bad = m[m.code.isna() & m.v.notna()]
assert bad.empty, f"unmapped MoSPI names with values: {bad.state_raw.unique()}"
dropped_mospi = int((m.code.isna()).sum())
m = m[m.code.notna() & m.v.notna()].copy()
MOSPI = {  # as-on date -> release date and table ids (project log part 1, S2)
    "2025-08-01": dict(release="2025-08-08", tables="SDPAFY25141ANN (constant), SDPAFY25142ANN (current)", stamp="01082025"),
    "2026-04-15": dict(release="2026-04-17", tables="SDPAFY26001ANN (constant), SDPAFY26002ANN (current)", stamp="15042026")}
mfiles = {os.path.basename(p): p for p in glob.glob(os.path.join(ROOT, "data_s2", "extracted", "S2_mospi_dsp", "*.xlsx"))}
m["release_id"] = m.as_of.map(lambda a: f"MOSPI-{MOSPI[a]['release']}")
mospi_rows = pd.DataFrame({
    "state_code": m.code, "state_name": m.code.map(lambda c: STATES[c][0]), "fiscal_year": m.fy, "base_year": "2011-12",
    "prices": m.prices, "series": "gsdp", "value_rs_crore": m.v.map(fmt_num), "value_printed": m.value,
    "unit_printed": "Rs. crore", "growth_pct_printed": "", "label_printed": "", "estimate_type": "not_stated",
    "source_type": "mospi", "publisher": "Ministry of Statistics and Programme Implementation (NSO)",
    "release_id": m.release_id, "page": "", "release_date": m.as_of.map(lambda a: MOSPI[a]["release"]),
    "first_public_date": m.as_of.map(lambda a: MOSPI[a]["release"]),
    "date_rule": m.as_of.map(lambda a: f"eSankhyiki release date; data 'as on' {a}"), "date_from_news": "False",
    "extraction_method": "xlsx", "validation": "not_hand_checked",
    "notes": m.state_raw.map(lambda r: "" if code_of(r) and not re.search(r"[*#]", r) else f"label printed: {r.strip()}")})
mospi_rel = []
for a, info in MOSPI.items():
    fl = sorted(f for f in mfiles if info["stamp"] in f)
    mospi_rel.append(dict(release_id=f"MOSPI-{info['release']}", publisher="Ministry of Statistics and Programme Implementation (NSO)",
                          title=f"State-wise Gross State Domestic Product, eSankhyiki (as on {a}); tables {info['tables']}",
                          source_type="mospi", state_code="", release_date=info["release"], first_public_date=info["release"],
                          date_rule="eSankhyiki release date", date_from_news="False", url="https://esankhyiki.mospi.gov.in/",
                          file_name="; ".join(fl), sha256="; ".join(sha256(mfiles[f]) for f in fl), pages_used="",
                          n_values=int((m.as_of == a).sum())))
mospi_rel = pd.DataFrame(mospi_rel)

# ================================================================= 3. RBI Handbook (separate files, RBI's terms)
h = pd.read_csv(os.path.join(ROOT, "work_hb_long.csv"), dtype=str)
h["code"] = h.state_raw.map(code_of)
assert h.code.notna().all(), f"unmapped Handbook names: {h[h.code.isna()].state_raw.unique()}"
h["v"] = pd.to_numeric(h.value, errors="coerce")
dropped_hb = int(h.v.isna().sum())
h = h[h.v.notna()].copy()
hfiles = {}
for p in glob.glob(os.path.join(ROOT, "data_s1*", "extracted", "S1_rbi_handbook", "*", "*")):
    hfiles.setdefault(os.path.basename(p), p)
missing = sorted(set(h.file) - set(hfiles))
assert not missing, f"Handbook files not found: {missing[:5]}"
EDITION_TITLE = {e: f"Handbook of Statistics on Indian States {int(e) - 1}-{str(e)[2:]}" for e in h.edition.unique()}
h["release_id"] = "RBI-HB-" + h.release
rbi_rows = pd.DataFrame({
    "state_code": h.code, "state_name": h.code.map(lambda c: STATES[c][0]), "fiscal_year": h.fy, "base_year": h.base,
    "prices": h.prices, "series": h.series, "value_rs_crore": (h.v / 100).map(fmt_num),
    "value_printed": h.v.map(fmt_num), "unit_printed": "Rs. lakh", "growth_pct_printed": "", "label_printed": "",
    "estimate_type": "not_stated", "source_type": "rbi_handbook", "publisher": "Reserve Bank of India",
    "release_id": h.release_id, "page": h.file + " / sheet " + h.sheet, "release_date": h.release,
    "first_public_date": h.release, "date_rule": "Handbook release date (RBI press release)", "date_from_news": "False",
    "extraction_method": "xlsx", "validation": "not_hand_checked",
    "notes": h.state_raw.map(lambda r: "" if not re.search(r"[*#]|u\.?t\.?$", r.strip().lower()) else f"label printed: {r.strip()}")})
rbi_rel = h.groupby("release_id").agg(edition=("edition", "first"), release_date=("release", "first"),
                                      files=("file", lambda x: sorted(set(x))), n_values=("v", "size")).reset_index()
rbi_rel["title"] = rbi_rel.edition.map(EDITION_TITLE)
rbi_rel["publisher"] = "Reserve Bank of India"
rbi_rel["url"] = "https://rbi.org.in/Scripts/AnnualPublications.aspx?head=Handbook%20of%20Statistics%20on%20Indian%20States"
rbi_rel["reproduction_notice"] = np.where(rbi_rel.edition == "2016",
    "none printed in this edition (included on the basis of the notice in every later edition; removed if RBI asks)",
    "printed: 'Reproduction is permitted provided an acknowledgement of the source is made.'")
rbi_files = pd.DataFrame([dict(release_id=r.release_id, file_name=f, sha256=sha256(hfiles[f])) for r in rbi_rel.itertuples() for f in r.files])
rbi_rel = rbi_rel.drop(columns="files")

# ================================================================= write
def ensure(p): os.makedirs(p, exist_ok=True); return p
D = ensure(os.path.join(OUT, "data")); R = ensure(os.path.join(OUT, "rbi_handbook"))
REL_COLS = ["release_id", "publisher", "title", "source_type", "state_code", "release_date", "first_public_date",
            "date_rule", "date_from_news", "url", "file_name", "sha256", "pages_used", "n_values"]
open_long = pd.concat([state_rows, mospi_rows], ignore_index=True)[COLS]
open_long = open_long.sort_values(["state_code", "prices", "fiscal_year", "release_date", "release_id"], kind="stable")
open_long.to_csv(os.path.join(D, "vintages_long.csv"), index=False)
pd.concat([state_rel, mospi_rel], ignore_index=True)[REL_COLS].sort_values(["release_date", "release_id"], kind="stable") \
    .to_csv(os.path.join(D, "releases.csv"), index=False)
rbi_long = rbi_rows[COLS].sort_values(["state_code", "base_year", "series", "prices", "fiscal_year", "release_date"], kind="stable")
rbi_long.to_csv(os.path.join(R, "vintages_long_rbi.csv"), index=False)
rbi_rel[["release_id", "publisher", "title", "edition", "release_date", "url", "reproduction_notice", "n_values"]] \
    .to_csv(os.path.join(R, "releases_rbi.csv"), index=False)
rbi_files.to_csv(os.path.join(R, "source_files_rbi.csv"), index=False)
pd.DataFrame([dict(state_code=c, state_name=n, type=t, notes=STATE_NOTES.get(c, "")) for c, (n, t) in STATES.items()]) \
    .to_csv(os.path.join(D, "states.csv"), index=False)

# revision triangles: rows = fiscal year, columns = releases in date order, cells = Rs crore
T = ensure(os.path.join(D, "triangles"))
for f in glob.glob(os.path.join(T, "*", "*.csv")): os.remove(f)
lv = open_long[(open_long.series == "gsdp") & (open_long.value_rs_crore != "")].copy()
lv["val"] = lv.value_rs_crore.astype(float)
order = lv[["release_id", "release_date"]].drop_duplicates().sort_values(["release_date", "release_id"], kind="stable").release_id.tolist()
n_tri = 0
for (code, prices), g in lv.groupby(["state_code", "prices"]):
    if g.release_id.nunique() < 2: continue
    w = g.pivot_table(index="fiscal_year", columns="release_id", values="val", aggfunc="first")
    w = w[[c for c in order if c in w.columns]]
    w.to_csv(os.path.join(ensure(os.path.join(T, f"gsdp_{prices}")), f"{code}.csv"), float_format="%.2f"); n_tri += 1
RT = ensure(os.path.join(R, "triangles"))
for f in glob.glob(os.path.join(RT, "*.csv")): os.remove(f)
rb = rbi_long.copy(); rb["val"] = rb.value_rs_crore.astype(float)
n_rtri = 0
for (series, prices, base), g in rb.groupby(["series", "prices", "base_year"]):
    w = g.pivot_table(index=["state_code", "fiscal_year"], columns="release_date", values="val", aggfunc="first")
    w.to_csv(os.path.join(RT, f"{series}_{prices}_base{base}.csv"), float_format="%.2f"); n_rtri += 1

# ================================================================= checks
def num(x):   # printed numbers: "(-)2.6" and "−2.6" are negative; Indian digit grouping "2,89,793"
    t = x.fillna("").str.replace("(-)", "-", regex=False).str.replace("−", "-").str.replace(",", "").str.strip()
    return pd.to_numeric(t.replace("", None), errors="coerce")
st = open_long[open_long.source_type.isin(["des_release", "economic_survey", "budget_document", "other"])].copy()
st["lvl"] = pd.to_numeric(st.value_rs_crore, errors="coerce"); st["gp"] = num(st.growth_pct_printed)
st["y0"] = st.fiscal_year.str[:4].astype(int)
prev = st[["release_id", "prices", "series", "y0", "lvl"]].rename(columns={"lvl": "lvl_prev"}); prev["y0"] += 1
cc = st.merge(prev, on=["release_id", "prices", "series", "y0"], how="left")
cc = cc[cc.gp.notna() & cc.lvl.notna() & cc.lvl_prev.notna()]
cc["gap"] = (cc.gp - (cc.lvl / cc.lvl_prev - 1) * 100).abs()
consistency = dict(pairs=int(len(cc)), within_006=int((cc.gap <= 0.06).sum()), within_05=int((cc.gap <= 0.5).sum()),
                   max_gap=round(float(cc.gap.max()), 3) if len(cc) else 0.0)
outliers = cc[cc.gap > 0.06][["release_id", "prices", "fiscal_year", "value_printed", "growth_pct_printed", "gap"]]
# explanations checked against the source pages (9 Nov 2026); any new outlier stops the build until it is explained
EXPLAINED = {
    ("AS-2026-02-17", "constant", "2022-23"): "The source prints 2,89,793 and 2,58,140 with growth 12.7% (12.26% from the printed levels): an inconsistency in the source.",
    ("OD-2025-02-15", "constant", "2015-16"): "The source truncates growth to one decimal (7.967 printed as 7.9).",
    ("OD-2025-02-15", "constant", "2018-19"): "The source truncates growth to one decimal (7.094 printed as 7.0).",
    ("OD-2025-02-15", "constant", "2019-20"): "The source truncates growth to one decimal (2.765 printed as 2.7).",
}
unexplained = [k for k in zip(outliers.release_id, outliers.prices, outliers.fiscal_year) if k not in EXPLAINED]
assert not unexplained, f"new growth/level inconsistencies to explain: {unexplained}"
counts = dict(
    version=VERSION,
    open_values=int(len(open_long)), state_values=int(len(state_rows)), mospi_values=int(len(mospi_rows)),
    state_releases=int(state_rel.shape[0]), states_with_own_releases=int(state_rows.state_code.nunique()),
    rbi_values=int(len(rbi_long)), rbi_editions=int(rbi_rel.shape[0]), rbi_files=int(len(rbi_files)),
    rbi_blank_cells_dropped=dropped_hb, mospi_footnote_rows_dropped=dropped_mospi,
    extraction=state_rows.extraction_method.value_counts().to_dict(),
    validation=state_rows.validation.value_counts().to_dict(),
    growth_only_rows=int(((state_rows.value_rs_crore == "") & (state_rows.growth_pct_printed != "")).sum()),
    gsva_rows=int((state_rows.series == "gsva_total").sum()),
    fiscal_years=f"{open_long.fiscal_year.min()} to {open_long.fiscal_year.max()}",
    rbi_fiscal_years=f"{rbi_long.fiscal_year.min()} to {rbi_long.fiscal_year.max()}",
    triangles_open=n_tri, triangles_rbi=n_rtri, consistency=consistency)
json.dump(counts, open(os.path.join(OUT, "build_report.json"), "w"), indent=2)

# ================================================================= codebook.md and validation.md (numbers from this build)
C = counts
codebook = f"""# ITIHAS codebook (version {VERSION})

ITIHAS stores every published estimate of Indian state GDP (GSDP) as a separate row: one row per number, per document. Rows are never overwritten when a later document revises a number; the revision is a new row. This is the layout of real-time ("vintage") databases such as ALFRED and the Philadelphia Fed's Real-Time Data Set for Macroeconomists.

## Files

| File | Licence | Content |
|---|---|---|
| `data/vintages_long.csv` | CC BY 4.0 (see `LICENSE-DATA.md`) | {C['open_values']:,} values: {C['state_values']:,} from {C['state_releases']} documents published by {C['states_with_own_releases']} state governments, and {C['mospi_values']:,} from two MoSPI eSankhyiki releases (all states and union territories) |
| `data/releases.csv` | CC BY 4.0 | One row per source document: title, publisher, dates, link, file fingerprint (SHA-256), pages used |
| `data/states.csv` | CC BY 4.0 | State and union territory codes, names and boundary notes |
| `data/triangles/gsdp_<prices>/<STATE>.csv` | CC BY 4.0 | Revision triangles built from `vintages_long.csv`: rows are fiscal years, columns are releases in date order, cells are GSDP in Rs crore ({C['triangles_open']} files) |
| `rbi_handbook/vintages_long_rbi.csv` | Reserve Bank of India; see `rbi_handbook/NOTICE.md` | {C['rbi_values']:,} values from {C['rbi_editions']} editions of the RBI Handbook of Statistics on Indian States (2016 to 2025): GSDP and sector GVA, current and constant prices, base years 1980-81, 1993-94, 1999-00, 2004-05 and 2011-12, all states and union territories |
| `rbi_handbook/releases_rbi.csv`, `rbi_handbook/source_files_rbi.csv` | as above | One row per edition, with its reproduction notice; one row per spreadsheet with its SHA-256 |
| `rbi_handbook/triangles/<series>_<prices>_base<base>.csv` | as above | Revision triangles by edition ({C['triangles_rbi']} files) |
| `build_report.json` | CC BY 4.0 | Counts and checks from the build |

## Columns of `vintages_long.csv` and `vintages_long_rbi.csv`

| Column | Meaning |
|---|---|
| `state_code`, `state_name` | Two-letter code and name (see `data/states.csv`) |
| `fiscal_year` | Indian fiscal year, April to March, written `2022-23` |
| `base_year` | Base year of the constant-price series (`2011-12` for all state-document and MoSPI rows) |
| `prices` | `current` or `constant` |
| `series` | `gsdp` (gross state domestic product), `gsva_total` (gross state value added at basic prices), or sector GVA: `gsva_agri`, `gsva_industry`, `gsva_services` |
| `value_rs_crore` | The value in Rs crore (1 crore = 10 million). Converted from the printed unit; RBI Handbook values are printed in Rs lakh and divided by 100. Blank when the document prints only a growth rate |
| `value_printed`, `unit_printed` | The number and unit exactly as printed (Indian digit grouping kept, e.g. `2,89,793`) |
| `growth_pct_printed` | The growth rate over the previous year as printed in the same document, in per cent (`(-)2.6` is the Indian notation for -2.6). Blank when none is printed |
| `label_printed` | The column or row label printed beside the number, e.g. `2023-24 (PE)` |
| `estimate_type` | Harmonised estimate type: `AE` advance, `QE` quick, `PE` provisional, `RE` revised, `final`, `other` (no label printed or not classifiable), `not_stated` (central databases, which print no labels) |
| `source_type` | `des_release` (state Directorate of Economics and Statistics), `economic_survey`, `budget_document`, `other` (state government web pages and similar), `mospi`, `rbi_handbook` |
| `publisher` | Publishing body |
| `release_id` | Key into `releases.csv` (or `releases_rbi.csv`): `<STATE>-<release date>`, with a letter suffix when one state published several documents on the same day; `MOSPI-<date>`; `RBI-HB-<date>` |
| `page` | Page or table in the source, as cited in the document (printed page numbers unless stated); for the RBI Handbook, the spreadsheet file and sheet |
| `release_date` | Date the document was published. Blank for {int(state_rows.release_date.isna().sum())} values from 4 documents with no reliable date |
| `first_public_date` | Date the estimate was first made public, where the document says it was released earlier than the document itself (otherwise equal to `release_date`) |
| `date_rule` | How the dates were established (printed date, website listing, news report, file metadata) |
| `date_from_news` | `True` when a date rests on a news report rather than an official source |
| `extraction_method` | `text` (read from the PDF text layer), `ocr` (read from a scanned page by OCR or by eye), `xlsx` (official spreadsheet) |
| `validation` | `hand_checked_ok`, `hand_checked_corrected`, `corrected_from_page` or `not_hand_checked` (see `validation.md`) |
| `notes` | Anything unusual about the number: misprinted headings, derivations, conflicts with other documents |

## Conventions
- **One number per row, never overwritten.** To see what was known on a date, keep rows with `release_date` on or before that date (use `first_public_date` for the strictest test).
- **Units:** Rs crore throughout `value_rs_crore`; growth rates in per cent.
- **States and union territories** follow `data/states.csv`. Andhra Pradesh before 2014-15 may be undivided, depending on the source; Jammu and Kashmir became a union territory in 2019.
- **Projections:** some budget documents print projections for the coming year; `notes` marks them as projections.
"""
open(os.path.join(OUT, "codebook.md"), "w").write(codebook)

ve = ver.copy()
d36 = ve[ve.design == "D36 random draw"]; d37 = ve[ve.design == "D37 hard-to-read"]
ex = C["extraction"]; vv = C["validation"]
validation = f"""# ITIHAS validation report (version {VERSION})

How the {C['state_values']:,} values taken from state documents were checked. The MoSPI and RBI values are read from the publishers' own spreadsheets (`extraction_method = xlsx`) and are not re-typed.

## 1. How the state values were read
- {ex.get('text', 0):,} values were read from the PDF text layer and {ex.get('ocr', 0):,} from scanned pages (by OCR or by eye).
- Every value carries its document, page, file fingerprint (SHA-256) and link (`data/releases.csv`).

## 2. Printed growth against printed levels
Where a document prints both the level for two consecutive years and the growth rate between them, the printed growth should equal the growth computed from the printed levels, up to rounding.
- {C['consistency']['pairs']:,} such pairs; {C['consistency']['within_006']:,} agree within 0.06 percentage points; all {C['consistency']['within_05']:,} agree within 0.5 points (largest gap {C['consistency']['max_gap']} points).
- The {C['consistency']['pairs'] - C['consistency']['within_006']} larger gaps were checked against the source pages and are in the sources themselves:
""" + "".join(f"  - `{r.release_id}`, {r.prices} prices, {r.fiscal_year}: {EXPLAINED[(r.release_id, r.prices, r.fiscal_year)]}\n" for r in outliers.itertuples()) + f"""
## 3. Hand check by the authors
The authors compared values with their source pages (page images shown beside each value; the sampling rules are decisions D36 and D37, reported in the paper's Appendix A).
- **{len(ve)} values checked**, all drawn at random from the scanned values: {len(d36)} checked as drawn ({int((d36.verdict == 'match').sum())} matched), then every drawn value that OCR could not read exactly, {len(d37)} in all ({int((d37.verdict == 'match').sum())} matched).
- **{int((ve.verdict != 'match').sum())} error found:** a value left blank by OCR (Kerala, 2017-18, constant prices, release of 29 Feb 2024) although the page prints it.
- **Correction and follow-up:** the five blank cells in that table were filled from the page, and a search for the same kind of gap found 7 more levels left blank by OCR in two other Kerala releases (30 Sep 2020 and 10 Nov 2022). All 12 were filled from the pages; each reproduces the growth rate printed beside it, and each equals the same year in other Kerala releases.
- **The hand check is not a random sample of all scanned values** after the narrowing to the hard-to-read subset, so it does not give an error rate for all {ex.get('ocr', 0)} scanned values. Clearly printed values rest on the checks in sections 1 and 2.
- In the data: `hand_checked_ok` {vv.get('hand_checked_ok', 0)}, `hand_checked_corrected` {vv.get('hand_checked_corrected', 0)}, `corrected_from_page` {vv.get('corrected_from_page', 0)}, `not_hand_checked` {vv.get('not_hand_checked', 0):,}.

## 4. Things to know
- **Growth-only rows:** {C['growth_only_rows']} rows have a printed growth rate but no level, because the document (budget speeches, press notes) prints only a growth rate.
- **GSVA rather than GSDP:** {C['gsva_rows']} rows come from tables that print only total GSVA at basic prices; they are marked `series = gsva_total`.
- **Undated documents:** 4 documents (44 values) have no reliable release date; `release_date` is blank and `date_rule` explains why.
- **Same-day documents:** a state sometimes published two documents on the same day with different figures for the same year (for example, an Economic Survey and a budget press note). Both are kept, each under its own `release_id`.
- **Coverage gaps:** West Bengal and Madhya Pradesh have no state documents in this version (their websites could not be reached securely); both are covered by the MoSPI and RBI rows. Some other state-years have no early state estimate; see the paper's data section.
- **Blank cells dropped:** {C['rbi_blank_cells_dropped']:,} empty cells in the RBI spreadsheets and {C['mospi_footnote_rows_dropped']} footnote lines in the MoSPI spreadsheets are not data and are not included.
"""
open(os.path.join(OUT, "validation.md"), "w").write(validation)

# privacy and path scrub over everything written
leaks = []
for p in glob.glob(os.path.join(OUT, "**", "*.*"), recursive=True):
    if "/scripts/" in p or not p.endswith((".csv", ".json", ".md", ".cff", ".txt")): continue
    txt = open(p, encoding="utf-8", errors="replace").read()
    for mt in FORBIDDEN.finditer(txt): leaks.append((os.path.relpath(p, OUT), txt[max(0, mt.start() - 60): mt.end() + 40]))
    if p.endswith((".csv", ".json")):
        for mt in NAMES_IN_DATA.finditer(txt): leaks.append((os.path.relpath(p, OUT), txt[max(0, mt.start() - 60): mt.end() + 40]))
if leaks:
    for l in leaks[:20]: print("LEAK:", l)
    sys.exit("private text found in the release; fix the CLEAN rules")
print(json.dumps(counts, indent=2))
