// Money: Finance Commission shares and borrowing ceilings under different vintages of GSDP.
// Every figure drawn here is read from data/money.json; nothing is recomputed.
import {
  d3, ROOT, loadJSON, loadSite, failed, fy, fmtNum, fmtInt, fmtSigned, fmtPp, fmtCr, fmtCrSigned, fmtDateShort, esc, css,
  seg, fillSelect, dataTable, sourceNote, responsive, getParam, setParams, stateUrl, NOTE,
} from "../core.js";
import { frame, yGrid, xGrid, pad, hover, divergingBars } from "../charts.js";

const $ = (id) => document.getElementById(id);
// [key, short name, full name, period of the rupee figures]
const AWARDS = [
  ["fc15_final", "15th, final", "15th Finance Commission, final award (2021–26)", "2021–26, five years"],
  ["fc15_interim", "15th, interim", "15th Finance Commission, interim award (2020–21)", "2020–21, one year"],
  ["fc16", "16th, so far", "16th Finance Commission (from 2026–27)", "2026–27 budget estimate, one year"],
];
const META = Object.fromEntries(AWARDS.map((a) => [a[0], a]));
const SHORT = { fc15_final: "15th, final", fc15_interim: "15th, interim", fc16: "16th" };
/** "HB 2020-10-13" -> "RBI Handbook, 13 Oct 2020"; "MoSPI 2025-08-01" -> "MoSPI, 1 Aug 2025". */
const vintage = (s) => { const [src, date] = s.split(" "); return `${src === "HB" ? "RBI Handbook" : src}, ${fmtDateShort(date)}`; };
const crTick = (v) => fmtNum(v, 0);
const CENTRAL = `${NOTE.rbi} ${NOTE.mospi}`;

// ================= the in-page switch =================
function parts() {
  const tabs = [...document.querySelectorAll("#parts [role=tab]")];
  const show = (part, focus) => {
    tabs.forEach((t) => {
      const on = t.dataset.part === part;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      $(`part-${t.dataset.part}`).hidden = !on;
      if (on && focus) t.focus();
    });
    setParams({ part: part === "nbc" ? "borrowing" : null });
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => show(t.dataset.part));
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      show(tabs[(i + 1) % tabs.length].dataset.part, true);
    });
  });
  if (getParam("part") === "borrowing") show("nbc");
}

