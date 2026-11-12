// Calculator: change a state's GSDP and recompute a Finance Commission's shares.
// The maths is fc.js, unchanged. This module only builds the override it is given and draws the result.
import {
  loadJSON, failed, fy, fmtNum, fmtInt, fmtPp, fmtCr, fmtCrSigned, esc, seg, fillSelect, copyButton, dataTable,
  sourceNote, responsive, getParam, setParams, NOTE,
} from "../core.js";
import { divergingBars } from "../charts.js";
import { shares, fromRatios, movedPp } from "../fc.js";

/* pure:start (no DOM; checked in Node against fc.js and data/calc.json) */
/**
 * The GSDP override for one what-if, as fc.js shares() takes it: {"State|2018-19": Rs crore}.
 * The per cent change multiplies the chosen state's published GSDP in the ticked years;
 * a figure edited by hand replaces whatever the slider gave that cell.
 * F: one award from data/calc.json. years: any iterable of fiscal years. edits: {"State|fy": Rs crore}.
 */
export function buildOverride(F, { state, pct = 0, years = [], edits = {} }) {
  const ratios = {};
  if (pct) for (const y of years) ratios[`${state}|${y}`] = 1 + pct / 100;
  return { ...fromRatios(F, ratios), ...edits };
}
/** The slider's range and step: −20 to 20 per cent, in tenths. Anything unreadable is 0. */
export function clampPct(v) {
  const x = Number.isFinite(v) ? Math.max(-20, Math.min(20, v)) : 0;
  return Math.round(x * 10) / 10 || 0;
}
/* pure:end */

const $ = (id) => document.getElementById(id);
const AWARDS = [
  ["fc15_final", "15th final", "15th Finance Commission, final award (2021–26)", "15th Finance Commission, report for 2021–26, Volume I, end note, pp. 166–167"],
  ["fc15_interim", "15th interim", "15th Finance Commission, interim award (2020–21)", "15th Finance Commission, report for 2020–21, end note, pp. 31–32"],
  ["fc16", "16th", "16th Finance Commission (from 2026–27)", "16th Finance Commission, report, Volume I, technical note, pp. 173–175"],
];
const CRITERION = {
  population: "Population", area: "Area", forest: "Forest", income_distance: "Income distance",
  demographic: "Demographic performance", tax_effort: "Tax effort", gdp_contribution: "Contribution to GDP",
};
// Rounding for display, so that a change too small to show never prints as "−0.000".
const r3 = (x) => Math.round(x * 1000) / 1000 || 0;
const r0 = (x) => Math.round(x) || 0;
const tone = (x) => (x > 0 ? "up" : x < 0 ? "down" : "");
const crShort = (x) => fmtCrSigned(r0(x)).replace(" crore", "");

