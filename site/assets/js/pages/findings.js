// Findings index: three rows, each with a small still version of the finding's lead chart.
import { d3, loadJSON, loadSite, failed, fy, fmtInt, css, sourceNote, responsive, NOTE } from "../core.js";
import { frame, maturityChart, slopeChart, rankRows } from "../charts.js";

const $ = (id) => document.getElementById(id);
const YEAR = "2018-19"; // the year the homepage opens on
const AWARDS = [
  ["fc15_final", "15th, final"],
  ["fc15_interim", "15th, interim"],
  ["fc16", "16th, so far"],
];

/** The thumbnails are stills inside a link: take their marks out of the tab order. */
const still = (el) => el.querySelectorAll("[tabindex]").forEach((n) => n.removeAttribute("tabindex"));

function two(data) {
  const el = $("thumb-two");
  responsive(el, () => { maturityChart(el, { rows: data.maturity, field: "corr", height: 170 }); still(el); });
}

function league(site) {
  const el = $("thumb-league");
  const names = Object.fromEntries(site.states.filter((s) => s.type === "state").map((s) => [s.code, { name: s.name, slug: s.slug }]));
  const rows = rankRows(site.cells.filter((c) => c.fy === YEAR), names);
  responsive(el, () => slopeChart(el, { rows, compact: true, title: `States ranked by growth in ${fy(YEAR)}: first published against latest` }));
}

/** One bar per award: the first vintage listed for it in money.json. */
function money(m) {
  const el = $("thumb-money");
  const rows = AWARDS.map(([k, label]) => ({ label, ...m.summary.find((s) => s.award === k) }));
  responsive(el, () => {
    const rowH = 30, labW = 96, valW = 150;
    const { g, w } = frame(el, rows.length * rowH + 8, { t: 4, r: 4, b: 4, l: labW }, "Rupees crore that would have gone to different states, by award");
    const x = d3.scaleLinear().domain([0, d3.max(rows, (d) => d.rs_crore_moved_total)]).range([0, Math.max(20, w - valW)]);
    const row = g.selectAll("g").data(rows).join("g").attr("transform", (d, i) => `translate(0,${i * rowH})`);
    row.append("text").attr("class", "lbl").attr("x", -labW).attr("y", rowH / 2 + 4).text((d) => d.label);
    row.append("rect").attr("y", 9).attr("height", rowH - 18).attr("rx", 1.5).attr("width", (d) => Math.max(1, x(d.rs_crore_moved_total))).attr("fill", css("ink"));
    row.append("text").attr("class", "val").attr("x", (d) => x(d.rs_crore_moved_total) + 8).attr("y", rowH / 2 + 4)
      .text((d) => `${fmtInt(d.rs_crore_moved_total)} · ${d.years_of_money === 1 ? "1 year" : `${d.years_of_money} years`}`);
  });
}

$("index-source").innerHTML = sourceNote([
  `Top: the paper’s 20-state real-time panel; cross-state correlation between estimates of each age and the latest figure. Middle: states (union territories left out) ranked by real GSDP growth in ${fy(YEAR)}, highest first; ranks are computed within the year. Bottom: each Finance Commission’s shares recomputed with revised GSDP; ₹ crore over the years each award covers.`,
  NOTE.devolution,
  `${NOTE.state} ${NOTE.rbi} ${NOTE.mospi}`,
]);
loadJSON("data/two_year.json").then(two).catch((e) => failed($("thumb-two"), e));
loadSite().then(league).catch((e) => failed($("thumb-league"), e));
loadJSON("data/money.json").then(money).catch((e) => failed($("thumb-money"), e));