// ================= three awards, and each award by state =================
function finance(m, site) {
  const slug = Object.fromEntries(site.states.map((s) => [s.name, s.slug]));
  const order = Object.fromEntries(AWARDS.map((a, i) => [a[0], i]));
  const summary = [...m.summary].sort((a, b) => order[a.award] - order[b.award]); // within an award, the file's order
  const vintagesOf = (award) => summary.filter((s) => s.award === award).map((s) => s.base_vintage);
  const st = { award: META[getParam("award")] ? getParam("award") : "fc15_final", base: null, sort: "amount" };
  st.base = vintagesOf(st.award)[0];
  const key = (r) => `${r.award}|${r.base_vintage}`;

  // ---- the table ----
  const tbl = $("awards");
  dataTable(tbl, [
    { key: "award", label: "Award", sort: false, html: (r) => `<button type="button" class="rowpick" data-k="${esc(key(r))}" aria-pressed="false" aria-label="${esc(`${META[r.award][2]}, GSDP revised from ${vintage(r.base_vintage)}: draw by state`)}">${esc(META[r.award][2])}</button><span class="small sub">${META[r.award][3]}</span>` },
    { key: "base_vintage", label: "Starting vintage", sort: false, html: (r) => vintage(r.base_vintage) },
    { key: "cells_revised", label: "GSDP figures revised", num: true, sort: false },
    { key: "share_moved_pp", label: "Share of the pool, pp", num: true, sort: false, html: (r) => fmtNum(r.share_moved_pp, 3) },
    { key: "rs_crore_moved_total", label: "₹ crore, total", num: true, sort: false, html: (r) => fmtInt(r.rs_crore_moved_total) },
    { key: "rs_crore_moved_per_year", label: "₹ crore a year", num: true, sort: false, html: (r) => fmtInt(r.rs_crore_moved_per_year) },
  ], summary);
  const mark = () => tbl.querySelectorAll(".rowpick").forEach((b) => {
    const on = b.dataset.k === `${st.award}|${st.base}`;
    b.setAttribute("aria-pressed", String(on));
    b.closest("tr").classList.toggle("is-on", on);
  });
  tbl.addEventListener("click", (e) => {
    const b = e.target.closest("tbody tr")?.querySelector(".rowpick");
    if (!b) return;
    const [award, base] = b.dataset.k.split("|");
    pick(award, base);
  });
  $("awards-source").innerHTML = sourceNote([
    `Each Commission’s formula, which reproduces its published shares to within 0.001 percentage points, is run again with the Commission’s GSDP figures scaled by the revision between a starting vintage and the latest one (MoSPI’s release of April 2026; the RBI Handbook of December 2025 where MoSPI has no figure). Every other input is as published. The Commissions used MoSPI’s comparable GSDP series, which matches no published vintage exactly.`,
    `For each award the first row starts from the latest central vintage dated on or before the Commission’s report; the second is a sensitivity run that starts from a later vintage whose values are closer to the Commission’s own figures. Share of the pool: half the sum of the absolute changes in states’ shares. GSDP figures revised: state-years that differ between the two vintages.`,
    NOTE.devolution,
    CENTRAL,
  ]);

  // ---- by state ----
  const el = $("by-bars"), pp = $("by-pp");
  const draw = () => {
    const sum = summary.find((s) => s.award === st.award && s.base_vintage === st.base), a = META[st.award];
    $("by-unit").textContent = `${a[2]}. ₹ crore, ${a[3]}; GSDP revised from ${vintage(st.base)}`;
    if (!sum.cells_revised) {
      el.innerHTML = '<p class="empty">No GSDP figure in this award’s formula differs between this vintage and the latest one, so no share changes.</p>';
      pp.innerHTML = "";
    } else {
      const rows = m.by_state.filter((r) => r.award === st.award && r.base_vintage === st.base).map((r) => ({ ...r, name: r.state, v: r.rs_crore }))
        .sort((x, y) => (st.sort === "name" ? x.name.localeCompare(y.name) : y.v - x.v));
      divergingBars(el, {
        rows, fmt: (v) => fmtCrSigned(v).replace(" crore", ""), title: `Change in devolution by state, rupees crore: ${a[2]}`,
        tipHtml: (r) => `<div class="t">${esc(r.name)}</div><table><tr><td>Share as awarded</td><td>${fmtNum(r.share_pct_base, 3)}%</td></tr>
          <tr><td>Share with revised GSDP</td><td>${fmtNum(r.share_pct_cf, 3)}%</td></tr><tr><td>Change</td><td>${fmtPp(r.dpp, 3)}</td></tr>
          <tr><td>Amount</td><td>${fmtCrSigned(r.rs_crore)}</td></tr></table>`,
        onPick: (r) => (location.href = stateUrl(slug[r.name]) + "#finance-commission"),
      });
      pp.innerHTML = `<b>Share, pp</b>${rows.map((r) => `<span>${fmtSigned(r.dpp, 3)}</span>`).join("")}`;
    }
    $("by-source").innerHTML = sourceNote([
      `Each state’s share recomputed with the Commission’s GSDP figures scaled by the revision between the starting vintage (${vintage(st.base)}) and the latest vintage; every other input as published. The right-hand column is the change in the state’s share of the pool, in percentage points. ${NOTE.devolution}`,
      CENTRAL,
    ]);
  };
  const setAward = seg($("by-award"), AWARDS.map((a) => [a[0], a[1]]), st.award, (v) => pick(v, vintagesOf(v)[0]));
  seg($("by-sort"), [["amount", "By amount"], ["name", "A to Z"]], st.sort, (v) => { st.sort = v; draw(); });
  const fillVintages = () => fillSelect($("by-vintage"), vintagesOf(st.award).map((v) => [v, `From ${vintage(v)}`]), st.base);
  $("by-vintage").addEventListener("change", (e) => pick(st.award, e.target.value));
  function pick(award, base) {
    st.award = award;
    st.base = base;
    setAward(award);
    fillVintages();
    setParams({ award });
    mark();
    draw();
  }
  fillVintages();
  mark();
  responsive(el, draw);
}

