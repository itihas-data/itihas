# ITIHAS validation report (version 1.0.0)

How the 3,585 values taken from state documents were checked. The MoSPI and RBI values are read from the publishers' own spreadsheets (`extraction_method = xlsx`) and are not re-typed.

## 1. How the state values were read
- 3,028 values were read from the PDF text layer and 557 from scanned pages (by OCR or by eye).
- Every value carries its document, page, file fingerprint (SHA-256) and link (`data/releases.csv`).

## 2. Printed growth against printed levels
Where a document prints both the level for two consecutive years and the growth rate between them, the printed growth should equal the growth computed from the printed levels, up to rounding.
- 2,302 such pairs; 2,298 agree within 0.06 percentage points; all 2,302 agree within 0.5 points (largest gap 0.438 points).
- The 4 larger gaps were checked against the source pages and are in the sources themselves:
  - `AS-2026-02-17`, constant prices, 2022-23: The source prints 2,89,793 and 2,58,140 with growth 12.7% (12.26% from the printed levels): an inconsistency in the source.
  - `OD-2025-02-15`, constant prices, 2015-16: The source truncates growth to one decimal (7.967 printed as 7.9).
  - `OD-2025-02-15`, constant prices, 2018-19: The source truncates growth to one decimal (7.094 printed as 7.0).
  - `OD-2025-02-15`, constant prices, 2019-20: The source truncates growth to one decimal (2.765 printed as 2.7).

## 3. Hand check by the authors
The authors compared values with their source pages (page images shown beside each value; the sampling rules are decisions D36 and D37, reported in the paper's Appendix A).
- **31 values checked**, all drawn at random from the scanned values: 19 checked as drawn (19 matched), then every drawn value that OCR could not read exactly, 12 in all (11 matched).
- **1 error found:** a value left blank by OCR (Kerala, 2017-18, constant prices, release of 29 Feb 2024) although the page prints it.
- **Correction and follow-up:** the five blank cells in that table were filled from the page, and a search for the same kind of gap found 7 more levels left blank by OCR in two other Kerala releases (30 Sep 2020 and 10 Nov 2022). All 12 were filled from the pages; each reproduces the growth rate printed beside it, and each equals the same year in other Kerala releases.
- **The hand check is not a random sample of all scanned values** after the narrowing to the hard-to-read subset, so it does not give an error rate for all 557 scanned values. Clearly printed values rest on the checks in sections 1 and 2.
- In the data: `hand_checked_ok` 30, `hand_checked_corrected` 1, `corrected_from_page` 11, `not_hand_checked` 3,543.

## 4. Things to know
- **Growth-only rows:** 36 rows have a printed growth rate but no level, because the document (budget speeches, press notes) prints only a growth rate.
- **GSVA rather than GSDP:** 16 rows come from tables that print only total GSVA at basic prices; they are marked `series = gsva_total`.
- **Undated documents:** 4 documents (44 values) have no reliable release date; `release_date` is blank and `date_rule` explains why.
- **Same-day documents:** a state sometimes published two documents on the same day with different figures for the same year (for example, an Economic Survey and a budget press note). Both are kept, each under its own `release_id`.
- **Coverage gaps:** West Bengal and Madhya Pradesh have no state documents in this version (their websites could not be reached securely); both are covered by the MoSPI and RBI rows. Some other state-years have no early state estimate; see the paper's data section.
- **Blank cells dropped:** 2,124 empty cells in the RBI spreadsheets and 232 footnote lines in the MoSPI spreadsheets are not data and are not included.
