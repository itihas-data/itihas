// The league table: one year in full, every year in small, and the ranks as a table.
import {
  d3, loadSite, failed, fy, fmtNum, fmtSigned, esc, fillSelect, dataTable, sourceNote, responsive,
  getParam, setParams, stateUrl, reducedMotion, NOTE,
} from "../core.js";
import { slopeChart, rankRows, slopeColour } from "../charts.js";

const $ = (id) => document.getElementById(id);
const SOURCES = `${NOTE.state} ${NOTE.rbi} ${NOTE.mospi}`;
const MOVE = 3; // places: the threshold slopeColour() uses for blue and red

function run(site) {
  const el = $("slope"), sel = $("fy"), mult = $("multiples");
  // States only, as the Finance Commission's 28; the same years as the homepage offers.
  const names = Object.fromEntries(site.states.filter((s) => s.type === "state").map((s) => [s.code, { name: s.name, slug: s.slug }]));
  const nStates = Object.keys(names).length;
  const years = site.fiscal_years.filter((f) => site.cells.filter((c) => c.fy === f && names[c.s] && c.r !== 0).length >= 10);
  const rowsOf = Object.fromEntries(years.map((f) => [f, rankRows(site.cells.filter((c) => c.fy === f), names)]));
  let year = years.includes(getParam("fy")) ? getParam("fy") : years.includes("2018-19") ? "2018-19" : years.at(-1);
  fillSelect(sel, years.map((f) => [f, fy(f)]), year);

  // ---- one year ----
  const draw = () => {
    const rows = rowsOf[year];
    slopeChart(el, {
      rows, title: `States ranked by growth in ${fy(year)}: first published against latest`,
      onPick: (d) => (location.href = stateUrl(d.slug, `fy=${year}`)),
    });
    $("slope-title").textContent = `States ranked by growth in ${fy(year)}: first published against latest`;
    $("slope-unit").textContent = `Rank among the ${rows.length} states with both figures; real GSDP growth, per cent`;
    $("ranks-title").textContent = `Growth and rank in ${fy(year)}, first published and latest`;
  };

  // ---- the ranks ----
  const move = (r) => r.rf - r.rl;
  const table = dataTable($("ranks"), [
    { key: "name", label: "State", html: (r) => `<a href="${stateUrl(r.slug, `fy=${year}`)}">${esc(r.name)}</a>` },
    { key: "f", label: "First published", num: true, html: (r) => fmtNum(r.f, 2) },
    { key: "rf", label: "First-print rank", num: true },
    { key: "l", label: "Latest", num: true, html: (r) => fmtNum(r.l, 2) },
    { key: "rl", label: "Latest rank", num: true },
    { key: "move", label: "Change in rank", num: true, value: move, html: (r) => {
      const m = move(r);
      return m === 0 ? "0" : `<span${Math.abs(m) >= MOVE ? ` class="${m > 0 ? "up" : "down"}"` : ""}>${fmtSigned(m, 0)}</span>`;
    } },
  ], rowsOf[year], { sortKey: "rl", dir: 1, sticky: true });

  // ---- all years ----
  mult.innerHTML = years.map((f) => `<button type="button" class="multi" data-fy="${f}" aria-pressed="${f === year}" aria-label="Show ${fy(f)} in the chart above"><span class="mono">${fy(f)}</span><span class="multi-plot"></span></button>`).join("");
  /** Lines only, at one height for every year so a rank sits at the same place in each. */
  const mini = (box, rows) => {
    const w = Math.max(60, box.clientWidth), rowH = 4, h = nStates * rowH + 8;
    box.innerHTML = "";
    d3.select(box).append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("width", w).attr("height", h).attr("aria-hidden", "true")
      .append("g").attr("transform", "translate(4,4)").selectAll("line")
      .data([...rows].sort((a, b) => Math.abs(move(a)) - Math.abs(move(b)))).join("line")
      .attr("x1", 0).attr("x2", w - 8).attr("y1", (d) => (d.rf - 0.5) * rowH).attr("y2", (d) => (d.rl - 0.5) * rowH)
      .attr("stroke", slopeColour).attr("stroke-width", 1).attr("stroke-linecap", "round");
  };
  const drawAll = () => mult.querySelectorAll(".multi").forEach((b) => mini(b.querySelector(".multi-plot"), rowsOf[b.dataset.fy]));

  function setYear(f) {
    if (!years.includes(f) || f === year) return;
    year = f;
    sel.value = f;
    setParams({ fy: f });
    draw();
    table.update(rowsOf[f]);
    mult.querySelectorAll(".multi").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.fy === f)));
  }
  sel.addEventListener("change", (e) => setYear(e.target.value));
  sel.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setYear(years[years.indexOf(year) + (e.key === "ArrowRight" ? 1 : -1)]);
  });
  mult.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-fy]");
    if (!b) return;
    setYear(b.dataset.fy);
    $("one-year").scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    sel.focus({ preventScroll: true }); // the arrow keys then step through the years
  });

  responsive(el, draw);
  responsive(mult, drawAll);

  $("slope-source").innerHTML = sourceNote([
    `First published and latest estimates of real GSDP growth for each state (union territories left out). Ranks are computed within the year, highest growth first; states level on growth are ordered by name. ${NOTE.growth}`,
    SOURCES,
  ]);
  $("multi-source").innerHTML = sourceNote([
    `As the chart above, for each fiscal year in which at least ten states have been revised. Blue: up ${MOVE} places or more; red: down ${MOVE} places or more; grey: within two places.`,
    SOURCES,
  ]);
  $("ranks-source").innerHTML = sourceNote([
    `The figures drawn in the chart above. Change in rank is the first-print rank minus the latest rank: a plus sign is a move up the table. Changes of ${MOVE} places or more are coloured as in the chart.`,
    SOURCES,
  ]);
}

loadSite().then(run).catch((e) => { failed($("slope"), e); failed($("multiples"), e); failed($("ranks"), e); });
