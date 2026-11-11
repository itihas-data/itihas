# ITIHAS licence terms

ITIHAS contains material under three different sets of terms. Check which folder a file is in.

| Folder | Terms | You may | You must |
|---|---|---|---|
| `data/` | CC BY 4.0 | Copy, share and adapt it for any purpose, including commercial use | Cite ITIHAS, credit the original publishers, and say if you changed anything |
| `rbi_handbook/` | © Reserve Bank of India, reproduced with acknowledgement | Reproduce the figures | Acknowledge the Reserve Bank of India as the source. These files are **not** CC BY |
| `scripts/` (code) | MIT | Use, copy, change and distribute the code | Keep the copyright and licence notice |

---

## 1. `data/`: Creative Commons Attribution 4.0 International

The compilation in `data/` is © 2026 Shrihan Jha and Veer Parekh. It is licensed under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/legalcode

The compilation consists of the selection of documents, the dating of each estimate, the coding and structure of the records, the release list, the state codes and the revision triangles.

**Attribution.** Cite the database as shown in `README.md`. For example:

> Data: ITIHAS v1.0.0 (Jha and Parekh, 2026), CC BY 4.0. Original figures published by state governments and the Ministry of Statistics and Programme Implementation, Government of India.

**Original publishers.** The numbers themselves were published by others, and you should credit them too:
- **State governments**, through their Directorates of Economics and Statistics, Finance Departments and Planning Departments: in state income releases, Economic Surveys and budget documents. The source document of every number is listed in `data/releases.csv`. When you rely on a specific number, cite that document.
- **The Ministry of Statistics and Programme Implementation (MoSPI)**, through its eSankhyiki portal (https://esankhyiki.mospi.gov.in/), releases of 8 Aug 2025 and 17 Apr 2026.
  - MoSPI's copyright policy allows its data to be reproduced, redistributed and adapted, for commercial or non-commercial use, without prior permission, provided the source is prominently acknowledged. Acknowledge it as: *Source: Ministry of Statistics and Programme Implementation, Government of India.*
  - MoSPI's tables name the state Directorates of Economics and Statistics as the source of the state figures, so credit those as well.
  - **Changes made:** state names were coded and footnote lines were removed. The values are unchanged.

## 2. `rbi_handbook/`: Reserve Bank of India

The files in `rbi_handbook/` reproduce figures from the Reserve Bank of India's *Handbook of Statistics on Indian States*. Copyright remains with the Reserve Bank of India. **The CC BY licence above does not apply to them.**

Every edition from 2017 to 2025 permits reproduction provided the source is acknowledged. The acknowledgement, the basis for including the 2016 edition and what was done to the figures are set out in `rbi_handbook/NOTICE.md`. If the Reserve Bank of India asks, this material will be removed.

## 3. Code: MIT licence

The scripts in `scripts/` are licensed under the MIT licence. The licence text is in `LICENSE` at the root of the repository.

## 4. Disclaimers

- **Not official statistics.** ITIHAS is compiled by its authors. It is not an official publication of any state government, MoSPI, the Reserve Bank of India or the Government of India, and none of them has reviewed or endorsed it.
- **No warranty.** The data are provided "as is", without warranty of any kind, as set out in section 5 of CC BY 4.0. Values were extracted from source documents with care and checked as described in `validation.md`, but errors are possible. Check any figure that matters against its source document.
- **Corrections.** Report errors through the repository's issue tracker. Corrections are released as new versions, and earlier versions remain available.
