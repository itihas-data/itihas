# ITIHAS website

A static site: plain HTML, CSS and JavaScript modules, with D3 7.9.0 for the charts and the map. No framework and no build step for the pages. It replaced the first website (`viewer/`), which was retired on 10 Nov 2026.

## Pages

| URL | File | Script |
|---|---|---|
| `/` | `index.html` | `assets/js/pages/home.js` |
| `/states/` | `states/index.html` | `pages/states.js` |
| `/states/<slug>/` (34) | written by the generator from `states/_template.html` | `pages/state.js` |
| `/findings/` and its three pages | `findings/…/index.html` | `pages/findings.js`, `two-year.js`, `league.js`, `money.js` |
| `/calculator/` | `calculator/index.html` | `pages/calculator.js`, `assets/js/fc.js` |
| `/data/`, `/data/methods/` | `data/index.html`, `data/methods/index.html` | `pages/data.js`, `pages/methods.js` |
| `/paper/`, `/about/`, `404.html` | | |

Shared code: `assets/js/core.js` (header, footer, search, theme, formatting, tables), `charts.js` (chart primitives), `map.js` (the map of India), `scrub.js` (the "as known on" control). Shared styles: `assets/css/tokens.css` (the design system's tokens, unchanged) and `site.css`.

## Data

Everything the pages read is in `data/` and `downloads/`, and is written by the generator:

```
python -I site/scripts/build_site_data.py <repo_root> [<results_root>]
```

`<repo_root>` holds `database/` and `site/`; `<results_root>` holds the paper's analysis outputs and defaults to the folder above. The generator writes the JSON into `data/`, copies the downloads from `database/`, writes the calculator's test vectors into `tests/`, and rewrites the 34 state pages from `states/_template.html`. `data/index.html` and `data/methods/` are pages, not data, and are left alone.

Files: `site.json` (states, counts, first and latest growth per state-year), `asof.json` (every dated growth estimate, for the map and the publication record), `states/<CODE>.json`, `two_year.json`, `money.json`, `calc.json`.

The pages draw the figures in these files. They compute nothing new from them apart from the calculator and ranks within a year.

## The map

`geo/india.json` holds 36 simplified state and union-territory outlines, prepared once by `scripts/prepare_map.mjs` (the source, its checksum and the exact commands are in that file's header). Source: DataMeet India community, CC BY 4.0. The map draws India only, with the outer boundary as one continuous line. It is not certified by Survey of India; the authors should compare it with Survey of India's Political Map of India before the site is published.

## Checks

```
node site/tests/fc.test.mjs        # calculator maths against the Python original (162 checks)
```

`assets/js/fc.js` is a line-for-line port of `scripts/fc/fc_core.py`; the test compares the two on the test vectors the generator writes.

To preview locally, serve this folder with any static file server.

## Third-party material

- D3 7.9.0 (ISC): `assets/vendor/`
- Onest, Instrument Serif, IBM Plex Mono (SIL Open Font Licence 1.1): `assets/fonts/`
- Icons: Lucide (ISC), inlined in `core.js`
- State boundaries: DataMeet India community (CC BY 4.0)
- RBI Handbook figures: © Reserve Bank of India, reproduced with acknowledgement; not under CC BY
- MoSPI figures: Ministry of Statistics and Programme Implementation, Government of India
