// The two-year rule: the maturity curve, the size of revisions, every state-year as a dot, and the revision matrix.
import {
  d3, loadJSON, loadSite, failed, fy, fmtPct, fmtPp, fmtNum, fmtInt, fmtSigned, fmtDateShort, esc, css,
  diverging, fillSelect, sourceNote, responsive, stateUrl, NOTE, SRC_NAME, MINUS,
} from "../core.js";
import { T, frame, yGrid, xGrid, pad, hover, pctTick, maturityChart } from "../charts.js";

const $ = (id) => document.getElementById(id);
const REV_MAX = 4; // pp at which the diverging scale saturates, as on the homepage map
const SOURCES = `${NOTE.state} ${NOTE.rbi} ${NOTE.mospi}`;

const scaleLegend = (scale, extra = "") => `<span class="scale">${MINUS}${REV_MAX} pp<i style="background:${scale.gradient()}"></i>+${REV_MAX} pp</span>
  <span>Revision: latest minus first published</span>${extra}`;

/** One tab stop for a set of nodes; the arrow keys, Home and End move between them. */
function rove(nodes) {
  const to = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  nodes.forEach((n, i) => {
    n.setAttribute("tabindex", i === 0 ? "0" : "-1");
    n.addEventListener("keydown", (e) => {
      const j = e.key === "Home" ? 0 : e.key === "End" ? nodes.length - 1 : e.key in to ? i + to[e.key] : -1;
      if (!nodes[j] || j === i) return;
      e.preventDefault();
      n.setAttribute("tabindex", "-1");
      nodes[j].setAttribute("tabindex", "0");
      nodes[j].focus();
    });
  });
}

// ================= the maturity curve: two charts on one age axis =================
function maturity(two) {
  const a = $("mat-corr"), b = $("mat-rms");
  // Pointing at an age in one chart marks the same age in the other.
  const link = (from, to) => from.querySelectorAll("circle.hit").forEach((hit, i) => {
    const mark = (on) => to.querySelectorAll("circle.hit")[i]?.parentNode.classList.toggle("is-linked", on);
    hit.addEventListener("pointerenter", () => mark(true));
    hit.addEventListener("pointerleave", () => mark(false));
    hit.addEventListener("focus", () => mark(true));
    hit.addEventListener("blur", () => mark(false));
  });
  responsive(a, () => { maturityChart(a, { rows: two.maturity, field: "corr", height: 300 }); link(a, b); });
  responsive(b, () => { maturityChart(b, { rows: two.maturity, field: "rms", height: 300 }); link(b, a); });
  const panel = "Paper’s 20-state real-time panel; real GSDP growth in constant 2011–12 prices. Age is measured from the end of the fiscal year.";
  $("mat-corr-source").innerHTML = sourceNote([
    `${panel} Each point is the correlation across states between estimates of that age and the latest figure. Estimates 36 months old or more are the comparison point.`,
    `${NOTE.rbi} ${NOTE.mospi}`,
  ]);
  $("mat-rms-source").innerHTML = sourceNote([
    `${panel} Each point is the root-mean-square gap between estimates of that age and the latest figure.`,
    `${NOTE.rbi} ${NOTE.mospi}`,
  ]);

  const h = two.headline;
  $("headline").innerHTML = [
    [fmtPp(h.mean), "Mean revision"],
    [`${fmtNum(h.mae, 2)} pp`, "Mean absolute revision"],
    [`${fmtNum(h.rmse, 2)} pp`, "Root-mean-square revision"],
    [`${fmtNum(h.gt2 * 100, 0)}%`, "Share of revisions larger than 2 pp"],
    [fmtInt(h.n), `State-years in the sample, in ${fmtInt(h.states)} states`],
  ].map(([n, t]) => `<div><p class="num-lg">${n}</p><p class="small">${t}</p></div>`).join("");
  $("headline-source").innerHTML = sourceNote([
    `Paper’s panel: state governments’ own early estimates of real GSDP growth against the latest figure for the same year. A revision is the latest figure minus the first published one.`,
    SOURCES,
  ]);
}

