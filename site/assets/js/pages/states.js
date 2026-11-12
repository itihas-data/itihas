// States index: the map and a table, two routes to the same 34 pages.
import { d3, loadSite, failed, fy, fmtInt, esc, seg, dataTable, sourceNote, sequential, stateUrl, NOTE } from "../core.js";
import { indiaMap, NO_SERIES } from "../map.js";

const $ = (id) => document.getElementById(id);
const MEASURES = {
  n_releases: ["Documents", "Documents in the database", "Number of documents with a figure for the state: its own, RBI Handbook editions and MoSPI releases"],
  n_state_docs: ["State documents", "The state government’s own documents", "Number of the state government’s own documents in the database"],
  n_values: ["Values", "Values in the database", "Number of GSDP values recorded for the state, all documents and both price bases"],
};

async function main() {
  const site = await loadSite();
  const byCode = Object.fromEntries(site.states.map((s) => [s.code, s]));
  // Years with any estimate, from the cells (a range, not a statistic).
  const span = {};
  for (const c of site.cells) (span[c.s] ??= []).push(c.fy);
  const rows = site.states.map((s) => {
    const ys = (span[s.code] || []).sort();
    return { ...s, kind: s.type === "state" ? "State" : "Union territory", years: ys.length ? `${fy(ys[0])} to ${fy(ys.at(-1))}` : "levels only", y0: ys[0] || "" };
  });
  let measure = "n_releases", scale;

  const map = await indiaMap($("map"), {
    title: "Map of India: what the database holds for each state",
    label: (code, name) => (byCode[code] ? `${name}: ${fmtInt(byCode[code][measure])} ${MEASURES[measure][0].toLowerCase()}` : `${name}: no series in the database`),
    tipHtml: (code) => {
      const s = byCode[code];
      if (!s) return `<div class="dim">${NO_SERIES[code]}</div>`;
      return `<table><tr><td>Documents</td><td>${fmtInt(s.n_releases)}</td></tr><tr><td>State documents</td><td>${fmtInt(s.n_state_docs)}</td></tr><tr><td>Values</td><td>${fmtInt(s.n_values)}</td></tr></table>`;
    },
    onPick: (code) => { if (byCode[code]) location.href = stateUrl(byCode[code].slug); },
    onHover: (code) => document.querySelectorAll("#table tbody tr").forEach((tr) => tr.classList.toggle("is-active", !!code && tr.dataset.code === code)),
  });
  map.chips($("chips"));

  function paint() {
    const max = d3.max(site.states, (s) => s[measure]);
    scale = sequential([0, max]);
    map.paint((code) => (byCode[code] ? { fill: scale(byCode[code][measure]) } : { none: true }));
    $("map-title").textContent = MEASURES[measure][1];
    $("map-unit").textContent = MEASURES[measure][2];
    $("map-legend").innerHTML = `<span class="scale">0<i style="background:${scale.gradient()}"></i>${fmtInt(max)}</span><span><i class="swatch void"></i> no series</span>`;
  }
  seg($("measure"), Object.entries(MEASURES).map(([k, v]) => [k, v[0]]), measure, (v) => { measure = v; paint(); });
  window.addEventListener("themechange", paint);
  paint();

  const table = dataTable($("table"), [
    { key: "name", label: "Name", html: (r) => `<a href="${stateUrl(r.slug)}">${esc(r.name)}</a>` },
    { key: "kind", label: "Type" },
    { key: "n_releases", label: "Documents", num: true, html: (r) => fmtInt(r.n_releases) },
    { key: "n_state_docs", label: "State documents", num: true, html: (r) => fmtInt(r.n_state_docs) },
    { key: "n_values", label: "Values", num: true, html: (r) => fmtInt(r.n_values) },
    { key: "y0", label: "Growth series", html: (r) => r.years },
  ], rows, {
    sortKey: "name",
    onRow: (r, tr) => {
      tr.dataset.code = r.code;
      tr.addEventListener("click", (e) => { if (!e.target.closest("a")) location.href = stateUrl(r.slug); });
      tr.addEventListener("pointerenter", () => map.pick(r.code));
      tr.addEventListener("pointerleave", () => map.pick(null));
    },
  });
  $("filter").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    table.update(rows.filter((r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase() === q));
  });

  const noDocs = site.states.filter((s) => s.n_state_docs === 0).map((s) => s.name);
  $("map-source").innerHTML = sourceNote([`Counts of documents and values in the database, version ${esc(site.version)}.`, NOTE.map]);
  $("table-source").innerHTML = sourceNote([
    `${noDocs.length} units have no document of their own in the database; their figures come from the RBI Handbook and MoSPI only: ${noDocs.map(esc).join(", ")}.`,
    `No series in the database: Lakshadweep; Dadra and Nagar Haveli and Daman and Diu. Ladakh has levels at current prices in two documents and no growth series.`,
    `${NOTE.rbi} ${NOTE.mospi}`,
  ]);
}
main().catch((e) => failed($("table"), e));