// ================= placebo Commissions =================
function placebo(m) {
  const el = $("placebo");
  const top = d3.max([...m.placebo.map((r) => r.rs_crore_per_year), ...m.placebo_summary.map((s) => s.resample_p95)]);
  const draw = () => {
    const narrow = el.clientWidth < 560, rowH = 92, cy = 46, bandH = 32, R = narrow ? 4 : 5, step = 2 * R + 1;
    const { g, w, h } = frame(el, AWARDS.length * rowH + 44, { t: 4, r: 14, b: 40, l: 2 },
      "Placebo Commissions: rupees crore a year that would have gone to different states, by formula and edition of the data");
    const x = d3.scaleLinear().domain([0, top]).nice().range([0, w]);
    xGrid(g, x, h, crTick, narrow ? 4 : 6);
    g.append("text").attr("class", "anno").attr("x", 0).attr("y", h + 36).text("₹ crore a year");
    AWARDS.forEach(([k, , name], i) => {
      const s = m.placebo_summary.find((r) => r.formula === k);
      const row = g.append("g").attr("transform", `translate(0,${i * rowH})`);
      row.append("text").attr("class", "anno strong").attr("x", 0).attr("y", 14).text(narrow ? SHORT[k] : name);
      const band = row.append("rect").attr("x", x(s.resample_p5)).attr("width", x(s.resample_p95) - x(s.resample_p5)).attr("y", cy - bandH / 2).attr("height", bandH).attr("rx", 2)
        .attr("fill", css("vintage-1")).attr("fill-opacity", 0.28).attr("tabindex", 0)
        .attr("aria-label", `${name}: resampled range ${fmtInt(s.resample_p5)} to ${fmtInt(s.resample_p95)} rupees crore a year, median ${fmtInt(s.resample_median)}`);
      hover(band, () => `<div class="t">${SHORT[k]}: resampled range</div><table>
        <tr><td>5th percentile</td><td>${fmtInt(s.resample_p5)}</td></tr><tr><td>Median</td><td>${fmtInt(s.resample_median)}</td></tr>
        <tr><td>95th percentile</td><td>${fmtInt(s.resample_p95)}</td></tr></table><div class="dim">₹ crore a year; ${s.n_analogues} editions</div>`);
      row.append("line").attr("x1", x(s.resample_median)).attr("x2", x(s.resample_median)).attr("y1", cy - bandH / 2 - 3).attr("y2", cy + bandH / 2 + 3)
        .attr("stroke", css("ink-secondary")).attr("stroke-width", 2).attr("pointer-events", "none");
      // dots that would overlap are stepped up or down; the actual award keeps the centre line
      const placed = [];
      [...m.placebo.filter((r) => r.formula === k)].sort((a, b) => (b.is_actual - a.is_actual) || a.rs_crore_per_year - b.rs_crore_per_year).forEach((p) => {
        const px = x(p.rs_crore_per_year);
        const dy = [0, -step, step, -2 * step, 2 * step].find((o) => placed.every((q) => (q.px - px) ** 2 + (q.dy - o) ** 2 >= step ** 2)) ?? 0;
        placed.push({ ...p, px, dy });
      });
      const dots = row.append("g").selectAll("circle").data(placed.sort((a, b) => a.is_actual - b.is_actual)).join("circle")
        .attr("cx", (d) => d.px).attr("cy", (d) => cy + d.dy).attr("r", R)
        .attr("fill", (d) => (d.is_actual ? css("ink") : css("surface"))).attr("stroke", (d) => (d.is_actual ? css("ink") : css("vintage-2"))).attr("stroke-width", 1.5)
        .attr("tabindex", 0).attr("aria-label", (d) => `${SHORT[k]}, ${vintage(d.analogue_edition)}${d.is_actual ? ", actual award" : ""}: ${fmtInt(d.rs_crore_per_year)} rupees crore a year`);
      hover(dots, (d) => `<div class="t">${vintage(d.analogue_edition)}${d.is_actual ? ' <span class="dim">actual award</span>' : ""}</div><table>
        <tr><td>₹ crore a year</td><td>${fmtInt(d.rs_crore_per_year)}</td></tr>
        <tr><td>Share of the pool</td><td>${fmtNum(d.share_moved_pp, 3)} pp</td></tr>
        <tr><td>GSDP figures revised</td><td>${d.cells_revised}</td></tr></table>
        <div class="dim">${SHORT[k]} formula; GSDP years ${d.analogue_years.split(" ").map(fy).join(", ")}</div>`);
      const actual = placed.find((d) => d.is_actual);
      if (actual) row.append("text").attr("class", "anno").attr("x", actual.px).attr("y", cy + bandH / 2 + 20).attr("text-anchor", "middle").text("actual award");
    });
  };
  responsive(el, draw);
  $("placebo-source").innerHTML = sourceNote([
    `Each dot runs an award’s formula as if another edition of the RBI Handbook had been the Commission’s data, with years of the same age, and applies that edition’s later revisions to the Commission’s own GSDP figures. The band is the 5th to 95th percentile of 5,000 resamples in which each state takes its revisions from one edition chosen at random; the tick is their median. No actual award is marked for the 16th Commission, whose own data are not yet mature.`,
    NOTE.devolution,
    CENTRAL,
  ]);
}