// ================= first published against latest: one dot per state-year =================
function scatter(site) {
  const el = $("scatter");
  const byCode = Object.fromEntries(site.states.map((s) => [s.code, s]));
  const all = site.cells.filter((c) => c.f != null && c.l != null && c.n > 1 && byCode[c.s])
    .map((c) => ({ ...c, name: byCode[c.s].name, slug: byCode[c.s].slug }))
    .sort((a, b) => a.fy.localeCompare(b.fy) || a.name.localeCompare(b.name));
  const years = site.fiscal_years.filter((f) => all.some((c) => c.fy === f));
  let year = "";
  fillSelect($("sc-fy"), [["", "All years"], ...years.map((f) => [f, fy(f)])], year);
  const domain = d3.scaleLinear().domain(pad(d3.extent(all.flatMap((c) => [c.f, c.l])), 0.04)).nice().domain();

  const tipHtml = (d) => `<div class="t">${esc(d.name)} · ${fy(d.fy)}</div><table>
    <tr><td>First published</td><td>${fmtPct(d.f, 2)}</td></tr>
    <tr><td>Latest</td><td>${fmtPct(d.l, 2)}</td></tr>
    <tr><td>Revision</td><td>${fmtPp(d.r)}</td></tr></table>
    <div class="dim">First: ${SRC_NAME[d.fs]}, ${fmtDateShort(d.fd)}</div>
    <div class="dim">Latest: ${SRC_NAME[d.ls]}, ${fmtDateShort(d.ld)}</div>
    <div class="dim">${d.n} published estimates${d.t ? "; documents dated the same day differ" : ""}</div>`;

  const draw = () => {
    const narrow = el.clientWidth < 560, scale = diverging(REV_MAX);
    const shown = year ? all.filter((c) => c.fy === year) : all;
    const { g, w, h } = frame(el, narrow ? 360 : 540, { t: 26, r: 12, b: 46, l: 44 },
      "Scatter of first-published growth against the latest figure, one dot per state and fiscal year");
    const x = d3.scaleLinear().domain(domain).range([0, w]);
    const y = d3.scaleLinear().domain(domain).range([h, 0]);
    yGrid(g, y, w, pctTick, narrow ? 5 : 8);
    xGrid(g, x, h, pctTick, narrow ? 5 : 10);
    g.append("line").attr("class", "zero").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", h);
    g.append("text").attr("class", "anno").attr("x", -44).attr("y", -12).text("Latest growth");
    g.append("text").attr("class", "anno").attr("x", w).attr("y", h + 40).attr("text-anchor", "end").text("First published growth");
    // the 45° line: latest equals first published
    g.append("line").attr("class", "rule").attr("x1", x(domain[0])).attr("y1", y(domain[0])).attr("x2", x(domain[1])).attr("y2", y(domain[1]));
    g.append("text").attr("class", "anno strong").attr("x", 8).attr("y", 14).text("Revised up");
    g.append("text").attr("class", "anno strong").attr("x", w - 8).attr("y", h - 10).attr("text-anchor", "end").text("Revised down");
    g.append("text").attr("class", "anno").attr("x", w - 8).attr("y", 14).attr("text-anchor", "end").text("On the line: not revised");
    if (year) {
      g.append("g").attr("pointer-events", "none").selectAll("circle").data(all.filter((c) => c.fy !== year)).join("circle")
        .attr("cx", (d) => x(d.f)).attr("cy", (d) => y(d.l)).attr("r", 1.75).attr("fill", css("border-strong")).attr("opacity", 0.45);
    }
    const r = narrow ? 3.5 : 4.5;
    const dots = g.append("g").selectAll("circle").data(shown).join("circle").attr("class", "dot")
      .attr("cx", (d) => x(d.f)).attr("cy", (d) => y(d.l)).attr("r", r)
      .attr("fill", (d) => scale(d.r)).attr("stroke", css("border-strong")).attr("stroke-width", 0.75)
      .attr("role", "link")
      .attr("aria-label", (d) => `${d.name}, ${fy(d.fy)}: first published ${fmtPct(d.f, 2)}, latest ${fmtPct(d.l, 2)}`);
    hover(dots, tipHtml, {
      enter() { d3.select(this).attr("stroke", css("ink")).attr("stroke-width", 2).attr("r", r + 1.5); },
      leave() { d3.select(this).attr("stroke", css("border-strong")).attr("stroke-width", 0.75).attr("r", r); },
    });
    const open = (d) => (location.href = stateUrl(d.slug, `fy=${d.fy}`));
    dots.on("click", (ev, d) => open(d)).on("keydown.open", (ev, d) => { if (ev.key === "Enter") open(d); });
    rove(dots.nodes());
    $("sc-unit").textContent = `Real GSDP growth, per cent; one dot per state and fiscal year, ${fmtInt(shown.length)} shown${year ? ` for ${fy(year)}` : ""}`;
    $("sc-legend").innerHTML = scaleLegend(scale);
  };
  $("sc-fy").addEventListener("change", (e) => { year = e.target.value; draw(); });
  responsive(el, draw);
  $("sc-source").innerHTML = sourceNote([
    `Every state, union territory and fiscal year in the database with more than one published estimate. First published is the earliest dated estimate (projections published before 1 October of the year are left out); latest is the newest. The arrow keys move between dots; Enter opens the state. The paper’s statistics come from its own panel and are not recomputed from these dots.`,
    NOTE.growth,
    SOURCES,
  ]);
}

