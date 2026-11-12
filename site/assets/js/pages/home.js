// Homepage: the map that settles, then the argument in five exhibits.
import {
  d3, ROOT, loadJSON, loadSite, failed, fy, fmtPct, fmtPp, fmtNum, fmtInt, fmtCr, fmtCrSigned, fmtDate, fmtDateShort, esc, css, icon,
  diverging, sequential, seg, fillSelect, copyButton, dataTable, sourceNote, responsive, getParam, setParams, stateUrl,
  reducedMotion, NOTE, SRC_NAME, CITE, day, MINUS,
} from "../core.js";
import { indiaMap, NO_SERIES } from "../map.js";
import { scrubber } from "../scrub.js";
import { T, frame, hover, maturityChart, slopeChart, rankRows, divergingBars, settleChart } from "../charts.js";

const $ = (id) => document.getElementById(id);
const GAP_MAX = 4; // pp at which the diverging scale saturates

// ================= opening: the map =================
async function opening(site, asof) {
  const docs = asof.docs; // [id, date, src, publisher, title]
  const byCode = Object.fromEntries(site.states.map((s) => [s.code, s]));
  const state = {
    fy: site.fiscal_years.includes(getParam("fy")) ? getParam("fy") : "2018-19",
    show: getParam("show") === "growth" ? "growth" : "gap",
    date: null,
    picked: null,
  };
  const series = (code) => asof.est[code]?.[state.fy] || [];
  /** The newest estimate in public on a date: [docIndex, value] or null. */
  const known = (code, date) => { let k = null; for (const e of series(code)) { if (docs[e[0]][1] <= date) k = e; else break; } return k; };
  const latest = (code) => series(code).at(-1) || null;

  fillSelect($("fy"), site.fiscal_years.map((f) => [f, fy(f)]), state.fy);
  const table = dataTable($("map-table"), [
    { key: "name", label: "State or union territory", html: (r) => `<a href="${stateUrl(r.slug, `fy=${state.fy}`)}">${esc(r.name)}</a>` },
    { key: "then", label: "As known on the date", num: true, html: (r) => (r.none ? "no data" : r.then == null ? "not yet published" : fmtPct(r.then, 2)) },
    { key: "doc", label: "From", html: (r) => (r.doc ? `${SRC_NAME[r.doc[2]]}, ${fmtDateShort(r.doc[1])}` : "—") },
    { key: "now", label: "Latest", num: true, html: (r) => fmtPct(r.now, 2) },
    { key: "gap", label: "Gap, pp", num: true, html: (r) => (r.gap == null ? "—" : fmtPp(r.gap).replace(" pp", "")) },
  ], [], { sortKey: "name" });

  const map = await indiaMap($("map"), {
    title: "Map of India: growth by state as known on the chosen date",
    label: (code, name) => describe(code, name),
    tipHtml: (code) => tipFor(code),
    onPick: (code) => pick(code),
  });
  map.chips($("chips"));

  function row(code) {
    const k = known(code, state.date), l = latest(code);
    return { then: k?.[1] ?? null, doc: k ? docs[k[0]] : null, now: l?.[1] ?? null, gap: k && l ? k[1] - l[1] : null, none: !l };
  }
  function describe(code, name) {
    const r = row(code);
    if (r.none) return `${name}: no data for ${fy(state.fy)}`;
    if (r.then == null) return `${name}: not yet published on ${fmtDate(state.date)}`;
    return `${name}: growth ${fmtPct(r.then)} as known on ${fmtDate(state.date)}; latest ${fmtPct(r.now)}`;
  }
  function tipFor(code) {
    if (code in NO_SERIES && !asof.est[code]) return `<div class="dim">${NO_SERIES[code]}</div>`;
    const r = row(code);
    if (r.none) return `<div class="dim">No estimate of ${fy(state.fy)} in the database</div>`;
    if (r.then == null) return `<div class="dim">Not yet published on ${fmtDateShort(state.date)}</div><table><tr><td>Latest</td><td>${fmtPct(r.now, 2)}</td></tr></table>`;
    return `<table><tr><td>Known then</td><td>${fmtPct(r.then, 2)}</td></tr><tr><td>Latest</td><td>${fmtPct(r.now, 2)}</td></tr>
      <tr><td>Gap</td><td>${fmtPp(r.gap)}</td></tr></table><div class="dim">${SRC_NAME[r.doc[2]]}, ${fmtDateShort(r.doc[1])}</div>`;
  }

  let scale;
  function legend() {
    const gap = state.show === "gap";
    if (gap) scale = diverging(GAP_MAX);
    else {
      const all = Object.keys(asof.est).flatMap((c) => series(c).map((e) => e[1]));
      scale = sequential(all.length ? [Math.floor(d3.min(all)), Math.ceil(d3.max(all))] : [0, 1]);
      scale.dom = all.length ? [Math.floor(d3.min(all)), Math.ceil(d3.max(all))] : [0, 1];
    }
    $("map-legend").innerHTML = `<span class="scale">${gap ? `${MINUS}${GAP_MAX} pp` : fmtPct(scale.dom[0], 0)}<i style="background:${scale.gradient()}"></i>${gap ? `+${GAP_MAX} pp` : fmtPct(scale.dom[1], 0)}</span>
      <span><i class="swatch hatch"></i> not yet published</span><span><i class="swatch void"></i> no data</span>`;
  }
  function paint() {
    map.paint((code) => {
      const r = row(code);
      if (r.none) return { none: true };
      if (r.then == null) return { hatch: true };
      return { fill: scale(state.show === "gap" ? r.gap : r.then) };
    });
    $("asof-date").textContent = fmtDate(state.date);
    if ($("map-table").closest("details").open) drawTable();
    if (state.picked) panel();
  }
  function drawTable() {
    table.update(site.states.map((s) => ({ ...s, ...row(s.code) })));
  }
  $("map-table").closest("details").addEventListener("toggle", (e) => { if (e.target.open) drawTable(); });

  // ---- the state panel ----
  function panel() {
    const code = state.picked, s = byCode[code], r = row(code), el = $("panel");
    const pts = series(code).map(([i, v]) => ({ date: docs[i][1], v, src: docs[i][2], title: docs[i][4] }));
    el.hidden = false;
    el.innerHTML = `<div class="panel-head"><div><h3 class="t-chart">${esc(s.name)}</h3><p class="small">Growth in ${fy(state.fy)}</p></div>
        <button class="icon-btn" type="button" aria-label="Close" data-close>${icon("close")}</button></div>
      <dl class="facts"><dt>${r.then == null ? "—" : fmtPct(r.then, 2)}</dt><dd>as known on ${fmtDateShort(state.date)}</dd>
        <dt>${fmtPct(r.now, 2)}</dt><dd>latest</dd><dt>${pts.length}</dt><dd>published estimates</dd></dl>
      <div id="panel-chart"></div>
      <a class="btn btn-primary" href="${stateUrl(s.slug, `fy=${state.fy}&asof=${state.date}`)}">Open ${esc(s.name)}</a>`;
    el.querySelector("[data-close]").addEventListener("click", () => pick(null));
    settleChart($("panel-chart"), { points: pts, fiscal: state.fy, height: 170, upto: state.date, compact: true });
  }
  function pick(code) {
    if (code && code === state.picked) { location.href = stateUrl(byCode[code].slug, `fy=${state.fy}&asof=${state.date}`); return; }
    if (code && !byCode[code]) return;
    state.picked = code;
    map.pick(code);
    if (code) panel(); else $("panel").hidden = true;
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.picked) pick(null); });

  // ---- time ----
  let scrub;
  function timeline() {
    const used = new Set();
    for (const c in asof.est) for (const e of series(c)) used.add(e[0]);
    const ticks = [...used].map((i) => ({ date: docs[i][1], big: docs[i][2] !== "state" }));
    const dates = [...new Set(ticks.map((t) => t.date))].sort();
    return { dates, ticks };
  }
  function setYear(first) {
    const { dates, ticks } = timeline();
    if (!scrub) {
      scrub = scrubber($("scrub"), { dates, ticks, label: "As known on", onChange: (i, d) => { state.date = d; paint(); if (!scrub.playing()) setParams({ asof: d }); } });
    } else scrub.setDates(dates, ticks);
    const want = first ? getParam("asof") : null;
    if (want) { let k = 0; dates.forEach((d, i) => { if (d <= want) k = i; }); scrub.set(k, { silent: true }); }
    state.date = scrub.date();
    legend();
    paint();
    $("map-source").innerHTML = sourceNote([
      `Real GSDP growth in ${fy(state.fy)}, per cent, constant 2011–12 prices. Each state shows the newest estimate in public on the chosen date; projections published before 1 October of the year are left out. The gap is that estimate minus the latest one.`,
      `${NOTE.state} ${NOTE.rbi} ${NOTE.mospi}`, NOTE.map,
    ]);
  }
  $("fy").addEventListener("change", (e) => { state.fy = e.target.value; setParams({ fy: state.fy, asof: null }); pick(null); setYear(false); });
  seg($("show"), [["gap", "Gap to latest figure"], ["growth", "Growth as published"]], state.show, (v) => { state.show = v; setParams({ show: v === "gap" ? null : v }); legend(); paint(); });
  window.addEventListener("themechange", () => { legend(); paint(); });
  setYear(true);
  // The page's one piece of automatic motion: replay the year once, unless a date was asked for.
  if (!getParam("asof") && !reducedMotion()) setTimeout(() => scrub.play(), 500);
}