// ================= a state's own GSDP =================
function own(m) {
  const el = $("own"), V = "own_rs_crore_per_year_per_1pct";
  const pair = new Map();
  for (const r of m.own) {
    if (!pair.has(r.state)) pair.set(r.state, { name: r.state });
    pair.get(r.state)[r.formula] = r;
  }
  const all = [...pair.values()].filter((p) => p.fc15_final && p.fc16);
  const extent = d3.extent(m.own, (r) => r[V]);
  let sort = "name";
  const draw = () => {
    const rows = [...all].sort((a, b) => (sort === "name" ? 0 : b[sort][V] - a[sort][V]) || a.name.localeCompare(b.name));
    const narrow = el.clientWidth < 560, rowH = 20, labW = narrow ? 118 : 168, col = 72, valW = narrow ? 0 : 2 * col + 8;
    const { g, w, h } = frame(el, rows.length * rowH + 52, { t: 22, r: valW + 6, b: 30, l: labW },
      "Change in each state’s devolution, rupees crore a year, when its own GSDP is 1 per cent higher: 15th final award against the 16th");
    const x = d3.scaleLinear().domain(pad(extent, 0.05, true)).nice().range([0, w]);
    xGrid(g, x, h, crTick, narrow ? 4 : 7);
    g.append("line").attr("class", "zero").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", h);
    if (!narrow) {
      g.append("text").attr("class", "anno").attr("x", w + 8 + col).attr("y", -8).attr("text-anchor", "end").text("15th, final");
      g.append("text").attr("class", "anno").attr("x", w + 8 + 2 * col).attr("y", -8).attr("text-anchor", "end").text("16th");
    }
    const row = g.selectAll("g.r").data(rows).join("g").attr("class", "r").attr("transform", (d, i) => `translate(0,${i * rowH})`);
    row.append("text").attr("class", "lbl").attr("x", -labW).attr("y", rowH / 2 + 4).text((d) => d.name);
    row.append("line").attr("x1", (d) => x(d.fc15_final[V])).attr("x2", (d) => x(d.fc16[V])).attr("y1", rowH / 2).attr("y2", rowH / 2)
      .attr("stroke", css("vintage-1")).attr("stroke-width", 1.5);
    row.append("circle").attr("cx", (d) => x(d.fc15_final[V])).attr("cy", rowH / 2).attr("r", 4).attr("fill", css("surface")).attr("stroke", css("vintage-2")).attr("stroke-width", 1.5);
    row.append("circle").attr("cx", (d) => x(d.fc16[V])).attr("cy", rowH / 2).attr("r", 4).attr("fill", css("ink"));
    if (!narrow) {
      row.append("text").attr("class", "val").attr("x", w + 8 + col).attr("y", rowH / 2 + 4).attr("text-anchor", "end").text((d) => fmtSigned(d.fc15_final[V], 1));
      row.append("text").attr("class", "val").attr("x", w + 8 + 2 * col).attr("y", rowH / 2 + 4).attr("text-anchor", "end").attr("fill", css("ink")).text((d) => fmtSigned(d.fc16[V], 1));
    }
    const hit = row.append("rect").attr("class", "hit").attr("x", -labW).attr("width", labW + w + valW + 6).attr("height", rowH)
      .attr("tabindex", 0).attr("role", "link")
      .attr("aria-label", (d) => `${d.name}: ${fmtSigned(d.fc15_final[V], 1)} under the 15th final award, ${fmtSigned(d.fc16[V], 1)} under the 16th, rupees crore a year. Open in the calculator`);
    hover(hit, (d) => `<div class="t">${esc(d.name)}</div><table>
      <tr><td>15th, final</td><td>${fmtSigned(d.fc15_final[V], 1)}</td></tr>
      <tr><td>16th</td><td>${fmtSigned(d.fc16[V], 1)}</td></tr></table>
      <div class="dim">₹ crore a year when its GSDP is 1% higher</div>
      <div class="dim">Change in its share: ${fmtPp(d.fc15_final.own_dpp_per_1pct, 3)} and ${fmtPp(d.fc16.own_dpp_per_1pct, 3)}</div>
      <div class="dim">Valid for small changes only</div>`, {
      enter() { d3.select(this.parentNode).select("text.lbl").attr("fill", css("ink")); },
      leave() { d3.select(this.parentNode).select("text.lbl").attr("fill", null); },
    });
    const open = (d) => (location.href = `${ROOT}calculator/?award=fc15_final&state=${encodeURIComponent(d.name)}&pct=1`);
    hit.on("click", (ev, d) => open(d)).on("keydown", (ev, d) => { if (ev.key === "Enter") open(d); });
  };
  seg($("own-sort"), [["name", "A to Z"], ["fc15_final", "By 15th"], ["fc16", "By 16th"]], sort, (v) => { sort = v; draw(); });
  responsive(el, draw);
  $("own-source").innerHTML = sourceNote([
    `At the published inputs, one state’s GSDP is raised by 1% in every year the formula uses and all shares are recomputed; the chart shows the change in that state’s own devolution. Valid for small changes only: the formulas have rank kinks, so these figures should not be scaled up or reversed in sign. Select a state to open it in the calculator.`,
    `${NOTE.devolution} ${NOTE.mospi}`,
  ]);
}

