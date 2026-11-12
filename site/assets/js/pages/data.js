// Data: the files, a first-rows preview, per-state triangles, citations and the version.
import { ROOT, REPO_URL, CITE, CITE_PAPER, loadSite, esc, fmtInt, fmtNum, fmtDate, copyButton, fillSelect, icon } from "../core.js";

const $ = (id) => document.getElementById(id);
const DL = `${ROOT}downloads/`;

// The files in downloads/. Row counts (lines less the header) and sizes (bytes on disk) were read from the
// files on 10 Nov 2026; if the build changes the files, update them here. Where site.json carries the same
// count (values, states) the page shows that one instead, so the two cannot disagree.
const FILES = [
  { path: "data/vintages_long.csv", what: "Every published value, one row for each number in each document: state documents and MoSPI releases", rows: 5365, count: "open_values", bytes: 2160272, licence: "CC BY 4.0", preview: true },
  { path: "data/releases.csv", what: "One row for each source document: title, publisher, dates, link, SHA-256 fingerprint, pages used", rows: 244, bytes: 128500, licence: "CC BY 4.0", preview: true },
  { path: "data/states.csv", what: "State and union territory codes, names and boundary notes", rows: 34, count: "states", bytes: 1357, licence: "CC BY 4.0", preview: true },
  { path: "data/triangles/", what: "Revision triangles, one file for each state and price basis: rows are fiscal years, columns are releases in date order, cells are GSDP in ₹ crore", rows: "64 files", bytes: 72005, licence: "CC BY 4.0", jump: "#triangles" },
  { path: "codebook.md", what: "Every file and column, defined", bytes: 5254 },
  { path: "validation.md", what: "How the values taken from state documents were checked", bytes: 3782 },
  { path: "CHANGELOG.md", what: "Version history", bytes: 444 },
  { path: "LICENSE-DATA.md", what: "The terms for each part of the database", bytes: 3943 },
];
// Citation fields from release/CITATION.cff (title, version, authors, repository); the year and publisher as in CITE.
const BIBTEX = `@misc{jha_parekh_2026_itihas,
  author    = {Jha, Shrihan and Parekh, Veer Binoy},
  title     = {{ITIHAS: Indian Time-series of Initial and Historical Accounts of States}},
  year      = {2026},
  version   = {1.0.0},
  publisher = {Zenodo},
  doi       = {10.5281/zenodo.24163142},
  url       = {https://doi.org/10.5281/zenodo.24163142},
  note      = {Version 1.0.0}
}`;
const TRIANGLES = [["gsdp_constant", "Constant prices"], ["gsdp_current", "Current prices"]];

const fmtBytes = (b) => (b < 1000 ? `${b} B` : b < 1e6 ? `${fmtNum(b / 1000, b < 1e4 ? 1 : 0)} kB` : `${fmtNum(b / 1e6, 1)} MB`);
const fileName = (path) => path.split("/").pop();

// ---------- files ----------
function drawFiles(counts) {
  $("files").innerHTML = `<table class="tbl files"><thead><tr><th scope="col">File</th><th scope="col">What it holds</th><th scope="col" class="num">Rows</th><th scope="col" class="num">Size</th><th scope="col">Licence</th><th scope="col"><span class="sr">Get the file</span></th></tr></thead>
    <tbody>${FILES.map((f) => {
      const rows = f.rows == null ? "—" : typeof f.rows === "string" ? f.rows : fmtInt(counts?.[f.count] ?? f.rows);
      const get = f.jump
        ? `<a href="${f.jump}">Choose a state</a>`
        : `<a href="${DL}${f.path}" download>Download</a>${f.preview ? `<button type="button" class="linkish" data-preview="${f.path}" aria-expanded="false" aria-controls="preview">First five rows</button>` : ""}`;
      return `<tr><td class="file">${esc(f.path)}</td><td class="wrap-ok">${esc(f.what)}</td><td class="num">${rows}</td><td class="num">${fmtBytes(f.bytes)}</td><td>${f.licence || "—"}</td><td><span class="get">${get}</span></td></tr>`;
    }).join("")}</tbody></table>`;
}

// ---------- first five rows ----------
/** Parse CSV text into records (quoted fields, doubled quotes, line breaks inside quotes). Stops at max records.
 *  partial: the text may end mid-record, so an unterminated last record is left out. */