// ================= 01 the publication record =================
function record(site, asof) {
  const el = $("record"), docs = asof.docs;
  let sort = "name";
  const dated = (code) => asof.rel[code].map((i) => docs[i]).filter((d) => d[1]);
  const all = site.states.flatMap((s) => dated(s.code).map((d) => d[1])).sort();
  const draw = () => {
    const rows = [...site.states].sort((a, b) => (sort === "docs" ? b.n_state_docs - a.n_state_docs : 0) || a.name.localeCompare(b.name));
    const narrow = el.clientWidth < 560, rowH = 16, labW = narrow ? 104 : 196;
    const { g, w, h } = frame(el, rows.length * rowH + 44, { t: 22, r: 34, b: 22, l: labW }, "Publication dates of every document, one row per state");
    const x = d3.scaleLinear().domain([day(all[0]) - 40, day(all.at(-1)) + 40]).range([0, w]);
    const years = d3.range(+all[0].slice(0, 4) + 1, +all.at(-1).slice(0, 4) + 1);
    const yr = g.append("g").attr("class", "axis grid").selectAll("g").data(years.filter((y) => !narrow || y % 2 === 0)).join("g").attr("transform", (y) => `translate(${x(day(`${y}-01-01`))},0)`);
    yr.append("line").attr("y1", -4).attr("y2", h + 4);
    yr.append("text").attr("y", -10).attr("text-anchor", "middle").text((y) => y);
    yr.append("text").attr("y", h + 18).attr("text-anchor", "middle").text((y) => y);
    g.append("text").attr("class", "tick-label").attr("x", w + 34).attr("y", -10).attr("text-anchor", "end").text("docs");
    const row = g.selectAll("g.row").data(rows).join("g").attr("class", "row").attr("transform", (d, i) => `translate(0,${i * rowH})`);
    row.append("a").attr("href", (d) => stateUrl(d.slug)).append("text").attr("class", "lbl").attr("x", -labW).attr("y", rowH - 4)
      .text((d) => (narrow && d.name.length > 15 ? d.name.slice(0, 14) + "…" : d.name));
    row.append("text").attr("class", "val").attr("x", w + 34).attr("y", rowH - 4).attr("text-anchor", "end").attr("opacity", (d) => (d.n_state_docs ? 1 : 0.45)).text((d) => d.n_state_docs);
    const order = { rbi: 0, mospi: 1, state: 2 };
    const tick = row.selectAll("g.t").data((d) => dated(d.code).map((doc) => ({ doc, s: d })).sort((a, b) => order[a.doc[2]] - order[b.doc[2]])).join("g").attr("class", "t")
      .attr("transform", (d) => `translate(${x(day(d.doc[1]))},0)`);
    tick.append("line").attr("y1", (d) => (d.doc[2] === "state" ? 2 : 0)).attr("y2", (d) => (d.doc[2] === "state" ? rowH - 2 : rowH))
      .attr("stroke", (d) => css(`src-${d.doc[2]}`)).attr("stroke-width", (d) => (d.doc[2] === "state" ? 2 : 1.25)).attr("opacity", (d) => (d.doc[2] === "state" ? 1 : 0.6));
    const hit = tick.append("a").attr("href", (d) => `${stateUrl(d.s.slug)}#doc-${encodeURIComponent(d.doc[0])}`)
      .attr("aria-label", (d) => `${d.s.name}, ${fmtDateShort(d.doc[1])}: ${d.doc[4] || SRC_NAME[d.doc[2]]}`)
      .append("rect").attr("class", "hit").attr("x", -3).attr("width", 6).attr("height", rowH);
    hover(hit, (d) => `<div class="t">${esc(d.s.name)} · ${fmtDateShort(d.doc[1])}</div><div>${esc(d.doc[4] || SRC_NAME[d.doc[2]])}</div><div class="dim">${esc(d.doc[3] || "")}</div>`, {
      enter() { d3.select(this.parentNode.parentNode).select("line").attr("stroke-width", 3).attr("opacity", 1); },
      leave(d) { d3.select(this.parentNode.parentNode).select("line").attr("stroke-width", d.doc[2] === "state" ? 2 : 1.25).attr("opacity", d.doc[2] === "state" ? 1 : 0.6); },
    });
  };
  seg($("rec-sort"), [["name", "A to Z"], ["docs", "Most state documents"]], sort, (v) => { sort = v; draw(); });
  responsive(el, draw);
  const c = site.counts;
  $("counts").innerHTML = [
    [fmtInt(c.open_values), "values from state and MoSPI documents"],
    [fmtInt(c.state_docs), "state government documents"],
    [fmtInt(c.state_publishers), "state governments with their own releases"],
    [fmtInt(c.rbi_values), `RBI Handbook values, in ${c.rbi_editions} editions`],
    [fmtInt(c.states), "states and union territories"],
  ].map(([n, t]) => `<dt>${n}</dt><dd>${t}</dd>`).join("");
  $("rec-source").innerHTML = sourceNote([
    `Documents in the database, dated by when each first became public; ${fmtInt(all.length)} dated state-document pairs. The right-hand column counts each state’s own documents. Undated documents are not drawn.`,
    `${NOTE.rbi} ${NOTE.mospi}`,
  ]);
}

