<!--
  TOP SECTION: to be written by Shrihan Jha (what ITIHAS is and why it exists).
  Everything below the line is technical documentation.
-->

_[Top section to be written by the authors.]_

---

## How to cite

> Jha, S. and Parekh, V. (2026). *ITIHAS: Indian Time-series of Initial and Historical Accounts of States* (version 1.0.0) [Data set]. Zenodo. https://doi.org/10.5281/zenodo.XXXXXXX

BibTeX and the full citation guidance are in the [main README](../README.md#cite). The DOI will be filled in when version 1.0.0 is archived on Zenodo.

When you use a specific number, please also cite its source document, listed in `data/releases.csv`. The RBI Handbook figures need the acknowledgement in `rbi_handbook/NOTICE.md`.

## What is in it

| Folder | Content | Terms |
|---|---|---|
| `data/` | Every GSDP estimate printed in 242 documents from 18 state governments (2016–2026), and the two MoSPI eSankhyiki releases: one row per number, per document | CC BY 4.0 |
| `rbi_handbook/` | Every GSDP and sector GVA figure in 10 editions of the RBI Handbook of Statistics on Indian States (2016–2025), all states and union territories, base years 1980-81 to 2011-12 | © Reserve Bank of India, reproduced with acknowledgement |
| `codebook.md` | Every column, unit and convention | |
| `validation.md` | How the values were checked, and the results | |
| `scripts/build_release.py` | Rebuilds every data file from the authors' working files | MIT |

## Quick start

To see what was known about a state's GDP on a given date, keep the rows published on or before that date:

```python
import pandas as pd
v = pd.read_csv("data/vintages_long.csv")
known = v[(v.state_code == "KA") & (v.prices == "constant") & (v.series == "gsdp")
          & (v.release_date <= "2023-03-31")]
```

`data/triangles/` holds the same data reshaped as revision triangles: one file per state and price basis, with fiscal years down the side and releases across the top.

## Licence

See `LICENSE-DATA.md`.
