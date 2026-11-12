// ITIHAS website: chart primitives, drawn with D3 as plain SVG and redrawn to the container's width.
// Rules: hairline grid, no chart border, mono tick labels, direct labels, grey for history and ink for now.
import { d3, css, fy, fmtNum, fmtPct, fmtPp, fmtDateShort, esc, tip, vintageColour, srcColour, SRC_NAME, MINUS, day } from "./core.js";

export const T = tip();
export const pctTick = (v) => (v < 0 ? MINUS : "") + Math.abs(v) + "%";

export function frame(el, height, m, label) {
  el.innerHTML = "";
  const width = Math.max(260, el.clientWidth);
  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);
  if (label) svg.attr("role", "img").attr("aria-label", label);
  const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
  return { svg, g, w: width - m.l - m.r, h: height - m.t - m.b, width };
}
export function yGrid(g, y, w, fmt = pctTick, ticks = 5) {
  const ax = g.append("g").attr("class", "axis grid").call(d3.axisLeft(y).ticks(ticks).tickSize(-w).tickFormat(fmt));
  ax.selectAll("text").attr("x", -8);
  const [a, b] = y.domain();
  if (a < 0 && b > 0) g.append("line").attr("class", "zero").attr("x1", 0).attr("x2", w).attr("y1", y(0)).attr("y2", y(0));
  return ax;
}
export function xGrid(g, x, h, fmt, ticks = 5) {
  const ax = g.append("g").attr("class", "axis grid").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).ticks(ticks).tickSize(-h).tickFormat(fmt));
  ax.selectAll("text").attr("y", 8);
  return ax;
}
export const pad = ([a, b], frac = 0.08, zero = false) => {
  if (zero) { a = Math.min(a, 0); b = Math.max(b, 0); }
  const p = (b - a || 1) * frac;
  return [a - p, b + p];
};
/** Tooltip on hover, tap and keyboard focus. html: (datum) => string. */
export function hover(sel, html, { enter, leave } = {}) {
  sel.on("pointerenter pointermove pointerdown", function (ev, d) { T.show(html(d), ev); enter?.call(this, d); })
    .on("pointerleave", function (ev, d) { T.hide(); leave?.call(this, d); })
    .on("focus", function (ev, d) { T.at(html(d), this); enter?.call(this, d); })
    .on("blur", function (ev, d) { T.hide(); leave?.call(this, d); });
  return sel;
}

// ---------- the maturity curve ----------
const AGE_LABEL = { "before FY end": "Before year end", "0-6": "0–6", "6-12": "6–12", "12-24": "12–24", "24-36": "24–36", "36+": "36+" };
/** rows: two_year.json maturity[]; field: "corr" (agreement with the latest figure) or "rms" (size of later revisions, pp). */
export function maturityChart(el, { rows, field = "corr", height = 320 }) {
  const narrow = el.clientWidth < 520;
  const { g, w, h } = frame(el, height, { t: 28, r: 16, b: 46, l: 40 },
    field === "corr" ? "Correlation of estimates with the latest figure, by age of the estimate" : "Root-mean-square later revision, by age of the estimate");
  const x = d3.scalePoint().domain(rows.map((d) => d.age)).range([0, w]).padding(0.35);
  const y = d3.scaleLinear().domain(field === "corr" ? [0, 1] : [0, Math.ceil(d3.max(rows, (d) => d.rms))]).range([h, 0]);
  yGrid(g, y, w, (v) => (field === "corr" ? fmtNum(v, 1) : v), 5);
  g.append("g").attr("class", "axis").attr("transform", `translate(0,${h + 10})`).call(d3.axisBottom(x).tickSize(0).tickFormat((d) => (narrow && d === "before FY end" ? "Before" : AGE_LABEL[d])));
  g.append("text").attr("class", "anno").attr("x", 0).attr("y", h + 42).text("Months after the fiscal year ended");
  // the two-year rule
  const rx = (x("12-24") + x("24-36")) / 2;
  g.append("line").attr("class", "rule").attr("x1", rx).attr("x2", rx).attr("y1", -14).attr("y2", h);
  g.append("text").attr("class", "anno strong").attr("x", rx + 6).attr("y", -6).text("24 months");
  const line = d3.line().x((d) => x(d.age)).y((d) => y(d[field]));
  g.append("path").attr("fill", "none").attr("stroke", css("vintage-1")).attr("stroke-width", 1.25).attr("d", line(rows.slice(0, 4)));
  g.append("path").attr("fill", "none").attr("stroke", css("vintage-1")).attr("stroke-width", 1.25).attr("stroke-dasharray", "2 3").attr("d", line(rows.slice(3, 5)));
  g.append("path").attr("fill", "none").attr("stroke", css("ink")).attr("stroke-width", 2.5).attr("d", line(rows.slice(4)));
  const pts = g.append("g").selectAll("g").data(rows).join("g").attr("transform", (d) => `translate(${x(d.age)},${y(d[field])})`);
  pts.append("circle").attr("r", 4.5).attr("fill", (d, i) => (i >= 4 ? css("ink") : css("surface"))).attr("stroke", (d, i) => (i >= 4 ? css("ink") : css("vintage-2"))).attr("stroke-width", 1.5);
  pts.append("text").attr("class", "val").attr("text-anchor", "middle").attr("y", (d) => (field === "rms" && d.age === "36+" ? -12 : -12))
    .attr("fill", (d, i) => (i >= 4 ? css("ink") : null)).style("font-weight", (d, i) => (i === 3 || i === 4 ? 500 : 400)).text((d) => fmtNum(d[field], 2));
  hover(pts.append("circle").attr("r", 22).attr("class", "hit").attr("tabindex", 0).attr("aria-label", (d) => `${AGE_LABEL[d.age]}: ${fmtNum(d[field], 2)}`), (d) =>
    `<div class="t">${AGE_LABEL[d.age]}${d.age === "before FY end" ? "" : " months"}</div><table>
      <tr><td>Correlation with latest</td><td>${fmtNum(d.corr, 2)}</td></tr>
      <tr><td>RMS later revision</td><td>${fmtNum(d.rms, 2)} pp</td></tr>
      <tr><td>Estimates</td><td>${d.n}</td></tr><tr><td>States</td><td>${d.states}</td></tr></table>`);
}