// ================= 02 the two-year rule =================
function twoYear(two) {
  const el = $("maturity");
  let field = "corr";
  const draw = () => {
    maturityChart(el, { rows: two.maturity, field });
    $("mat-title").textContent = field === "corr" ? "Agreement with the latest figure, by age of the estimate" : "Size of later revisions, by age of the estimate";
    $("mat-unit").textContent = field === "corr" ? "Cross-state correlation between estimates of that age and the latest figure" : "Root-mean-square revision still to come, percentage points";
  };
  seg($("mat-seg"), [["corr", "Agreement with latest"], ["rms", "Size of later revisions"]], field, (v) => { field = v; draw(); });
  responsive(el, draw);
  const h = two.headline;
  $("mat-source").innerHTML = sourceNote([
    `Paper’s 20-state real-time panel; growth in constant 2011–12 prices. Age is measured from the end of the fiscal year.`,
    `Revision of states’ early estimates, first to latest (${fmtInt(h.n)} state-years, ${fmtInt(h.states)} states): mean ${fmtPp(h.mean)}; mean absolute ${fmtNum(h.mae, 2)} pp; root mean square ${fmtNum(h.rmse, 2)} pp; ${fmtNum(h.gt2 * 100, 0)}% larger than 2 pp.`,
    `${NOTE.rbi} ${NOTE.mospi}`,
  ]);
}