// ================= true-up (post-hoc) =================
function trueup(m) {
  const el = $("trueup");
  const top = d3.max(m.trueup, (r) => r.no_true_up_rs_cr);
  const draw = () => {
    const narrow = el.clientWidth < 560, labW = narrow ? 100 : 124, valW = 104, y0 = narrow ? 42 : 26, grpH = y0 + 70;
    const { g, w } = frame(el, m.trueup.length * grpH, { t: 2, r: valW, b: 2, l: labW },
      "Money that would have gone to different states under the 15th Commission’s final award, without and with a true-up");
    const x = d3.scaleLinear().domain([0, top]).range([0, w]);
    const grp = g.selectAll("g.t").data(m.trueup).join("g").attr("class", "t").attr("transform", (d, i) => `translate(0,${i * grpH})`);
    const head = grp.append("text").attr("class", "anno").attr("x", -labW).attr("y", 14);
    head.append("tspan").attr("fill", css("ink")).style("font-weight", 500).text((d) => `Shares re-fixed from ${fy(d.true_up_from)}`);
    head.append("tspan").attr("x", narrow ? -labW : null).attr("dx", narrow ? null : 10).attr("dy", narrow ? 16 : null).text((d) => `using the ${vintage(d.vintage_used)}`);
    // without a true-up
    grp.append("text").attr("class", "lbl").attr("x", -labW).attr("y", y0 + 11).text("Without true-up");
    grp.append("rect").attr("x", 0).attr("y", y0).attr("height", 14).attr("rx", 1.5).attr("width", (d) => x(d.no_true_up_rs_cr)).attr("fill", css("vintage-1"));
    grp.append("text").attr("class", "val").attr("x", (d) => x(d.no_true_up_rs_cr) + 6).attr("y", y0 + 11).text((d) => fmtCr(d.no_true_up_rs_cr));
    // with a true-up, and the part it corrects
    grp.append("text").attr("class", "lbl").attr("x", -labW).attr("y", y0 + 33).text("With true-up");
    grp.append("rect").attr("x", 0).attr("y", y0 + 22).attr("height", 14).attr("rx", 1.5).attr("width", (d) => x(d.with_true_up_rs_cr)).attr("fill", css("ink"));
    grp.append("rect").attr("x", (d) => x(d.with_true_up_rs_cr) + 1).attr("y", y0 + 22.5).attr("height", 13).attr("width", (d) => Math.max(0, x(d.no_true_up_rs_cr) - x(d.with_true_up_rs_cr) - 1.5))
      .attr("fill", "none").attr("stroke", css("vintage-2")).attr("stroke-width", 1.25).attr("stroke-dasharray", "3 3");
    grp.append("text").attr("class", "val").attr("x", (d) => x(d.no_true_up_rs_cr) + 6).attr("y", y0 + 33).attr("fill", css("ink")).text((d) => fmtCr(d.with_true_up_rs_cr));
    // the note ends under the right-hand end of the dashed part, so it cannot run off the plot
    grp.append("text").attr("class", "anno").attr("x", (d) => x(d.no_true_up_rs_cr)).attr("y", y0 + 54).attr("text-anchor", "end")
      .text((d) => (narrow ? `Corrected: ${fmtCr(d.corrected_rs_cr)} (${fmtNum(d.share_corrected_pct, 1)}%)` : `Corrected: ${fmtCr(d.corrected_rs_cr)}, ${fmtNum(d.share_corrected_pct, 1)}% of the total`));
    const hit = grp.append("rect").attr("class", "hit").style("cursor", "default").attr("x", -labW).attr("width", labW + w + valW).attr("height", grpH - 8).attr("tabindex", 0)
      .attr("aria-label", (d) => `Shares re-fixed from ${fy(d.true_up_from)}: ${fmtCr(d.no_true_up_rs_cr)} without a true-up, ${fmtCr(d.with_true_up_rs_cr)} with; ${fmtCr(d.corrected_rs_cr)} corrected, ${fmtNum(d.share_corrected_pct, 1)} per cent`);
    hover(hit, (d) => `<div class="t">Shares re-fixed from ${fy(d.true_up_from)}</div><table>
      <tr><td>Without a true-up</td><td>${fmtCr(d.no_true_up_rs_cr)}</td></tr><tr><td>With a true-up</td><td>${fmtCr(d.with_true_up_rs_cr)}</td></tr>
      <tr><td>Corrected</td><td>${fmtCr(d.corrected_rs_cr)}</td></tr><tr><td>Share corrected</td><td>${fmtNum(d.share_corrected_pct, 1)}%</td></tr></table>
      <div class="dim">Re-fixed using the ${vintage(d.vintage_used)}</div>`);
  };
  responsive(el, draw);
  $("trueup-source").innerHTML = sourceNote([
    `Post-hoc illustration, not pre-registered. The 15th Commission’s final-award formula is run again on the same years with a later edition of the RBI Handbook, and the new shares apply from the year shown; the dashed part is the amount this corrects. The total without a true-up differs slightly from the figure in the first table, which sums shares rounded to four decimals.`,
    `${NOTE.devolution} ${NOTE.rbi}`,
  ]);
}