// ---------- slope chart: rank at first print against rank today ----------
/** Rank rows (by growth, highest first) within one fiscal year. cells: [{s, f, l}], names: code -> {name, slug}. */
export function rankRows(cells, names) {
  const rows = cells.filter((c) => c.f != null && c.l != null && names[c.s]).map((c) => ({ code: c.s, ...names[c.s], f: c.f, l: c.l, r: c.r }));
  const rank = (key) => [...rows].sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name)).forEach((d, i) => (d["r" + key] = i + 1));
  rank("f"); rank("l");
  return rows;
}
export const slopeColour = (d) => (d.rl <= d.rf - 3 ? css("data-blue") : d.rl >= d.rf + 3 ? css("data-red") : css("vintage-1"));
/** rows from rankRows(). compact: no labels (thumbnails, small multiples). */
export function slopeChart(el, { rows, compact = false, onPick, title }) {
  const n = rows.length;
  if (!n) { el.innerHTML = '<p class="empty">No state has both a first and a latest figure for this year.</p>'; return; }
  const narrow = el.clientWidth < 560;
  const rowH = compact ? Math.max(3, Math.min(6, 120 / n)) : 18;
  const side = compact ? 4 : narrow ? 112 : 200;
  const { g, w, h } = frame(el, n * rowH + (compact ? 8 : 40), { t: compact ? 4 : 30, r: side, b: compact ? 4 : 10, l: side }, title);
  const y = (r) => (r - 0.5) * rowH;
  if (!compact) {
    g.append("text").attr("class", "anno strong").attr("x", 0).attr("y", -14).attr("text-anchor", "end").text("First published");
    g.append("text").attr("class", "anno strong").attr("x", w).attr("y", -14).text("Latest");
  }
  const row = g.selectAll("g.s").data(rows).join("g").attr("class", "s");
  row.append("line").attr("x1", 0).attr("x2", w).attr("y1", (d) => y(d.rf)).attr("y2", (d) => y(d.rl))
    .attr("stroke", slopeColour).attr("stroke-width", compact ? 1 : 1.5).attr("stroke-linecap", "round");
  if (compact) return;
  row.append("circle").attr("cx", 0).attr("cy", (d) => y(d.rf)).attr("r", 2.5).attr("fill", slopeColour);
  row.append("circle").attr("cx", w).attr("cy", (d) => y(d.rl)).attr("r", 2.5).attr("fill", slopeColour);
  const lab = (d, key) => (narrow ? d.name : `${d.name}  ${fmtPct(d[key])}`);
  row.append("text").attr("class", "lbl").attr("x", -10).attr("y", (d) => y(d.rf) + 4).attr("text-anchor", "end").text((d) => lab(d, "f"));
  row.append("text").attr("class", "lbl").attr("x", w + 10).attr("y", (d) => y(d.rl) + 4).text((d) => lab(d, "l"));
  // wide invisible lines to make thin slopes easy to point at
  const hit = row.append("line").attr("x1", -side).attr("x2", w + side).attr("y1", (d) => y(d.rf)).attr("y2", (d) => y(d.rl))
    .attr("stroke", "transparent").attr("stroke-width", rowH).style("cursor", onPick ? "pointer" : null)
    .attr("tabindex", 0).attr("role", onPick ? "link" : null)
    .attr("aria-label", (d) => `${d.name}: rank ${d.rf} at first print, rank ${d.rl} now`);
  const focus = (d) => {
    row.classed("fade", (o) => o !== d);
    row.filter((o) => o === d).select("line").attr("stroke-width", 2.5);
  };
  const blur = () => { row.classed("fade", false).select("line").attr("stroke-width", 1.5); };
  hover(hit, (d) => `<div class="t">${esc(d.name)}</div><table>
      <tr><td>First published</td><td>${fmtPct(d.f, 2)}</td><td class="dim">rank ${d.rf}</td></tr>
      <tr><td>Latest</td><td>${fmtPct(d.l, 2)}</td><td class="dim">rank ${d.rl}</td></tr></table>`, { enter: focus, leave: blur });
  if (onPick) hit.on("click", (ev, d) => onPick(d)).on("keydown", (ev, d) => { if (ev.key === "Enter") onPick(d); });
}

