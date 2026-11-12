// ITIHAS website: the map of India.
// Geometry: geo/india.json, 36 states and union territories (see scripts/prepare_map.mjs for the source).
// What is drawn: India only, the outer boundary as one continuous line, no neighbouring countries,
// no "disputed" styling, island groups in their true positions.
import { d3, ROOT, loadJSON, esc, tip } from "./core.js";

const T = tip();
let geoPromise;
export const loadGeo = () => (geoPromise ??= loadJSON("geo/india.json"));

// Units too small to hit reliably on the map; repeated as chips beside it.
export const SMALL = ["DL", "CH", "PY", "GA", "SK", "TR", "AN", "LD", "DN"];
// Units with no growth series in the database: drawn and outlined, never left off.
export const NO_SERIES = { LD: "No series in the database", DN: "No series in the database", LA: "Levels only; no growth series" };

const CHIP_NAME = { AN: "Andaman and Nicobar", DN: "DNH and Daman and Diu" };

const W = 640, H = 700;
function project(geo) {
  // Lambert conformal conic, the projection family of Survey of India's own maps of the country.
  return d3.geoConicConformal().parallels([12, 32]).rotate([-82.5, 0]).fitExtent([[4, 4], [W - 4, H - 4]], geo);
}

/**
 * Interactive map.
 * opts.label(code, name) -> text for screen readers and the tooltip's first line.
 * opts.tipHtml(code, name) -> tooltip body. opts.onPick(code). opts.onHover(code | null).
 * Returns { paint(fn), pick(code), hover(code), chips(el) }, where paint's fn maps code ->
 * { fill, hatch: bool, none: bool }.
 */
export async function indiaMap(el, opts = {}) {
  const geo = await loadGeo();
  const path = d3.geoPath(project(geo));
  el.classList.add("imap");
  el.innerHTML = "";
  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "group").attr("aria-label", opts.title || "Map of India by state and union territory");
  const id = `hatch-${Math.random().toString(36).slice(2, 7)}`;
  svg.append("defs").html(`<pattern id="${id}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="7" height="7" fill="var(--surface)"/><line x1="0.75" y1="0" x2="0.75" y2="7" stroke="var(--hatch)" stroke-width="1.5"/></pattern>`);
  // A wider stroke under the fills: only its outer half shows, as the national outline.
  svg.append("g").attr("class", "outline").selectAll("path").data(geo.features).join("path").attr("d", path);
  const units = svg.append("g").selectAll("path").data(geo.features).join("path")
    .attr("class", "unit").attr("d", path).attr("data-code", (d) => d.properties.code);
  const byCode = new Map(geo.features.map((f) => [f.properties.code, f.properties.name]));
  let chipEl = null, picked = null;
  const interactive = (code) => !(code in NO_SERIES) || code === "LA";
  const setActive = (code) => {
    units.classed("is-active", (d) => d.properties.code === code);
    chipEl?.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c.dataset.code === code));
    opts.onHover?.(code);
  };
  const show = (code, ev, node) => {
    const name = byCode.get(code);
    const html = `<div class="t">${esc(name)}</div>${opts.tipHtml ? opts.tipHtml(code, name) : ""}`;
    if (ev) T.show(html, ev); else T.at(html, node);
    setActive(code);
  };
  const hide = () => { T.hide(); setActive(null); };
  const go = (code) => { if (interactive(code) && code !== "LD" && code !== "DN") opts.onPick?.(code); };
  units.attr("tabindex", (d) => (interactive(d.properties.code) ? 0 : null))
    .attr("role", opts.onPick ? "link" : "img")
    .on("pointerenter pointermove", (ev, d) => show(d.properties.code, ev))
    .on("pointerleave", hide)
    .on("focus", function (ev, d) { show(d.properties.code, null, this); })
    .on("blur", hide)
    .on("click", (ev, d) => go(d.properties.code))
    .on("keydown", (ev, d) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(d.properties.code); } });

  const api = {
    names: byCode,
    paint(fn) {
      units.each(function (d) {
        const code = d.properties.code, s = fn(code) || {};
        const node = d3.select(this);
        node.classed("void", !!s.none).style("fill", s.none ? null : s.hatch ? `url(#${id})` : s.fill || null);
        if (opts.label) node.attr("aria-label", opts.label(code, d.properties.name));
        const chip = chipEl?.querySelector(`[data-code="${code}"] i`);
        if (chip) chip.style.background = s.none ? "var(--surface)" : s.hatch ? `repeating-linear-gradient(135deg, var(--surface) 0 2px, var(--hatch) 2px 3px)` : s.fill || "";
      });
    },
    pick(code) {
      picked = code;
      units.classed("is-picked", (d) => d.properties.code === code);
      units.filter((d) => d.properties.code === code).raise();
    },
    /** A row of labelled chips for the small units: a second, larger target for each. */
    chips(target) {
      chipEl = target;
      target.classList.add("chips");
      target.innerHTML = SMALL.map((c) => `<button type="button" class="chip" data-code="${c}"${c === "LD" || c === "DN" ? ' aria-disabled="true"' : ""}><i></i>${esc(CHIP_NAME[c] || byCode.get(c))}</button>`).join("");
      target.querySelectorAll(".chip").forEach((b) => {
        const code = b.dataset.code;
        b.addEventListener("pointerenter", (ev) => show(code, ev));
        b.addEventListener("pointerleave", hide);
        b.addEventListener("focus", () => show(code, null, b));
        b.addEventListener("blur", hide);
        b.addEventListener("click", () => go(code));
      });
    },
  };
  return api;
}

/** A small, non-interactive map with one unit filled: the locator on a state page. */
export async function locatorMap(el, code) {
  const geo = await loadGeo();
  const path = d3.geoPath(project(geo));
  el.classList.add("imap", "static");
  el.innerHTML = "";
  const name = geo.features.find((f) => f.properties.code === code)?.properties.name;
  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", `Map of India with ${name} marked`);
  svg.append("g").attr("class", "outline").selectAll("path").data(geo.features).join("path").attr("d", path);
  svg.append("g").selectAll("path").data(geo.features).join("path").attr("class", (d) => `unit${d.properties.code === code ? " on" : ""}`).attr("d", path);
  // A ring around units too small to see at this size.
  const f = geo.features.find((x) => x.properties.code === code);
  if (f) {
    const [[x0, y0], [x1, y1]] = path.bounds(f);
    if (Math.max(x1 - x0, y1 - y0) < 40) {
      svg.append("circle").attr("cx", (x0 + x1) / 2).attr("cy", (y0 + y1) / 2).attr("r", Math.max(22, Math.max(x1 - x0, y1 - y0)))
        .attr("fill", "none").attr("stroke", "var(--accent-bright)").attr("stroke-width", 3);
    }
  }
}
export { ROOT };