function parseCSV(text, max, partial) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
      if (rows.length >= max) return rows;
    } else cell += c;
  }
  if (!partial && (cell !== "" || row.length)) { row.push(cell); rows.push(row); }
  return rows;
}
/** The header and the first n records of a CSV, reading no more of the file than that needs. */
async function firstRows(url, n) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not load the file (${r.status})`);
  if (!r.body?.getReader) return parseCSV((await r.text()).replace(/^﻿/, ""), n + 1, false);
  const reader = r.body.getReader(), dec = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) text += dec.decode(value, { stream: true });
    const rows = parseCSV(text.replace(/^﻿/, ""), n + 1, !done);
    if (rows.length > n || done) {
      if (!done) reader.cancel().catch(() => {});
      return rows;
    }
  }
}
let shown = null;
async function preview(path, btn) {
  const el = $("preview");
  document.querySelectorAll("[data-preview]").forEach((b) => b.setAttribute("aria-expanded", "false"));
  if (shown === path) { shown = null; el.hidden = true; el.innerHTML = ""; return; }
  shown = path;
  btn.setAttribute("aria-expanded", "true");
  el.hidden = false;
  el.innerHTML = `<p class="empty">Reading ${esc(path)}.</p>`;
  try {
    const [head, ...body] = await firstRows(DL + path, 5);
    if (shown !== path) return;
    if (!head) throw new Error("The file is empty.");
    el.innerHTML = `<div class="preview-head"><span>First ${body.length === 5 ? "five" : body.length} rows of <span class="mono">${esc(path)}</span>, ${head.length} columns. Long cells are cut short here; the file has them in full.</span>
        <button type="button" class="linkish" data-close>Close</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${body.map((r) => `<tr>${head.map((_, i) => `<td title="${esc(r[i] ?? "")}">${esc(r[i] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  } catch (e) {
    if (shown !== path) return;
    el.innerHTML = `<p class="empty">Could not read ${esc(path)}. ${esc(e.message)}</p>`;
  }
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-preview]");
  if (b) { preview(b.dataset.preview, b); return; }
  if (e.target.closest("#preview [data-close]")) {
    const open = document.querySelector(`[data-preview="${shown}"]`);
    preview(shown, open);
    open?.focus();
  }
});

// ---------- per-state triangles ----------
let have = {}; // state code -> triangle folders that exist (site.json states[].triangles)
function triangles(code) {
  // Not every unit has a file at each price basis; site.json lists which exist.
  $("tri-links").innerHTML = TRIANGLES.map(([dir, label]) => ((have[code] || []).includes(dir)
    ? `<a class="btn btn-secondary" href="${DL}data/triangles/${dir}/${code}.csv" download="${code}_${dir}.csv">${icon("download")}<span>${label} (CSV)</span></a>`
    : `<span class="small muted">${label}: no file for this state or union territory.</span>`)).join("");
}

// ---------- citations, repository links ----------
$("cite-text").textContent = CITE;
copyButton($("cite-copy"), () => CITE);
$("paper-cite").textContent = CITE_PAPER;
copyButton($("paper-copy"), () => CITE_PAPER);
$("bib-text").textContent = BIBTEX;
copyButton($("bib-copy"), () => BIBTEX);
document.querySelectorAll("a[data-repo]").forEach((a) => (a.href = REPO_URL + (a.dataset.repo || "")));

// ---------- start ----------
drawFiles(null);
loadSite().then((site) => {
  drawFiles(site.counts);
  $("rbi-count").textContent = `${fmtInt(site.counts.rbi_values)} values in ${fmtInt(site.counts.rbi_editions)} editions.`;
  $("ver").textContent = site.version;
  $("built").textContent = fmtDate(site.built);
  const sel = $("tri-state");
  have = Object.fromEntries(site.states.map((s) => [s.code, s.triangles || []]));
  fillSelect(sel, site.states.map((s) => [s.code, s.name]), site.states[0].code);
  sel.addEventListener("change", () => triangles(sel.value));
  triangles(sel.value);
}).catch((e) => {
  console.error(e);
  $("tri-links").innerHTML = `<p class="empty">Could not load the list of states. ${esc(e.message)}</p>`;
});