// ---------- diverging bars, one per state ----------
/**
 * rows: [{name, v, ...}] in the order to draw. fmt(v) labels the bar end; tipHtml(row) fills the tooltip.
 * highlight: a name to mark; max: fixed scale maximum (so two charts can share a scale).
 */
export function divergingBars(el, { rows, fmt, tipHtml, highlight, onPick, max, title, rowH = 20 }) {
  const narrow = el.clientWidth < 560;
  const labW = narrow ? 118 : 168, valW = narrow ? 58 : 76;
  const { g, w, h } = frame(el, rows.length * rowH + 8, { t: 4, r: 4, b: 4, l: labW }, title);
  const m = max ?? (d3.max(rows, (d) => Math.abs(d.v)) || 1);
  const x = d3.scaleLinear().domain([-m, m]).range([valW, w - valW]);
  g.append("line").attr("class", "zero").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", h);
  const row = g.selectAll("g.r").data(rows).join("g").attr("class", "r").attr("transform", (d, i) => `translate(0,${i * rowH})`);
  row.append("text").attr("class", "lbl").attr("x", -labW).attr("y", rowH / 2 + 4)
    .style("font-weight", (d) => (d.name === highlight ? 600 : null)).attr("fill", (d) => (d.name === highlight ? css("ink") : null)).text((d) => d.name);
  row.append("rect").attr("x", (d) => Math.min(x(0), x(d.v))).attr("width", (d) => Math.max(1, Math.abs(x(d.v) - x(0))))
    .attr("y", 3).attr("height", rowH - 6).attr("rx", 1.5).attr("fill", (d) => (d.v >= 0 ? css("data-blue") : css("data-red")))
    .attr("opacity", (d) => (highlight && d.name !== highlight ? 0.55 : 1));
  row.append("text").attr("class", "val").attr("y", rowH / 2 + 4)
    .attr("x", (d) => (d.v >= 0 ? x(d.v) + 6 : x(d.v) - 6)).attr("text-anchor", (d) => (d.v >= 0 ? "start" : "end")).text((d) => fmt(d.v));
  const hit = row.append("rect").attr("class", "hit").attr("x", -labW).attr("width", w + labW).attr("height", rowH)
    .style("cursor", onPick ? "pointer" : "default").attr("tabindex", 0).attr("aria-label", (d) => `${d.name}: ${fmt(d.v)}`);
  hover(hit, tipHtml, {
    enter() { d3.select(this.parentNode).select("text.lbl").attr("fill", css("ink")); },
    leave(d) { d3.select(this.parentNode).select("text.lbl").attr("fill", d.name === highlight ? css("ink") : null); },
  });
  if (onPick) hit.on("click", (ev, d) => onPick(d)).on("keydown", (ev, d) => { if (ev.key === "Enter") onPick(d); });
}

// ---------- how one year settled: every estimate of one fiscal year, by publication date ----------
/**
 * points: [{date, v, src, title, how}] oldest first (dated, projections excluded).
 * fiscal: "2018-19". upto: optional ISO date; later points are drawn faint.
 */
