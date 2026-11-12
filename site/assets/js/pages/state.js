// One state: every estimate ever published, when, and where it came from.
import {
  ROOT, loadJSON, loadSite, failed, fy, fmtNum, fmtInt, fmtPct, fmtPp, fmtCrSigned, fmtDate, fmtDateShort, esc, icon,
  seg, fillSelect, copyButton, sourceNote, responsive, getParam, setParams, stateUrl, NOTE, SRC_NAME, CITE,
} from "../core.js";
import { locatorMap } from "../map.js";
import { scrubber } from "../scrub.js";
import { vintageChart, settleChart } from "../charts.js";

const $ = (id) => document.getElementById(id);
const code = document.body.dataset.code;
const SRC_RANK = { mospi: 0, rbi: 1, state: 2 }; // same-day order, as in the paper's panel
const SRC_SHORT = { state: "State", rbi: "RBI", mospi: "MoSPI" };
// A figure for fiscal year t published before 1 October of year t is a projection (the paper's rule).
const isProj = (date, f) => !!date && date < `${f.slice(0, 4)}-10-01`;
const AWARD = {
  fc15_final: ["15th, final award", "2021–26, five years in all"],
  fc15_interim: ["15th, interim award", "2020–21"],
  fc16: ["16th", "2026–27 budget estimate"],
};
/** "p2;p10", "p3" -> "pages 2, 3, 10" */
const pageList = (pages) => {
  const nums = [...new Set((pages || []).flatMap((p) => String(p).split(/[;,]\s*/)).map((p) => p.replace(/^p+\.?\s*/i, "").trim()).filter(Boolean))];
  nums.sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
  return nums.length ? `page${nums.length > 1 ? "s" : ""} ${nums.join(", ")}` : null;
};
const vintageName = (v) => {
  const [who, iso] = v.split(" ");
  return `${who === "HB" ? "RBI Handbook" : who}, ${fmtDateShort(iso)}`;
};