// ================= the revision matrix =================
function matrix(site) {
  const el = $("matrix"), sel = $("mx-sort");
  const years = site.fiscal_years;
  const byCode = Object.fromEntries(site.states.map((s) => [s.code, s]));
  const cell = new Map(site.cells.map((c) => [`${c.s}|${c.fy}`, c]));
  const rev = (s, f) => { const c = cell.get(`${s.code}|${f}`); return c && c.n > 1 ? c.r : null; };
  let sort = ""; // "" for names, or a fiscal year
  fillSelect(sel, [["", "Name, A to Z"], ...years.map((f) => [f, `Revision in ${fy(f)}`])], sort);

  const lum = (col) => {
    const { r, g, b } = d3.rgb(col), f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };

  function draw() {
    const scale = diverging(REV_MAX);
    const inks = [css("ink"), css("ink-inverse")].map((c) => [c, lum(c)]);
    /** The ink with the stronger contrast on a shaded cell. */
    const on = (bg) => {
      const L = lum(bg), ratio = ([, l]) => (Math.max(L, l) + 0.05) / (Math.min(L, l) + 0.05);
      return (ratio(inks[0]) >= ratio(inks[1]) ? inks[0] : inks[1])[0];
    };
    const rows = [...site.states].sort((a, b) => {
      if (sort) {
        const va = rev(a, sort), vb = rev(b, sort);
        if (va == null !== (vb == null)) return va == null ? 1 : -1;
        if (va != null && va !== vb) return vb - va;
      }
      return a.name.localeCompare(b.name);
    });
    const td = (s, f, ri, ci) => {
      const c = cell.get(`${s.code}|${f}`);
      if (!c) return '<td class="mx-none"></td>';
      const at = `href="${stateUrl(s.slug, `fy=${f}`)}" data-k="${s.code}|${f}" data-r="${ri}" data-c="${ci}" tabindex="-1"`;
      if (c.n < 2) return `<td class="mx"><a class="one" ${at} aria-label="${esc(s.name)}, ${fy(f)}: one estimate only, ${fmtPct(c.f, 2)}">·</a></td>`;
      const v = Math.round(c.r * 10) / 10, bg = scale(c.r);
      return `<td class="mx" style="background:${bg}"><a ${at} style="color:${on(bg)}" aria-label="${esc(s.name)}, ${fy(f)}: revision ${fmtPp(c.r)}">${v === 0 ? "0.0" : fmtSigned(v, 1)}</a></td>`;
    };
    el.innerHTML = `<table class="tbl matrix">
      <caption class="sr">Revision of real GSDP growth, latest minus first published, in percentage points. One row for each state or union territory, one column for each fiscal year. The arrow keys move between cells.</caption>
      <thead><tr><th scope="col" class="sticky-col"><span class="mx-name">State or union territory</span></th>${years.map((f) =>
        `<th scope="col" class="num"${f === sort ? ' aria-sort="descending"' : ""}><button type="button" data-sort="${f}" aria-label="Sort rows by the revision in ${fy(f)}">${fy(f)}</button></th>`).join("")}</tr></thead>
      <tbody>${rows.map((s, ri) => `<tr><th scope="row" class="sticky-col"><a class="mx-name" href="${stateUrl(s.slug)}" title="${esc(s.name)}" data-r="${ri}" data-c="-1" tabindex="-1">${esc(s.name)}</a></th>${years.map((f, ci) => td(s, f, ri, ci)).join("")}</tr>`).join("")}</tbody></table>`;
    const first = el.querySelector("a[data-r]");
    if (first) first.tabIndex = 0;
    $("mx-legend").innerHTML = scaleLegend(scale, "<span>· one estimate only</span><span>blank: no estimate</span>");
  }

  const setSort = (v) => { sort = v; sel.value = v; draw(); };
  sel.addEventListener("change", (e) => setSort(e.target.value));
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-sort]");
    if (!b) return;
    const f = b.dataset.sort;
    setSort(f === sort ? "" : f);
    el.querySelector(`button[data-sort="${f}"]`)?.focus(); // the table was redrawn: keep the place
  });

  // tooltip on hover and focus
  const tipHtml = (k) => {
    const c = cell.get(k), head = `<div class="t">${esc(byCode[c.s].name)} · ${fy(c.fy)}</div>`;
    if (c.n < 2) return `${head}<table><tr><td>Only estimate</td><td>${fmtPct(c.f, 2)}</td></tr></table><div class="dim">${SRC_NAME[c.fs]}, ${fmtDateShort(c.fd)}</div>`;
    return `${head}<table><tr><td>First published</td><td>${fmtPct(c.f, 2)}</td></tr><tr><td>Latest</td><td>${fmtPct(c.l, 2)}</td></tr>
      <tr><td>Revision</td><td>${fmtPp(c.r)}</td></tr></table>
      <div class="dim">First: ${SRC_NAME[c.fs]}, ${fmtDateShort(c.fd)}</div><div class="dim">Latest: ${SRC_NAME[c.ls]}, ${fmtDateShort(c.ld)}</div>
      <div class="dim">${c.n} published estimates${c.t ? "; documents dated the same day differ" : ""}</div>`;
  };
  const dataCell = (e) => e.target.closest?.("a[data-k]");
  el.addEventListener("pointerover", (e) => { const a = dataCell(e); if (a) T.show(tipHtml(a.dataset.k), e); });
  el.addEventListener("pointermove", (e) => { if (dataCell(e)) T.move(e); });
  el.addEventListener("pointerout", (e) => { if (dataCell(e)) T.hide(); });
  el.addEventListener("focusin", (e) => { const a = dataCell(e); if (a) T.at(tipHtml(a.dataset.k), a); });
  el.addEventListener("focusout", () => T.hide());

  // one tab stop for the whole grid; the arrow keys move between cells, skipping blanks
  el.addEventListener("keydown", (e) => {
    const a = e.target.closest?.("a[data-r]");
    const d = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[e.key];
    if (!a || !d) return;
    e.preventDefault();
    let r = +a.dataset.r + d[0], c = +a.dataset.c + d[1], next = null;
    while (r >= 0 && r < site.states.length && c >= -1 && c < years.length) {
      next = el.querySelector(`a[data-r="${r}"][data-c="${c}"]`);
      if (next) break;
      r += d[0]; c += d[1];
    }
    if (!next) return;
    a.tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
  });

  draw();
  window.addEventListener("themechange", draw);
  $("mx-source").innerHTML = sourceNote([
    `First published and latest estimates of real GSDP growth for every state, union territory and fiscal year in the database; the first is the earliest dated estimate, projections published before 1 October of the year left out. Shading uses the same scale as the map on the homepage and saturates at ${REV_MAX} percentage points. Select a cell to open that state at that year.`,
    NOTE.growth,
    SOURCES,
  ]);
}

// ================= start =================
loadJSON("data/two_year.json").then(maturity).catch((e) => failed($("mat-corr"), e));
loadSite().then((site) => { scatter(site); matrix(site); }).catch((e) => { failed($("scatter"), e); failed($("matrix"), e); });
