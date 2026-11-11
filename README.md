<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/lockup-dark.svg">
  <img src=".github/assets/lockup.svg" alt="ITIHAS" width="300">
</picture>

### Indian Time-series of Initial and Historical Accounts of States

**Every published estimate of Indian state GDP, kept with the date it became public.**

[![Version](https://img.shields.io/badge/version-1.0.0-1e3a8a?style=flat-square)](database/CHANGELOG.md) [![Data licence](https://img.shields.io/badge/data-CC%20BY%204.0-1e3a8a?style=flat-square)](database/LICENSE-DATA.md) [![Code licence](https://img.shields.io/badge/code-MIT-1e3a8a?style=flat-square)](LICENSE) [![DOI](https://img.shields.io/badge/DOI-to%20be%20assigned-9ca3af?style=flat-square)](#cite)

[Data](#whats-inside) · [Quick start](#quick-start) · [Access from code](#access-from-code) · [Cite](#cite) · [Licence](#licence) · [Codebook](database/codebook.md)

</div>

---

## About

Indian state GDP (GSDP) is first estimated within months of a fiscal year's end, then revised for years afterwards. Most datasets keep only the latest figure, so the earlier estimates disappear. ITIHAS keeps all of them.

Each row is **one number, from one document, on one date**. A revision becomes a new row instead of overwriting the old one. This lets you answer a question that other sources cannot: *what was known about a state's economy on a given day?*

This layout is called a real-time or "vintage" database. It is the same design as [ALFRED](https://alfred.stlouisfed.org/) and the Philadelphia Fed's [Real-Time Data Set for Macroeconomists](https://www.philadelphiafed.org/surveys-and-data/real-time-data-research/real-time-data-set-for-macroeconomists). To our knowledge, ITIHAS is the first such database for Indian state GDP.

<table>
<tr>
<td align="center"><b>45,766</b><br><sub>values</sub></td>
<td align="center"><b>254</b><br><sub>source documents</sub></td>
<td align="center"><b>18</b><br><sub>states with their own releases</sub></td>
<td align="center"><b>34</b><br><sub>states and union territories</sub></td>
<td align="center"><b>1990-91 to 2026-27</b><br><sub>fiscal years covered</sub></td>
</tr>
</table>

<sub>Totals combine the open data (5,365 values from 242 state documents and 2 MoSPI releases, fiscal years 2011-12 to 2026-27) and the RBI Handbook files (40,401 values from 10 editions, fiscal years 1990-91 to 2024-25).</sub>

## What a revision looks like

Karnataka's real GSDP (₹ crore, constant 2011-12 prices) as printed in four documents. Each column is a document and each row is a fiscal year:

| Fiscal year | Economic Survey<br><sub>5 Mar 2020</sub> | Economic Survey<br><sub>15 Mar 2021</sub> | Economic Survey<br><sub>5 Mar 2022</sub> | MoSPI<br><sub>17 Apr 2026</sub> |
|---|--:|--:|--:|--:|
| 2017-18 | 10,43,533 | 10,22,862 | 10,19,708 | 10,19,724 |
| 2018-19 | 11,24,423 | 10,89,271 | 10,82,614 | 10,85,101 |
| **2019-20** | **12,01,031** | **11,43,781** | **11,49,829** | **11,51,393** |

The first estimate of 2019-20 was 5.0% higher than the figure printed a year later. The paper's own results will be linked here when it is posted.

<sub>Source: `database/data/triangles/gsdp_constant/KA.csv`. The documents are listed in `database/data/releases.csv`.</sub>

## What's inside

```
database/
├── data/                         CC BY 4.0
│   ├── vintages_long.csv         every value: one row per number, per document
│   ├── releases.csv              every source document: publisher, dates, link, SHA-256
│   ├── states.csv                state and union-territory codes, boundary notes
│   └── triangles/                revision triangles, one file per state and price basis
├── rbi_handbook/                 © Reserve Bank of India (see NOTICE.md), not CC BY
│   ├── vintages_long_rbi.csv     10 editions of the Handbook of Statistics on Indian States
│   ├── releases_rbi.csv          one row per edition, with its reproduction notice
│   ├── source_files_rbi.csv      RBI's spreadsheets and their SHA-256
│   └── triangles/                revision triangles by edition
├── codebook.md                   every column, unit and convention
├── validation.md                 how values were checked, and what was corrected
├── CHANGELOG.md
├── LICENSE-DATA.md
└── scripts/build_release.py      rebuilds every file from the authors' working files
```

### Sources

| Source | Documents | Values | Notes |
|---|--:|--:|---|
| State Economic Surveys | 104 | 1,849 | The state government's annual survey, usually presented with the budget |
| State Directorates of Economics and Statistics | 90 | 1,485 | The official state income releases |
| State budget documents | 45 | 203 | Budget speeches and press notes, often the earliest figure |
| Other state publications | 3 | 48 | State government web pages and similar |
| MoSPI (eSankhyiki) | 2 | 1,780 | 8 Aug 2025 and 17 Apr 2026, all states and union territories |
| RBI *Handbook of Statistics on Indian States* | 10 | 40,401 | 2016–2025 editions; GSDP and sector GVA; base years 1980-81 to 2011-12 |

The 18 states with their own documents are Andhra Pradesh, Assam, Bihar, Chhattisgarh, Gujarat, Haryana, Himachal Pradesh, Jharkhand, Karnataka, Kerala, Maharashtra, Odisha, Punjab, Rajasthan, Tamil Nadu, Telangana, Uttarakhand and Uttar Pradesh. The central sources (MoSPI and RBI) cover the other states and union territories.

### How each number is recorded

- **Date:** the date the document was published and, where it differs, the date the estimate was first made public. The `date_rule` column records how each date was established.
- **Provenance:** the source document's link, its SHA-256 fingerprint, and the page or table the number came from.
- **As printed:** the value exactly as printed (Indian digit grouping kept) and converted to ₹ crore. Also the printed growth rate and label, such as `2023-24 (PE)`.
- **How it was read:** from the PDF's text layer (3,028 values), from a scanned page (557), or from an official spreadsheet.
- **Checks:** 2,298 of 2,302 printed growth rates match the growth computed from the printed levels to within 0.06 percentage points. The other 4 are discrepancies in the source documents. A hand check against source pages is recorded in `validation.md`.

## Quick start

To see what was known on a given date, keep the rows that were public by then and take the newest figure for each year:

```python
import pandas as pd

v = pd.read_csv("database/data/vintages_long.csv", low_memory=False)

def as_known_on(date, state, prices="constant"):
    """Each fiscal year's GSDP as it stood on `date`: the newest figure public by then."""
    known = v[(v.state_code == state) & (v.prices == prices) & (v.series == "gsdp")
              & v.value_rs_crore.notna() & (v.first_public_date <= date)]
    return (known.sort_values("first_public_date", kind="stable")
                 .groupby("fiscal_year").tail(1)
                 .set_index("fiscal_year")[["value_rs_crore", "release_id"]]
                 .sort_index())

as_known_on("2020-12-31", "KA")   # Karnataka, as known at the end of 2020
```

Three things to know:
- **Undated values** (44 values in 4 documents) never pass the date filter, so they are never picked as "known".
- **Same-day documents:** when a state published more than one document on the same day, their `release_id`s end in a letter (`KA-2026-03-06-a`, `-b`). A few of these pairs print different figures, so decide which one your question needs. The example above simply takes the later row in file order.
- **Projections:** some budget documents print figures for a year that has not started. `notes` marks them. Drop them if you want only estimates of past years.

## Access from code

The files are plain CSV, so any tool can read them directly from GitHub. Pin a version tag so your results don't change when the data are updated.

| | URL |
|---|---|
| Pinned (recommended) | `https://raw.githubusercontent.com/itihas-data/itihas/v1.0.0/database/data/vintages_long.csv` |
| Latest | `https://raw.githubusercontent.com/itihas-data/itihas/main/database/data/vintages_long.csv` |

Change the path to get any other file, for example `database/data/triangles/gsdp_constant/KA.csv`.

**Python**
```python
import pandas as pd
BASE = "https://raw.githubusercontent.com/itihas-data/itihas/v1.0.0/database/"
v = pd.read_csv(BASE + "data/vintages_long.csv", low_memory=False)
releases = pd.read_csv(BASE + "data/releases.csv")
```

**R**
```r
base <- "https://raw.githubusercontent.com/itihas-data/itihas/v1.0.0/database/"
v <- read.csv(paste0(base, "data/vintages_long.csv"))
ka <- subset(v, state_code == "KA" & prices == "constant" & series == "gsdp")
```

**Command line**
```bash
curl -LO https://raw.githubusercontent.com/itihas-data/itihas/v1.0.0/database/data/vintages_long.csv
```

**Zenodo:** each version is also archived on Zenodo with its own DOI. Zenodo's API lists the files of a version at `https://zenodo.org/api/records/<record-id>`.

## Cite

If you use ITIHAS, please cite the database:

> Jha, S. and Parekh, V. (2026). *ITIHAS: Indian Time-series of Initial and Historical Accounts of States* (version 1.0.0) [Data set]. Zenodo. https://doi.org/10.5281/zenodo.XXXXXXX

```bibtex
@misc{itihas2026,
  author       = {Jha, Shrihan and Parekh, Veer},
  title        = {{ITIHAS}: Indian Time-series of Initial and Historical Accounts of States},
  year         = {2026},
  version      = {1.0.0},
  publisher    = {Zenodo},
  doi          = {10.5281/zenodo.XXXXXXX},
  url          = {https://doi.org/10.5281/zenodo.XXXXXXX},
  howpublished = {Data set}
}
```

GitHub's **"Cite this repository"** button (in the sidebar) gives the same citation in APA and BibTeX, from [`CITATION.cff`](CITATION.cff).

- **When you use a specific number**, please also cite its source document, which is listed in `database/data/releases.csv`.
- **When you use the RBI Handbook files**, keep the Reserve Bank of India acknowledgement in [`database/rbi_handbook/NOTICE.md`](database/rbi_handbook/NOTICE.md).
- **The working paper** that introduces the database will be listed here once it is posted.

## Licence

| What | Where | Terms | What you need to do |
|---|---|---|---|
| The database | `database/data/` | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Cite ITIHAS. Credit the state governments and MoSPI as the original publishers. |
| RBI Handbook figures | `database/rbi_handbook/` | © Reserve Bank of India, reproduced with acknowledgement | Keep RBI's acknowledgement. These files are **not** CC BY. |
| Code | `database/scripts/` | [MIT](LICENSE) | Keep the copyright notice. |

ITIHAS is compiled by its authors. It is not an official statistic, and it is not endorsed by any state government, MoSPI, the Reserve Bank of India or the Government of India. It comes with no warranty: check important figures against the source document. The full terms are in [`database/LICENSE-DATA.md`](database/LICENSE-DATA.md).

## Corrections and updates

Found a wrong number, a missing document or a better date? Please [open an issue](https://github.com/itihas-data/itihas/issues) and include the state, the fiscal year, the document and the page. Corrections are recorded in [`CHANGELOG.md`](database/CHANGELOG.md) and released as new versions. Older versions stay available under their own tags and DOIs.

New versions are planned after each RBI Handbook edition (usually in December) and each MoSPI state release.

## Authors

**Shrihan Jha** and **Veer Parekh**.

<div align="center">
<sub>Data: CC BY 4.0 · Code: MIT · RBI Handbook figures © Reserve Bank of India</sub>
</div>