export function settleChart(el, { points, fiscal, height = 260, upto, compact = false }) {
  if (!points.length) { el.innerHTML = '<p class="empty">No dated estimate of this year has been published.</p>'; return; }
  const { g, w, h } = frame(el, height, { t: 18, r: compact ? 14 : 64, b: 28, l: 40 }, `Estimates of growth in ${fy(fiscal)}, by date of publication`);
  const latest = points[points.length - 1], first = points[0];
  const endDay = day(`${+fiscal.slice(0, 4) + 1}-03-31`), ruleDay = endDay + 730;
  const d0 = Math.min(day(first.date), endDay) - 30, d1 = Math.max(day(latest.date), ruleDay) + 60;
  const x = d3.scaleLinear().domain([d0, d1]).range([0, w]);
  const y = d3.scaleLinear().domain(pad(d3.extent(points, (d) => d.v), 0.18)).nice(4).range([h, 0]);
  yGrid(g, y, w, pctTick, 4);
  const years = d3.range(Math.ceil((d0 + 3) / 365.25 + 1970), Math.floor(d1 / 365.25 + 1970) + 1);
  const step = Math.ceil(years.length / (w < 380 ? 4 : 8));
  g.append("g").attr("class", "axis").selectAll("text").data(years.filter((_, i) => i % step === 0)).join("text")
    .attr("x", (yr) => x(day(`${yr}-01-01`))).attr("y", h + 18).attr("text-anchor", "middle").text((yr) => yr);
  // 24 months after the year ended
  g.append("line").attr("class", "rule").attr("x1", x(ruleDay)).attr("x2", x(ruleDay)).attr("y1", -8).attr("y2", h);
  g.append("text").attr("class", "anno").attr("x", x(ruleDay) + 5).attr("y", -6).text(compact ? "24 months" : "24 months after the year ended");
  // the latest value, as a level to settle on
  g.append("line").attr("stroke", css("ink")).attr("stroke-width", 1).attr("stroke-dasharray", "1 3").attr("x1", 0).attr("x2", w).attr("y1", y(latest.v)).attr("y2", y(latest.v));
  if (!compact) g.append("text").attr("class", "val").attr("x", w + 6).attr("y", y(latest.v) + 4).attr("fill", css("ink")).text(`latest ${fmtPct(latest.v)}`);
  // what was known at each moment
  const path = d3.line().x((d) => x(day(d.date))).y((d) => y(d.v)).curve(d3.curveStepAfter);
  g.append("path").attr("fill", "none").attr("stroke", css("vintage-1")).attr("stroke-width", 1.25).attr("d", path([...points, { date: latest.date, v: latest.v }]));
  const dots = g.append("g").selectAll("circle").data(points).join("circle")
    .attr("cx", (d) => x(day(d.date))).attr("cy", (d) => y(d.v)).attr("r", 4.5)
    .attr("fill", (d) => srcColour(d.src)).attr("stroke", css("surface")).attr("stroke-width", 1.5)
    .attr("opacity", (d) => (upto && d.date > upto ? 0.2 : 1))
    .attr("tabindex", 0).attr("aria-label", (d) => `${fmtDateShort(d.date)}, ${SRC_NAME[d.src]}: ${fmtPct(d.v, 2)}`);
  hover(dots, (d) => `<div class="t">${fmtPct(d.v, 2)} <span class="dim">${fmtPp(d.v - latest.v)} against the latest</span></div>
    <div>${fmtDateShort(d.date)} · ${SRC_NAME[d.src]}</div>${d.title ? `<div class="dim">${esc(d.title)}</div>` : ""}${d.how ? `<div class="dim">${d.how === "printed" ? "Rate as printed" : "Computed from two levels in the document"}</div>` : ""}`);
  if (!compact && first !== latest) g.append("text").attr("class", "val").attr("x", x(day(first.date))).attr("y", y(first.v) + (first.v >= latest.v ? -10 : 18)).attr("text-anchor", "start").text(`first ${fmtPct(first.v)}`);
}

// ---------- every estimate: one line per release, the latest in ink ----------
/**
 * series: [{id, date, src, title, points: [{fy, v, proj}]}] oldest first; fiscalYears: x domain.
 * upto: index of the newest release to draw (the "as known on" position). fmtY: tick format; fmtV: value format.
 */