function start(calc) {
  const st = { award: "fc15_final", state: "Maharashtra", pct: 0, years: new Set(), edits: {} };
  if (calc[getParam("award")]) st.award = getParam("award");
  if (getParam("state")) st.state = getParam("state");
  st.pct = clampPct(parseFloat(getParam("pct")));

  const F = () => calc[st.award];
  const meta = () => AWARDS.find((a) => a[0] === st.award);
  const range = $("pct"), box = $("pct-n"), stateSel = $("state"), grid = $("grid");
  let base = {}, rows = [];

  // ---------- one award: its states, years, published figures and notes ----------
  function setupAward() {
    const f = F();
    if (!f.S.includes(st.state)) st.state = f.S.includes("Maharashtra") ? "Maharashtra" : f.S[0];
    fillSelect(stateSel, f.S.map((s) => [s, s]), st.state);
    st.years = new Set(f.years);
    st.edits = {};
    base = shares(f);
    $("years").innerHTML = f.years.map((y) => `<label><input type="checkbox" value="${y}" checked><span>${fy(y)}</span></label>`).join("");
    $("bars-unit").textContent = `${meta()[2]}. Change in share times ₹${fmtInt(f.pool)} crore a year (${f.pool_note}).`;
    drawGrid();
    drawNotes();
  }

  // ---------- the editable GSDP table ----------
  function drawGrid() {
    const f = F();
    grid.innerHTML = `<table class="tbl gsdp"><thead><tr><th scope="col" class="sticky-col">State</th>${f.years.map((y) => `<th scope="col" class="num">${fy(y)}</th>`).join("")}</tr></thead>
      <tbody>${f.S.map((s) => `<tr><th scope="row" class="sticky-col">${esc(s)}</th>${f.years.map((y) =>
        `<td class="num"><input class="input num" type="number" inputmode="decimal" min="1" step="any" data-k="${esc(s)}|${y}" aria-label="${esc(s)}, ${fy(y)}: GSDP, rupees crore"></td>`).join("")}</tr>`).join("")}</tbody></table>`;
    syncGrid();
  }
  /** Show the figure in use in every cell, and mark the cells that differ from the published one. */
  function syncGrid(skip) {
    const f = F(), o = buildOverride(f, st);
    grid.querySelectorAll("input[data-k]").forEach((inp) => {
      const k = inp.dataset.k, [s, y] = k.split("|"), pub = f.gsdp[s][y];
      const edited = k in st.edits, slid = !edited && k in o;
      inp.classList.toggle("is-edited", edited);
      inp.classList.toggle("is-slider", slid);
      inp.title = edited ? `Edited by hand. Published: ${fmtInt(pub)}` : slid ? `Set by the slider. Published: ${fmtInt(pub)}` : "";
      if (inp !== skip) {
        inp.value = String(edited ? st.edits[k] : slid ? Math.round(o[k]) : pub);
        inp.removeAttribute("aria-invalid");
      }
    });
    const n = Object.keys(st.edits).length;
    $("edit-count").textContent = `GSDP as the Commission used it, ₹ crore at current prices. ${n === 0 ? "No figure edited by hand." : n === 1 ? "1 figure edited by hand." : `${n} figures edited by hand.`}`;
  }
  grid.addEventListener("input", (e) => {
    const inp = e.target.closest("input[data-k]");
    if (!inp) return;
    const k = inp.dataset.k, [s, y] = k.split("|"), pub = F().gsdp[s][y], v = parseFloat(inp.value);
    const ok = Number.isFinite(v) && v > 0;
    // Typing the published figure back removes the edit, unless the slider is acting on this cell:
    // there it pins the cell at the published figure. An empty or unreadable cell is no edit at all.
    const slid = st.pct !== 0 && s === st.state && st.years.has(y);
    if (!ok || (Math.abs(v - pub) < 0.5 && !slid)) delete st.edits[k]; else st.edits[k] = v;
    update(inp);
    if (ok) inp.removeAttribute("aria-invalid"); else inp.setAttribute("aria-invalid", "true");
  });
  // Leaving a cell with something unreadable in it puts back the figure in use.
  grid.addEventListener("change", () => syncGrid());

  // ---------- what is held fixed ----------
  function drawNotes() {
    const f = F(), fixed = Object.keys(f.fixedC);
    const names = (keys) => keys.map((k) => { const n = CRITERION[k] || k; return n[0].toLowerCase() + n.slice(1); }).join(", ");
    $("weights").innerHTML = `<table class="tbl"><thead><tr><th scope="col">Criterion</th><th scope="col" class="num">Weight, %</th><th scope="col">In this calculator</th></tr></thead>
      <tbody>${Object.keys(f.W).map((k) => `<tr><th scope="row">${esc(CRITERION[k] || k)}</th><td class="num">${fmtNum(f.W[k] * 100, 1)}</td><td>${fixed.includes(k) ? "held as published" : "recomputed from GSDP"}</td></tr>`).join("")}</tbody></table>`;
    $("fixed-list").innerHTML = [
      "Only GSDP changes. Population and every other input are the Commission’s published values.",
      `Recomputed from GSDP: ${names(Object.keys(f.W).filter((k) => !fixed.includes(k)))}. Held as published: ${names(fixed)}.`,
      "“Before” is the formula run on the published inputs. It is within about 0.001 percentage points of the shares printed in the report, because the report prints three decimals.",
      "The slider multiplies the chosen state’s published GSDP in the ticked years. A figure edited by hand replaces the slider’s figure for that cell.",
      "Large changes are unreliable. The income-distance step ranks states by GSDP per head, and a large change can alter which states set the benchmark, so that every state’s share moves in a step.",
      `Rupee amounts are the change in share times ₹${fmtInt(f.pool)} crore a year (${esc(f.pool_note)}).`,
    ].map((t) => `<li>${t}</li>`).join("");
    $("calc-source").innerHTML = sourceNote([
      `${meta()[3]}: formula and inputs as published; shares recomputed here with the changed GSDP figures.`,
      NOTE.devolution,
    ]);
  }

  // ---------- result, chart and table ----------
  const table = dataTable($("tbl"), [
    { key: "name", label: "State" },
    { key: "before", label: "Before, %", num: true, html: (r) => fmtNum(r.before, 3) },
    { key: "after", label: "After, %", num: true, html: (r) => fmtNum(r.after, 3) },
    { key: "d", label: "Change, pp", num: true, html: (r) => `<span class="${tone(r3(r.d))}">${fmtPp(r3(r.d), 3).replace(" pp", "")}</span>` },
    { key: "v", label: "₹ crore a year", num: true, html: (r) => crShort(r.v) },
  ], [], { sortKey: "v", dir: -1, sticky: true, onRow: (r, tr) => tr.classList.toggle("is-picked", r.name === st.state) });

  function drawBars() {
    divergingBars($("bars"), {
      rows, highlight: st.state, fmt: crShort, title: "Change in each state’s devolution, rupees crore a year",
      tipHtml: (r) => `<div class="t">${esc(r.name)}</div><table><tr><td>Share before</td><td>${fmtNum(r.before, 3)}%</td></tr>
        <tr><td>Share after</td><td>${fmtNum(r.after, 3)}%</td></tr><tr><td>Change</td><td>${fmtPp(r3(r.d), 3)}</td></tr>
        <tr><td>A year</td><td>${fmtCrSigned(r0(r.v))}</td></tr></table>`,
    });
  }

  function compute() {
    const f = F(), now = shares(f, buildOverride(f, st)), moved = movedPp(base, now);
    rows = f.S.map((name) => ({ name, before: base[name], after: now[name], d: now[name] - base[name], v: ((now[name] - base[name]) / 100) * f.pool }))
      .sort((a, b) => b.v - a.v || a.name.localeCompare(b.name));
    const me = rows.find((r) => r.name === st.state), t = tone(r3(me.d));
    $("result").innerHTML = `
      <div class="cr-row cr-main"><span class="cr-lab">${esc(st.state)}: share of devolution</span>
        <span class="cr-fig"><span class="num-lg">${fmtNum(me.before, 3)}% <span aria-hidden="true">→</span><span class="sr">to</span> ${fmtNum(me.after, 3)}%</span><span class="${t}">${fmtPp(r3(me.d), 3)}</span></span></div>
      <div class="cr-row"><span class="cr-lab">Change in ₹ crore a year</span><span class="cr-fig ${tone(r0(me.v))}">${fmtCrSigned(r0(me.v))}</span></div>
      <div class="cr-row"><span class="cr-lab">Moved between states, in all</span>
        <span class="cr-fig"><span>${fmtNum(r3(moved), 3)} pp</span><span>${fmtCr(r0((moved / 100) * f.pool))} a year</span></span></div>`;
    drawBars();
    if ($("d-shares").open) table.update(rows);
  }
  /** Recompute and redraw after any change. skip: a GSDP cell being typed in, left as the reader has it. */
  function update(skip) {
    compute();
    if ($("d-grid").open || skip) syncGrid(skip);
    setParams({ award: st.award, state: st.state, pct: st.pct ? String(st.pct) : null });
  }
  $("d-shares").addEventListener("toggle", (e) => { if (e.target.open) table.update(rows); });
  $("d-grid").addEventListener("toggle", (e) => { if (e.target.open) syncGrid(); });

  // ---------- controls ----------
  function setPct(v, from) {
    st.pct = clampPct(v);
    if (from !== range) range.value = st.pct;
    if (from !== box) box.value = st.pct;
    update();
  }
  seg($("award"), AWARDS.map((a) => [a[0], a[1]]), st.award, (v) => { st.award = v; setupAward(); update(); });
  stateSel.addEventListener("change", () => { st.state = stateSel.value; update(); });
  range.addEventListener("input", () => setPct(parseFloat(range.value), range));
  box.addEventListener("input", () => { const v = parseFloat(box.value); if (Number.isFinite(v)) setPct(v, box); });
  box.addEventListener("change", () => { box.value = st.pct; });
  $("years").addEventListener("change", (e) => {
    if (e.target.type !== "checkbox") return;
    if (e.target.checked) st.years.add(e.target.value); else st.years.delete(e.target.value);
    update();
  });
  $("reset").addEventListener("click", () => {
    st.years = new Set(F().years);
    st.edits = {};
    $("years").querySelectorAll("input").forEach((c) => (c.checked = true));
    setPct(0);
  });
  copyButton($("copy"), () => location.href);
  $("csv").addEventListener("click", () => {
    const head = "state,share_before_pct,share_after_pct,change_pp,change_rs_crore_a_year";
    const body = [...rows].sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => [`"${r.name.replace(/"/g, '""')}"`, r.before.toFixed(6), r.after.toFixed(6), r.d.toFixed(6), r.v.toFixed(2)].join(","));
    const url = URL.createObjectURL(new Blob([[head, ...body].join("\n") + "\n"], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `itihas_calculator_${st.award}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  setupAward();
  range.value = st.pct;
  box.value = st.pct;
  compute();
  responsive($("bars"), drawBars);
}

loadJSON("data/calc.json").then(start).catch((e) => failed($("result"), e));
