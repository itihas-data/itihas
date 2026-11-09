# ITIHAS codebook (version 1.0.0)

ITIHAS stores every published estimate of Indian state GDP (GSDP) as a separate row: one row per number, per document. Rows are never overwritten when a later document revises a number; the revision is a new row. This is the layout of real-time ("vintage") databases such as ALFRED and the Philadelphia Fed's Real-Time Data Set for Macroeconomists.

## Files

| File | Licence | Content |
|---|---|---|
| `data/vintages_long.csv` | CC BY 4.0 (see `LICENSE-DATA.md`) | 5,365 values: 3,585 from 242 documents published by 18 state governments, and 1,780 from two MoSPI eSankhyiki releases (all states and union territories) |
| `data/releases.csv` | CC BY 4.0 | One row per source document: title, publisher, dates, link, file fingerprint (SHA-256), pages used |
| `data/states.csv` | CC BY 4.0 | State and union territory codes, names and boundary notes |
| `data/triangles/gsdp_<prices>/<STATE>.csv` | CC BY 4.0 | Revision triangles built from `vintages_long.csv`: rows are fiscal years, columns are releases in date order, cells are GSDP in Rs crore (64 files) |
| `rbi_handbook/vintages_long_rbi.csv` | Reserve Bank of India; see `rbi_handbook/NOTICE.md` | 40,401 values from 10 editions of the RBI Handbook of Statistics on Indian States (2016 to 2025): GSDP and sector GVA, current and constant prices, base years 1980-81, 1993-94, 1999-00, 2004-05 and 2011-12, all states and union territories |
| `rbi_handbook/releases_rbi.csv`, `rbi_handbook/source_files_rbi.csv` | as above | One row per edition, with its reproduction notice; one row per spreadsheet with its SHA-256 |
| `rbi_handbook/triangles/<series>_<prices>_base<base>.csv` | as above | Revision triangles by edition (26 files) |
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
| `release_date` | Date the document was published. Blank for 44 values from 4 documents with no reliable date |
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