export function vintageChart(el, { series, fiscalYears, upto = series.length - 1, fmtY = pctTick, fmtV = (v) => fmtPct(v, 2), onPick, height, zero = true }) {
  const narrow = el.clientWidth < 560;
  const { g, w, h } = frame(el, height ?? (narrow ? 300 : 400), { t: 16, r: narrow ? 50 : 70, b: 30, l: 48 }, "Every published estimate, one line per release");
  const all = series.flatMap((s) => s.points);
  if (!all.length) { el.innerHTML = '<p class="empty">No figures for this selection.</p>'; return; }
  const x = d3.scalePoint().domain(fiscalYears).range([0, w]).padding(0.2);
  const y = d3.scaleLinear().domain(pad(d3.extent(all, (d) => d.v), 0.08, zero)).nice().range([h, 0]);
  yGrid(g, y, w, fmtY);
  const every = Math.ceil(fiscalYears.length / (narrow ? 4 : 8));
  g.append("g").attr("class", "axis").attr("transform", `translate(0,${h + 8})`).call(d3.axisBottom(x).tickSize(0).tickValues(fiscalYears.filter((_, i) => i % every === 0)).tickFormat(fy));
  const shown = series.slice(0, upto + 1), n = shown.length;
  const line = d3.line().x((d) => x(d.fy)).y((d) => y(d.v));
  const solid = (s) => s.points.filter((p) => !p.proj);
  const dashed = (s) => { const so = solid(s), pr = s.points.filter((p) => p.proj); return pr.length ? [...so.slice(-1), ...pr] : []; };
  const col = (d, i) => vintageColour(i, n), wid = (d, i) => (i === n - 1 ? 2.5 : 1.25);
  const grp = g.append("g").selectAll("g").data(shown).join("g");
  grp.append("path").attr("class", "solid").attr("fill", "none").attr("stroke", col).attr("stroke-width", wid).attr("stroke-linejoin", "round").attr("stroke-linecap", "round").attr("d", (s) => line(solid(s)));
  grp.append("path").attr("class", "dash").attr("fill", "none").attr("stroke", col).attr("stroke-width", 1.25).attr("stroke-dasharray", "3 3").attr("d", (s) => line(dashed(s)));
  grp.filter((s) => solid(s).length === 1).append("circle").attr("r", 2.5).attr("fill", col).attr("cx", (s) => x(solid(s)[0].fy)).attr("cy", (s) => y(solid(s)[0].v));
  const last = shown[n - 1], lp = solid(last).slice(-1)[0];
  if (lp) {
    g.append("circle").attr("cx", x(lp.fy)).attr("cy", y(lp.v)).attr("r", 3.5).attr("fill", css("ink"));
    g.append("text").attr("class", "val").attr("fill", css("ink")).attr("x", x(lp.fy) + 8).attr("y", y(lp.v) + 4).text(fmtV(lp.v));
  }
  const mark = g.append("circle").attr("r", 4).attr("fill", css("surface")).attr("stroke", css("accent-bright")).attr("stroke-width", 2).style("display", "none");
  const pts = shown.flatMap((s, i) => s.points.map((p) => ({ ...p, s, i })));
  const reset = () => { grp.select(".solid").attr("stroke", col).attr("stroke-width", wid); grp.select(".dash").attr("stroke", col); mark.style("display", "none"); T.hide(); };
  let cur = null;
  g.append("rect").attr("class", "hit").attr("width", w).attr("height", h).style("cursor", onPick ? "pointer" : "crosshair")
    .on("pointermove pointerdown", (ev) => {
      const [mx, my] = d3.pointer(ev);
      const best = d3.least(pts, (p) => (x(p.fy) - mx) ** 2 + (y(p.v) - my) ** 2);
      if (!best) return;
      cur = best.s;
      grp.select(".solid").attr("stroke", (d, i) => (d === best.s ? css("accent-bright") : col(d, i))).attr("stroke-width", (d, i) => (d === best.s ? 2.5 : wid(d, i)));
      grp.select(".dash").attr("stroke", (d, i) => (d === best.s ? css("accent-bright") : col(d, i)));
      grp.filter((d) => d === best.s).raise();
      mark.style("display", null).attr("cx", x(best.fy)).attr("cy", y(best.v)).raise();
      T.show(`<div class="t">${fy(best.fy)}: ${fmtV(best.v)}${best.proj ? ' <span class="dim">projection</span>' : ""}</div>
        <div>${fmtDateShort(best.s.date)} · ${SRC_NAME[best.s.src]}</div><div class="dim">${esc(best.s.title || "")}</div>`, ev);
    })
    .on("pointerleave", reset)
    .on("click", () => { if (onPick && cur) onPick(cur); });
}