// ================= 03 the league table =================
function league(site) {
  const el = $("slope");
  const names = Object.fromEntries(site.states.filter((s) => s.type === "state").map((s) => [s.code, { name: s.name, slug: s.slug }]));
  const years = site.fiscal_years.filter((f) => site.cells.filter((c) => c.fy === f && names[c.s] && c.r !== 0).length >= 10);
  let year = years.includes("2018-19") ? "2018-19" : years.at(-1);
  fillSelect($("slope-fy"), years.map((f) => [f, fy(f)]), year);
  const draw = () => slopeChart(el, {
    rows: rankRows(site.cells.filter((c) => c.fy === year), names), title: `States ranked by growth in ${fy(year)}: first published against latest`,
    onPick: (d) => (location.href = stateUrl(d.slug, `fy=${year}`)),
  });
  $("slope-fy").addEventListener("change", (e) => { year = e.target.value; draw(); });
  responsive(el, draw);
  $("slope-source").innerHTML = sourceNote([
    `First published and latest estimates of real GSDP growth for each state (union territories left out). Ranks are computed within the year, highest growth first. ${NOTE.growth}`,
    `${NOTE.state} ${NOTE.rbi} ${NOTE.mospi}`,
  ]);
}

// ================= 04 money =================
const AWARDS = [
  ["fc15_final", "15th, final", "15th Finance Commission, final award (2021–26)", "2021–26, five years"],
  ["fc15_interim", "15th, interim", "15th Finance Commission, interim award (2020–21)", "2020–21, one year"],
  ["fc16", "16th, so far", "16th Finance Commission (from 2026–27)", "2026–27 budget estimate, one year"],
];
function money(m, site) {
  const el = $("money");
  const slug = Object.fromEntries(site.states.map((s) => [s.name, s.slug]));
  let award = "fc15_final";
  const draw = () => {
    const sum = m.summary.find((s) => s.award === award), meta = AWARDS.find((a) => a[0] === award);
    const rows = m.by_state.filter((r) => r.award === award && r.base_vintage === sum.base_vintage).map((r) => ({ ...r, name: r.state, v: r.rs_crore })).sort((a, b) => b.v - a.v);
    $("money-total").textContent = fmtCr(sum.rs_crore_moved_total);
    $("money-def").textContent = `would have gone to different states (${meta[3]}): ${fmtNum(sum.share_moved_pp, 3)} percentage points of the pool.`;
    $("money-unit").textContent = `${meta[2]}; ₹ crore over the period`;
    divergingBars(el, {
      rows, fmt: (v) => fmtCrSigned(v).replace(" crore", ""), title: "Change in devolution by state, rupees crore",
      tipHtml: (r) => `<div class="t">${esc(r.name)}</div><table><tr><td>Share as awarded</td><td>${fmtNum(r.share_pct_base, 3)}%</td></tr>
        <tr><td>Share with revised GSDP</td><td>${fmtNum(r.share_pct_cf, 3)}%</td></tr><tr><td>Change</td><td>${fmtPp(r.dpp, 3)}</td></tr>
        <tr><td>Amount</td><td>${fmtCrSigned(r.rs_crore)}</td></tr></table>`,
      onPick: (r) => (location.href = stateUrl(slug[r.name]) + "#finance-commission"),
    });
    $("money-source").innerHTML = sourceNote([
      `Each state’s share recomputed with the Commission’s GSDP figures (vintage ${esc(sum.base_vintage)}) replaced by the latest vintage; every other input as published. ${NOTE.devolution}`,
      NOTE.rbi + " " + NOTE.mospi,
    ]);
  };
  seg($("money-seg"), AWARDS.map((a) => [a[0], a[1]]), award, (v) => { award = v; draw(); });
  responsive(el, draw);
}

// ================= 05 use it =================
function useIt() {
  $("use").innerHTML = [
    ["data/", "Download the data", "Every vintage as CSV, with the codebook and validation notes"],
    ["paper/", "Read the paper", "The working paper, its figures and how to cite it"],
    ["calculator/", "Use the calculator", "Change a state’s GSDP and recompute a Finance Commission’s shares"],
  ].map(([href, t, d]) => `<a href="${ROOT}${href}"><span class="t-chart">${t}</span><span class="small">${d}</span>${icon("arrow")}</a>`).join("");
  $("cite-text").textContent = CITE;
  copyButton($("cite-copy"), () => CITE);
}

// ================= start =================
useIt();
Promise.all([loadSite(), loadJSON("data/asof.json")]).then(([site, asof]) => {
  opening(site, asof).catch((e) => failed($("map"), e));
  record(site, asof);
  league(site);
  loadJSON("data/money.json").then((m) => money(m, site)).catch((e) => failed($("money"), e));
}).catch((e) => failed($("map"), e));
loadJSON("data/two_year.json").then(twoYear).catch((e) => failed($("maturity"), e));