// ================= a change of base year (a scenario) =================
function rebase(m) {
  const el = $("rebase");
  const top = d3.max(m.rebase, (r) => r.p95);
  const span = (r) => r.episode.split("->").map(fy);
  const draw = () => {
    const narrow = el.clientWidth < 560, rowH = 70, cy = 38;
    const { g, w, h } = frame(el, m.rebase.length * rowH + 44, { t: 4, r: 22, b: 40, l: 22 },
      "Scenario: rupees crore a year that would go to different states under the 16th Commission’s formula if states’ GSDP shifted as in a past change of base year");
    const x = d3.scaleLinear().domain([0, top]).nice().range([0, w]);
    xGrid(g, x, h, crTick, narrow ? 4 : 6);
    g.append("text").attr("class", "anno").attr("x", -22).attr("y", h + 36).text("₹ crore a year");
    const row = g.selectAll("g.e").data(m.rebase).join("g").attr("class", "e").attr("transform", (d, i) => `translate(0,${i * rowH})`);
    row.append("text").attr("class", "anno strong").attr("x", -22).attr("y", 14)
      .text((d) => { const [a, b] = span(d); return narrow ? `Base year ${a} to ${b}` : `Shifts as in the change of base year from ${a} to ${b}`; });
    row.append("line").attr("x1", (d) => x(d.p5)).attr("x2", (d) => x(d.p95)).attr("y1", cy).attr("y2", cy).attr("stroke", css("vintage-1")).attr("stroke-width", 2);
    for (const k of ["p5", "p95"]) {
      row.append("line").attr("x1", (d) => x(d[k])).attr("x2", (d) => x(d[k])).attr("y1", cy - 5).attr("y2", cy + 5).attr("stroke", css("vintage-1")).attr("stroke-width", 2);
      row.append("text").attr("class", "val").attr("x", (d) => x(d[k])).attr("y", cy + 20).attr("text-anchor", "middle").text((d) => fmtInt(d[k]));
    }
    row.append("circle").attr("cx", (d) => x(d.median_rs_crore_per_year)).attr("cy", cy).attr("r", 5).attr("fill", css("ink"));
    row.append("text").attr("class", "val").attr("x", (d) => x(d.median_rs_crore_per_year)).attr("y", cy + 20).attr("text-anchor", "middle").attr("fill", css("ink")).style("font-weight", 500)
      .text((d) => fmtInt(d.median_rs_crore_per_year));
    const hit = row.append("rect").attr("class", "hit").style("cursor", "default").attr("x", -22).attr("width", w + 44).attr("height", rowH - 6).attr("tabindex", 0)
      .attr("aria-label", (d) => `Base year ${span(d).join(" to ")}: median ${fmtInt(d.median_rs_crore_per_year)} rupees crore a year, 5th to 95th percentile ${fmtInt(d.p5)} to ${fmtInt(d.p95)}`);
    hover(hit, (d) => `<div class="t">Base year ${span(d).join(" to ")}</div><table>
      <tr><td>5th percentile</td><td>${fmtInt(d.p5)}</td></tr><tr><td>Median</td><td>${fmtInt(d.median_rs_crore_per_year)}</td></tr>
      <tr><td>95th percentile</td><td>${fmtInt(d.p95)}</td></tr>
      <tr><td>States with a shift</td><td>${d.states_with_shift}</td></tr>
      <tr><td>Spread of relative shifts (SD)</td><td>${fmtNum(d.sd_rel_shift_pct, 2)}%</td></tr>
      <tr><td>Largest relative shift</td><td>${fmtNum(d.max_abs_rel_shift_pct, 1)}%</td></tr></table>
      <div class="dim">₹ crore a year; a scenario, not a prediction</div>`);
  };
  responsive(el, draw);
  $("rebase-source").innerHTML = sourceNote([
    `A scenario, not a prediction: the award is fixed and will not be run again. For each past change of base year, every state’s shift in GSDP level relative to the median state, measured in the year the old and new series overlap, is reassigned at random among states of similar population 2,000 times and applied to all five GSDP years in the 16th Commission’s formula. Andhra Pradesh is left out of the 1999–00 to 2004–05 episode, where its old and new series cover different territory.`,
    `${NOTE.devolution} ${NOTE.rbi}`,
  ]);
}