async function main() {
  const [site, d, money] = await Promise.all([loadSite(), loadJSON(`data/states/${code}.json`), loadJSON("data/money.json")]);
  const me = site.states.find((s) => s.code === code);
  const hasGrowth = Object.keys(d.growth).length > 0;
  const hasConst = Object.keys(d.level.constant).length > 0;
  const st = {
    measure: hasGrowth && getParam("measure") !== "level" ? "growth" : "level",
    prices: hasConst ? "constant" : "current",
    fy: null,
    asof: getParam("asof"),
  };

  // ---------- header ----------
  $("kind").textContent = d.type.charAt(0).toUpperCase() + d.type.slice(1);
  $("note").textContent = d.note || "";
  const years = d.first_latest.map((x) => x.fy);
  $("facts").innerHTML = `<dt>${fmtInt(me.n_releases)}</dt><dd>documents</dd><dt>${fmtInt(me.n_state_docs)}</dt><dd>of them the state’s own</dd>
    <dt>${years.length ? `${fy(years[0])} to ${fy(years.at(-1))}` : "—"}</dt><dd>growth series</dd>`;
  locatorMap($("locator"), code).catch(() => {});
  fillSelect($("jump"), [...site.states].sort((a, b) => a.name.localeCompare(b.name)).map((s) => [s.slug, s.name]), me.slug);
  $("jump").addEventListener("change", (e) => (location.href = stateUrl(e.target.value)));

  // ---------- A. every estimate ----------
  const dated = d.releases.filter((r) => r.date);
  function seriesFor() {
    const src = st.measure === "growth" ? d.growth : d.level[st.prices];
    return dated.filter((r) => src[r.id]).map((r) => ({
      id: r.id, date: r.date, src: r.src, title: r.title,
      points: Object.entries(src[r.id]).map(([f, v]) => ({ fy: f, v, proj: isProj(r.date, f) })).sort((a, b) => a.fy.localeCompare(b.fy)),
    }));
  }
  let series = [], fys = [], scrub = null, small = false; // small: levels under ₹1 lakh crore are shown in ₹ crore
  const upto = () => { let k = 0; series.forEach((s, i) => { if (s.date <= st.asof) k = i; }); return k; };
  const drawA = () => {
    if (!series.length) { $("vintages").innerHTML = '<p class="empty">No dated document gives this measure.</p>'; return; }
    vintageChart($("vintages"), {
      series, fiscalYears: fys, upto: upto(), zero: st.measure === "growth",
      fmtY: st.measure === "growth" ? undefined : small ? (v) => fmtInt(v) : (v) => fmtNum(v / 1e5, 1),
      fmtV: st.measure === "growth" ? undefined : (v) => `₹${fmtInt(v)} crore`,
      onPick: (s) => { location.hash = `doc-${s.id}`; },
    });
  };
  function setMeasure() {
    series = seriesFor();
    fys = [...new Set(series.flatMap((s) => s.points.map((p) => p.fy)))].sort();
    const dates = [...new Set(series.map((s) => s.date))];
    small = st.measure === "level" && Math.max(0, ...series.flatMap((s) => s.points.map((p) => p.v))) < 1e5;
    $("prices").hidden = st.measure === "growth";
    $("a-unit").textContent = st.measure === "growth"
      ? "Real GSDP growth, per cent, constant 2011–12 prices; one line per document"
      : `GSDP, ${small ? "₹ crore" : "₹ lakh crore"}, ${st.prices === "constant" ? "constant 2011–12 prices" : "current prices"}; one line per document`;
    if (dates.length) {
      const ticks = series.map((s) => ({ date: s.date, big: s.src !== "state" }));
      if (!scrub) {
        scrub = scrubber($("scrub"), { dates, ticks, label: "As known on", replayMs: 6000, onChange: (i, iso) => { st.asof = iso; $("asof-date").textContent = fmtDate(iso); drawA(); if (!scrub.playing()) setParams({ asof: iso === dates.at(-1) ? null : iso }); } });
      } else scrub.setDates(dates, ticks);
      if (st.asof) { let k = 0; dates.forEach((x, i) => { if (x <= st.asof) k = i; }); scrub.set(k, { silent: true }); }
      st.asof = scrub.date();
      $("asof-date").textContent = fmtDate(st.asof);
    }
    $("scrub").closest(".state-asof").hidden = dates.length < 2;
    drawA();
    drawTable();
    const undated = d.releases.filter((r) => !r.date).length;
    $("a-source").innerHTML = sourceNote([
      `${series.length} dated documents${undated ? `; ${undated} undated ${undated === 1 ? "document is" : "documents are"} listed under Sources but not drawn` : ""}. Documents are dated by when they first became public. A figure for a year published before 1 October of that year is a projection and is drawn dashed. ${st.measure === "growth" ? NOTE.growth : ""}`,
      `${NOTE.rbi} ${NOTE.mospi}`,
    ]);
  }
  if (hasGrowth) seg($("measure"), [["growth", "Growth"], ["level", "Level"]], st.measure, (v) => { st.measure = v; setParams({ measure: v === "growth" ? null : v }); setMeasure(); });
  if (hasConst && Object.keys(d.level.current).length) seg($("prices"), [["constant", "Constant prices"], ["current", "Current prices"]], st.prices, (v) => { st.prices = v; setMeasure(); });
  if (me.n_state_docs === 0) {
    $("thin").hidden = false;
    $("thin").textContent = hasGrowth
      ? `No document of ${d.name}’s own is in the database. Every figure on this page comes from the RBI Handbook and MoSPI.`
      : `The database holds levels at current prices only for ${d.name}, from the RBI Handbook and MoSPI; there is no growth series.`;
  }
  responsive($("vintages"), drawA);

  // ---------- B. how one year settled ----------
  function pointsFor(f) {
    return dated.filter((r) => d.growth[r.id]?.[f] != null && !isProj(r.date, f))
      .map((r, i) => ({ date: r.date, v: d.growth[r.id][f], src: r.src, title: r.title, how: d.growth_src[r.id]?.[f], id: r.id, i }))
      .sort((a, b) => a.date.localeCompare(b.date) || SRC_RANK[a.src] - SRC_RANK[b.src] || a.i - b.i);
  }
  function drawB() {
    const pts = pointsFor(st.fy), fl = d.first_latest.find((x) => x.fy === st.fy);
    settleChart($("settle"), { points: pts, fiscal: st.fy, height: 280 });
    $("b-unit").textContent = `Every dated estimate of real GSDP growth in ${fy(st.fy)}, per cent, by date of publication`;
    if (!fl) { $("b-source").innerHTML = ""; return; }
    if (pts.length && (pts[0].v !== fl.first || pts.at(-1).v !== fl.latest)) console.warn("first/latest differ from the state file", st.fy, pts[0], pts.at(-1), fl);
    $("b-source").innerHTML = sourceNote([
      `${fl.n} documents give a figure for ${fy(st.fy)}. First: ${fmtPct(fl.first, 2)} (${SRC_NAME[fl.first_src]}, ${fmtDateShort(fl.first_date)}). Latest: ${fmtPct(fl.latest, 2)} (${SRC_NAME[fl.latest_src]}, ${fmtDateShort(fl.latest_date)}). Revision: ${fmtPp(fl.revision)}.${fl.first_tie || fl.latest_tie ? " Documents published on the same day give different figures; they are ordered MoSPI, RBI, state." : ""} Projections and undated documents are left out.`,
      `${NOTE.growth} ${NOTE.rbi} ${NOTE.mospi}`,
    ]);
  }
  if (years.length) {
    const want = getParam("fy");
    st.fy = years.includes(want) ? want : years.includes("2018-19") ? "2018-19" : years.at(-1);
    fillSelect($("fy"), years.map((f) => [f, fy(f)]), st.fy);
    $("fy").addEventListener("change", (e) => { st.fy = e.target.value; setParams({ fy: st.fy }); drawB(); });
    responsive($("settle"), drawB);
  } else {
    $("one-year").querySelector(".ex-tools").hidden = true;
    $("one-year").querySelector(".legend").hidden = true;
    $("settle").innerHTML = `<p class="empty">There is no growth series for ${esc(d.name)}, so there is no year to follow.</p>`;
  }

  // ---------- C. the table (revision triangle) ----------
  function drawTable() {
    const growth = st.measure === "growth", src = growth ? d.growth : d.level[st.prices];
    const rows = d.releases.filter((r) => src[r.id]);
    const cols = [...new Set(rows.flatMap((r) => Object.keys(src[r.id])))].sort();
    // the latest figure in each column: the paper's first/latest record for growth, the newest dated non-projection for levels
    const latestOf = {};
    for (const f of cols) {
      if (growth) latestOf[f] = d.first_latest.find((x) => x.fy === f)?.latest_release;
      else for (const r of rows) if (r.date && src[r.id][f] != null && !isProj(r.date, f)) latestOf[f] = r.id;
    }
    const cell = (r, f, j) => {
      const v = src[r.id][f];
      if (v == null) return `<td class="num earlier" data-c="${j}">—</td>`;
      const cls = isProj(r.date, f) ? "proj" : latestOf[f] === r.id ? "latest" : "earlier";
      return `<td class="num ${cls}" data-c="${j}">${growth ? fmtNum(v, 2) : fmtInt(v)}</td>`;
    };
    $("triangle").innerHTML = `<table class="tbl"><thead><tr><th scope="col" class="sticky-col">Document</th>${cols.map((f) => `<th scope="col" class="num">${fy(f)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr><th scope="row" class="sticky-col"><a href="#doc-${esc(r.id)}"><span class="mono">${r.date ? fmtDateShort(r.date) : "undated"}</span> <span class="muted">${SRC_SHORT[r.src]}</span></a></th>${cols.map((f, j) => cell(r, f, j)).join("")}</tr>`).join("")}</tbody></table>`;
    $("c-unit").textContent = growth ? "Real GSDP growth, per cent: one row per document, one column per fiscal year" : `GSDP, ₹ crore, ${st.prices === "constant" ? "constant 2011–12 prices" : "current prices"}: one row per document, one column per fiscal year`;
    $("c-source").innerHTML = sourceNote([
      `The latest figure for each year is in heavier type; earlier figures are lighter; projections are in italics; a dash means the document gives no figure. ${growth ? NOTE.growth : ""}`,
      `${NOTE.rbi} ${NOTE.mospi}`,
    ]);
  }
  let hotCol = null;
  $("triangle").addEventListener("pointerover", (e) => {
    const c = e.target.closest("td")?.dataset.c ?? null;
    if (c === hotCol) return;
    $("triangle").querySelectorAll("td.is-col").forEach((td) => td.classList.remove("is-col"));
    hotCol = c;
    if (c != null) $("triangle").querySelectorAll(`td[data-c="${c}"]`).forEach((td) => td.classList.add("is-col"));
  });
  $("triangle").addEventListener("pointerleave", () => { hotCol = null; $("triangle").querySelectorAll("td.is-col").forEach((td) => td.classList.remove("is-col")); });

  setMeasure();

  // ---------- D. Finance Commission ----------
  const mine = money.by_state.filter((r) => r.state === d.name), own = money.own.filter((r) => r.state === d.name);
  if (mine.length) {
    $("d-unit").textContent = "This state’s share of the divisible pool as awarded, and recomputed with later GSDP figures";
    $("d-tools").innerHTML = `<a class="btn btn-secondary" href="${ROOT}calculator/?award=fc15_final&state=${encodeURIComponent(d.name)}&pct=1">Open in the calculator</a>`;
    $("fc").innerHTML = `<div class="fc-grid">
      <div><h3>Share with the Commission’s GSDP replaced by the latest vintage</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Award</th><th>GSDP vintage used</th><th class="num">As awarded, %</th><th class="num">Recomputed, %</th><th class="num">Change, pp</th><th class="num">₹ crore</th></tr></thead>
        <tbody>${mine.map((r) => `<tr><th scope="row">${AWARD[r.award][0]}</th><td>${vintageName(r.base_vintage)}</td><td class="num">${fmtNum(r.share_pct_base, 3)}</td><td class="num">${fmtNum(r.share_pct_cf, 3)}</td><td class="num">${fmtPp(r.dpp, 3).replace(" pp", "")}</td><td class="num">${fmtCrSigned(r.rs_crore).replace(" crore", "")}</td></tr>`).join("")}</tbody></table></div></div>
      <div><h3>Effect of a 1% change in this state’s own GSDP <span class="badge badge-note plain">valid for small changes only</span></h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Award</th><th class="num">Change in share, pp</th><th class="num">₹ crore a year</th><th>Largest effect on another state</th></tr></thead>
        <tbody>${own.map((r) => `<tr><th scope="row">${AWARD[r.formula][0]}</th><td class="num">${fmtPp(r.own_dpp_per_1pct, 4).replace(" pp", "")}</td><td class="num">${fmtCrSigned(r.own_rs_crore_per_year_per_1pct).replace(" crore", "")}</td><td>${esc(r.largest_other_state)}, ${fmtCrSigned(r.largest_other_rs_crore)}</td></tr>`).join("")}</tbody></table></div></div>
    </div>`;
    $("d-source").innerHTML = sourceNote([
      `Shares recomputed with only GSDP changed; every other input as published. Amounts for the 15th Commission’s final award cover 2021–26 in all; the interim award covers 2020–21. ${NOTE.devolution}`,
      `${NOTE.rbi} ${NOTE.mospi}`,
    ]);
  } else {
    $("fc").innerHTML = `<p class="empty">${esc(d.name)} is not among the 28 states in the Finance Commission’s formula for sharing taxes between states, so there is nothing to recompute.</p>`;
  }

  // ---------- E. sources ----------
  const docs = [...dated].reverse().concat(d.releases.filter((r) => !r.date));
  const credit = { rbi: "© Reserve Bank of India, reproduced with acknowledgement", mospi: "Ministry of Statistics and Programme Implementation, Government of India" };
  const drawDocs = (only) => {
    const list = docs.filter((r) => only === "all" || r.src === only);
    $("docs").innerHTML = list.map((r) => {
      const bits = [r.publisher, pageList(r.pages),
        r.printed_date && r.printed_date !== r.date ? `dated ${fmtDateShort(r.printed_date)} in the document` : null, r.src === "state" ? null : credit[r.src]].filter(Boolean);
      return `<li id="doc-${esc(r.id)}"><span class="when">${r.date ? fmtDateShort(r.date) : "undated"}</span><span><span class="badge src-${r.src}">${SRC_NAME[r.src]}</span></span>
        <span class="what">${esc(r.title || r.id)}<span>${bits.map(esc).join(" · ")}</span></span>
        ${r.url ? `<a class="ext" href="${esc(r.url)}" rel="noopener" target="_blank">Original ${icon("external")}</a>` : '<span class="ext muted">no link</span>'}</li>`;
    }).join("") || '<li><span class="empty">No document of this kind.</span></li>';
  };
  const counts = { state: 0, rbi: 0, mospi: 0 };
  docs.forEach((r) => counts[r.src]++);
  $("e-unit").textContent = `${docs.length} documents, newest first: ${counts.state} from the state government, ${counts.rbi} RBI Handbook editions, ${counts.mospi} MoSPI releases`;
  seg($("src-filter"), [["all", "All"], ["state", "State"], ["rbi", "RBI"], ["mospi", "MoSPI"]], "all", drawDocs);
  drawDocs("all");
  $("e-source").innerHTML = sourceNote([`Links go to the publisher’s own copy where one is known. ${NOTE.rbi} ${NOTE.mospi}`]);

  // ---------- F. download and cite ----------
  // Triangles exist only where a state or MoSPI document gives the series (site.json lists which).
  const files = [["gsdp_constant", "Constant prices"], ["gsdp_current", "Current prices"]].filter(([dir]) => (me.triangles || []).includes(dir))
    .map(([dir, label]) => `<a class="btn btn-secondary" href="${ROOT}downloads/data/triangles/${dir}/${code}.csv" download>${icon("download")}${label} (CSV)</a>`);
  $("dl").innerHTML = (files.join("") || `<span class="small">No triangle file for ${esc(d.name)}: its figures come from sources that are not redistributed here.</span>`)
    + `<a href="${ROOT}data/">All downloads and the codebook</a>`;
  $("cite-text").textContent = CITE;
  copyButton($("cite-copy"), () => CITE);

  // a link that arrived with #doc-… or #section: the target did not exist until now
  if (location.hash.length > 1) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
}
main().catch((e) => failed($("vintages"), e));