// ================= borrowing ceilings =================
function borrowing(m) {
  const n = m.nbc, el = $("nbc");
  $("nbc-unit").textContent = `Ceiling from the latest vintage minus ceiling from the earliest; ${fy(n.years[0])} to ${fy(n.years.at(-1))}`;
  $("nbc-stats").innerHTML = [
    [`${fmtNum(n.median_abs_pct, 1)}%`, "Median absolute change in a ceiling"],
    [fmtInt(n.gross), "₹ crore, gross: the sum of absolute changes"],
    [fmtNum(n.net, 0), "₹ crore, net"],
    [fmtInt(n.n), "State-years"],
    [fmtInt(n.states), "States and union territories"],
  ].map(([v, t]) => `<div><p class="num-lg">${v}</p><p class="small">${t}</p></div>`).join("");
  const rule = "The Finance Commission’s projection rule for the net borrowing ceiling (GSDP two years earlier, carried forward at the mean nominal growth of the three years to that point, times the normal ceiling rate) is applied to the earliest central vintage that holds the base year and to the latest vintage.";
  const caveat = "These figures show how sensitive the rule is to the vintage of GSDP. They are not the ceilings the Ministry of Finance set, which this calculation reproduces within 2% only for 2024–25.";
  $("nbc-stats-source").innerHTML = sourceNote([`${rule} A change is the ceiling from the latest vintage minus the ceiling from the earliest.`, caveat, CENTRAL]);
  const draw = () => {
    const rows = n.by_year, narrow = el.clientWidth < 560;
    const { g, w, h } = frame(el, narrow ? 300 : 380, { t: 18, r: 8, b: 30, l: 72 }, "Gross and net change in borrowing ceilings by fiscal year, rupees crore");
    const x = d3.scaleBand().domain(rows.map((r) => r.fy)).range([0, w]).paddingInner(0.3).paddingOuter(0.12);
    const y = d3.scaleLinear().domain(pad(d3.extent(rows.flatMap((r) => [r.gross, r.net])), 0.1, true)).nice().range([h, 0]);
    yGrid(g, y, w, crTick, 6);
    const bw = x.bandwidth() / 2 - 1, label = bw >= 40;
    const grp = g.selectAll("g.y").data(rows).join("g").attr("class", "y").attr("transform", (d) => `translate(${x(d.fy)},0)`);
    grp.append("text").attr("class", "tick-label").attr("x", x.bandwidth() / 2).attr("y", h + 20).attr("text-anchor", "middle").text((d) => fy(d.fy));
    const bar = (key, dx, fill) => {
      grp.append("rect").attr("x", dx).attr("width", bw).attr("rx", 1.5).attr("y", (d) => Math.min(y(0), y(d[key]))).attr("height", (d) => Math.max(1, Math.abs(y(d[key]) - y(0)))).attr("fill", fill);
      if (label) grp.append("text").attr("class", "val").attr("x", dx + bw / 2).attr("text-anchor", "middle").attr("y", (d) => (d[key] >= 0 ? y(d[key]) - 6 : y(d[key]) + 14)).text((d) => fmtNum(d[key], 0));
    };
    bar("gross", 0, css("vintage-1"));
    bar("net", bw + 2, (d) => (d.net >= 0 ? css("data-blue") : css("data-red")));
    const hit = grp.append("rect").attr("class", "hit").style("cursor", "default").attr("x", -4).attr("width", x.bandwidth() + 8).attr("height", h).attr("tabindex", 0)
      .attr("aria-label", (d) => `${fy(d.fy)}: gross ${fmtInt(d.gross)}, net ${fmtNum(d.net, 0)} rupees crore`);
    hover(hit, (d) => `<div class="t">${fy(d.fy)}</div><table><tr><td>Gross</td><td>${fmtCr(d.gross)}</td></tr><tr><td>Net</td><td>${fmtCrSigned(d.net)}</td></tr></table>`);
  };
  responsive(el, draw);
  $("nbc-source").innerHTML = sourceNote([
    `${rule} Gross is the sum across states of the absolute changes in the ceiling; net is the sum of the signed changes, latest minus earliest. Normal ceiling rates: 3% of GSDP, except 4% in 2021–22 and 3.5% in 2022–23.`,
    caveat,
    CENTRAL,
  ]);
}

// ================= start =================
parts();
Promise.all([loadJSON("data/money.json"), loadSite()]).then(([m, site]) => {
  finance(m, site);
  placebo(m);
  own(m);
  trueup(m);
  rebase(m);
  borrowing(m);
}).catch((e) => ["awards", "by-bars", "placebo", "own", "trueup", "rebase", "nbc"].forEach((id) => failed($(id), e)));
