// ITIHAS website: shared shell (header, footer, search, theme) and helpers
// (number and date formatting, data loading, colours, tooltip, tables, URL state).

export const ROOT = document.documentElement.dataset.root || "./";
export const d3 = window.d3;
export const REPO_URL = "https://github.com/itihas-data/itihas";
// Two things can be cited. The database is the Zenodo record: it has one DOI per version and never changes.
// The paper is a working paper for now; if a journal publishes it, replace CITE_PAPER with the journal reference.
export const CITE = "Jha, S. and Parekh, V. B. (2026). ITIHAS: Indian Time-series of Initial and Historical Accounts of States (version 1.0.0) [Data set]. Zenodo. https://doi.org/10.5281/zenodo.24163142";
export const CITE_PAPER = "Jha, S. and Parekh, V. B. (2026). The Price of Early Data: How State GDP Revisions Would Have Shifted ₹25,654 Crore Between India’s States. Working paper, version 1.";

// ---------- standing source notes ----------
export const NOTE = {
  rbi: "RBI Handbook of Statistics on Indian States: © Reserve Bank of India, reproduced with acknowledgement; not under CC BY.",
  mospi: "MoSPI: Ministry of Statistics and Programme Implementation, Government of India.",
  state: "State documents: economic surveys, budget documents and press notes of the state governments, cited on each state page.",
  map: "State boundaries: DataMeet India community (CC BY 4.0), simplified.",
  growth: "Growth is the rate printed in the document where there is one; otherwise it is computed from two levels in the same document.",
  devolution: "Rupee figures use actual devolution; the 16th Commission uses the 2026–27 budget estimate.",
};
export const SRC_NAME = { state: "State document", rbi: "RBI Handbook", mospi: "MoSPI" };

// ---------- formatting: Indian digit grouping, true minus, en dash in fiscal years ----------
const nf = (d) => new Intl.NumberFormat("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const NF = [nf(0), nf(1), nf(2), nf(3), nf(4)];
export const MINUS = "−";
const blank = (x) => x == null || Number.isNaN(x);
export const fmtNum = (x, d = 0) => (blank(x) ? "—" : NF[d].format(x).replace("-", MINUS));
export const fmtInt = (x) => fmtNum(Math.round(x ?? NaN), 0);
export const fmtPct = (x, d = 1) => (blank(x) ? "—" : fmtNum(x, d) + "%");
export const fmtSigned = (x, d = 2, unit = "") => (blank(x) ? "—" : (x > 0 ? "+" : x < 0 ? MINUS : "") + NF[d].format(Math.abs(x)) + unit);
export const fmtPp = (x, d = 2) => fmtSigned(x, d, " pp");
export const fmtCr = (x) => (blank(x) ? "—" : "₹" + fmtInt(x) + " crore");
export const fmtCrSigned = (x) => (blank(x) ? "—" : (x > 0 ? "+" : x < 0 ? MINUS : "") + "₹" + NF[0].format(Math.abs(Math.round(x))) + " crore");
export const fy = (s) => (s ? String(s).replace("-", "–") : "—");
const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const fmtDate = (iso) => {
  if (!iso) return "undated";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MON[m - 1]} ${y}`;
};
export const fmtDateShort = (iso) => {
  if (!iso) return "undated";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MON[m - 1].slice(0, 3)} ${y}`;
};
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const day = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5;
/** The date a fiscal year ends ("2018-19" -> "2019-03-31"). */
export const fyEnd = (f) => `${+f.slice(0, 4) + 1}-03-31`;

// ---------- data ----------
const cache = new Map();
export function loadJSON(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(ROOT + path).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
      return r.json();
    }));
  }
  return cache.get(path);
}
export const loadSite = () => loadJSON("data/site.json");
export function failed(el, err) {
  el.innerHTML = `<p class="empty">Could not load the data. ${esc(err.message)}</p>`;
  console.error(err);
}
export const stateUrl = (slug, query = "") => `${ROOT}states/${slug}/${query ? "?" + query : ""}`;

// ---------- URL state (shareable, no reload) ----------
export const getParam = (k) => new URLSearchParams(location.search).get(k);
export function setParams(obj) {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(obj)) (v == null || v === "" ? q.delete(k) : q.set(k, v));
  const s = q.toString();
  history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash);
}

// ---------- colours ----------
export const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
/** The site's one diverging scale: below zero toward data-red, above toward data-blue. */
export function diverging(maxAbs) {
  const base = css("map-neutral"), ib = d3.interpolateLab(base, css("data-blue")), ir = d3.interpolateLab(base, css("data-red"));
  const f = (v) => (blank(v) ? null : (v >= 0 ? ib : ir)(Math.min(1, Math.abs(v) / maxAbs) ** 0.8));
  f.gradient = () => `linear-gradient(90deg, ${css("data-red")}, ${base}, ${css("data-blue")})`;
  return f;
}
/** Single-hue scale for levels and counts. */
export function sequential([lo, hi]) {
  const it = d3.interpolateLab(css("map-neutral"), css("data-blue"));
  const f = (v) => (blank(v) ? null : it(Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1)))));
  f.gradient = () => `linear-gradient(90deg, ${css("map-neutral")}, ${css("data-blue")})`;
  return f;
}
/** Grey ramp for vintages: oldest lightest, the latest is ink. */
export function vintageColour(i, n) {
  if (i === n - 1) return css("ink");
  const ramp = [css("vintage-1"), css("vintage-2"), css("vintage-3"), css("vintage-4")];
  return ramp[Math.min(3, Math.floor((i / Math.max(1, n - 1)) * 4))];
}
export const srcColour = (src) => css(`src-${src}`);

// ---------- icons (Lucide, ISC licence) ----------
const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};
export const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

// ---------- small UI helpers ----------
/** Segmented control. options: [[value, label], ...]. Returns a setter. */
export function seg(el, options, value, onChange) {
  el.classList.add("seg");
  el.setAttribute("role", "group");
  el.innerHTML = options.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${v === value}">${esc(l)}</button>`).join("");
  const set = (v) => el.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.getAttribute("aria-pressed") === "true") return;
    set(b.dataset.v);
    onChange(b.dataset.v);
  });
  return set;
}
/** Fill a <select>. options: [[value, label], ...]. */
export function fillSelect(sel, options, value) {
  sel.innerHTML = options.map(([v, l]) => `<option value="${esc(v)}"${v === value ? " selected" : ""}>${esc(l)}</option>`).join("");
}
export function copyButton(btn, getText) {
  const label = btn.textContent.trim() || "Copy";
  btn.innerHTML = `${icon("copy")}<span>${esc(label)}</span>`;
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(getText());
      btn.innerHTML = `${icon("check")}<span>Copied</span>`;
    } catch (e) {
      btn.innerHTML = `${icon("copy")}<span>Press Ctrl+C</span>`;
    }
    setTimeout(() => (btn.innerHTML = `${icon("copy")}<span>${esc(label)}</span>`), 1600);
  });
}
/**
 * Source note under an exhibit: one short line naming the sources, with the method notes folded away
 * behind "Notes". lines: strings of HTML. The standing notes in NOTE are recognised and shown as short
 * names with a mark (* RBI, † MoSPI, ‡ map boundaries); the marks are spelt out in the notes and in the
 * page footer.
 */
const SRC_TAGS = [
  ["state", "State documents", "", ""],
  ["rbi", "RBI Handbook", "*", "© Reserve Bank of India, reproduced with acknowledgement; not under CC BY."],
  ["mospi", "MoSPI", "†", "Ministry of Statistics and Programme Implementation, Government of India."],
  ["map", "Boundaries (not official)", "‡", "DataMeet India community (CC BY 4.0), simplified. These are not the official boundaries of India and are shown for illustration only."],
];
export function sourceNote(lines) {
  let text = lines.filter(Boolean);
  const tags = [], marks = [];
  for (const [k, label, mark, full] of SRC_TAGS) {
    if (!text.some((l) => l.includes(NOTE[k]))) continue;
    tags.push(label + mark);
    if (mark) marks.push(`${mark} ${label}: ${full}`);
    text = text.map((l) => l.split(NOTE[k]).join(""));
  }
  const body = text.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (marks.length) body.push(marks.join(" "));
  const head = tags.length ? `<b>${tags.length > 1 ? "Sources" : "Source"}</b><span>${tags.join(", ")}</span>` : "<b>Source</b>";
  if (!body.length) return `<p class="src-line">${head}</p>`;
  return `<details class="src"><summary>${head}<span class="src-more">Notes</span></summary>${body.map((p) => `<p>${p}</p>`).join("")}</details>`;
}

/**
 * Sortable table.
 * columns: [{key, label, num, value(row), html(row), sort: false}], rows: objects.
 * opts: {sortKey, dir (1 | -1), sticky (first column), onRow(row, tr)}
 */
export function dataTable(el, columns, rows, opts = {}) {
  let { sortKey = null, dir = 1 } = opts;
  const val = (c, r) => (c.value ? c.value(r) : r[c.key]);
  function draw() {
    const sorted = sortKey == null ? rows : [...rows].sort((a, b) => {
      const c = columns.find((x) => x.key === sortKey), va = val(c, a), vb = val(c, b);
      if (blank(va) || va === "") return 1;
      if (blank(vb) || vb === "") return -1;
      return (typeof va === "number" ? va - vb : String(va).localeCompare(String(vb))) * dir;
    });
    el.innerHTML = `<table class="tbl"><thead><tr>${columns.map((c, i) => {
      const cls = [c.num ? "num" : "", i === 0 && opts.sticky ? "sticky-col" : ""].join(" ").trim();
      const sort = c.key === sortKey ? ` aria-sort="${dir > 0 ? "ascending" : "descending"}"` : "";
      return `<th scope="col" class="${cls}"${sort}>${c.sort === false ? esc(c.label) : `<button type="button" data-k="${c.key}">${esc(c.label)}</button>`}</th>`;
    }).join("")}</tr></thead><tbody>${sorted.map((r) => `<tr>${columns.map((c, i) => {
      const cls = [c.num ? "num" : "", c.cls || "", i === 0 && opts.sticky ? "sticky-col" : ""].join(" ").trim();
      const body = c.html ? c.html(r) : esc(val(c, r) ?? "—");
      return i === 0 ? `<th scope="row" class="${cls}">${body}</th>` : `<td class="${cls}">${body}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table>`;
    if (opts.onRow) el.querySelectorAll("tbody tr").forEach((tr, i) => opts.onRow(sorted[i], tr));
  }
  el.addEventListener("click", (e) => {
    const b = e.target.closest("thead button");
    if (!b) return;
    const c = columns.find((x) => x.key === b.dataset.k);
    if (sortKey === c.key) dir = -dir; else { sortKey = c.key; dir = c.num ? -1 : 1; }
    draw();
  });
  draw();
  return { update(newRows) { rows = newRows; draw(); } };
}

// ---------- tooltip ----------
let tipEl;
export function tip() {
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.className = "tip";
    tipEl.setAttribute("role", "status");
    document.body.append(tipEl);
  }
  return {
    show(html, ev) { tipEl.innerHTML = html; tipEl.classList.add("show"); this.move(ev); },
    move(ev) {
      if (!ev) return;
      const pad = 14, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
      let x = ev.clientX + pad, y = ev.clientY + pad;
      if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
      if (y + h > window.innerHeight - 8) y = ev.clientY - h - pad;
      tipEl.style.left = `${Math.max(8, x)}px`;
      tipEl.style.top = `${Math.max(8, y)}px`;
    },
    /** Show next to an element (keyboard focus). */
    at(html, node) {
      const r = node.getBoundingClientRect();
      this.show(html, { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
    },
    hide() { tipEl.classList.remove("show"); },
  };
}

/** Re-run a render function when its container changes width or the theme changes. */
export function responsive(el, render) {
  let w = 0;
  new ResizeObserver(() => {
    const nw = Math.round(el.clientWidth);
    if (nw && nw !== w) { w = nw; requestAnimationFrame(render); }
  }).observe(el);
  window.addEventListener("themechange", render);
  return render;
}
export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- shell ----------
const NAV = [
  ["states", "states/", "States"],
  ["findings", "findings/", "Findings"],
  ["calculator", "calculator/", "Calculator"],
  ["data", "data/", "Data"],
  ["paper", "paper/", "Paper"],
  ["about", "about/", "About"],
];
const theme = () => document.documentElement.dataset.theme || "light";
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("itihas-theme", t); } catch (e) { /* storage unavailable */ }
  syncTheme();
  window.dispatchEvent(new CustomEvent("themechange"));
}
function syncTheme() {
  document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
    const dark = theme() === "dark";
    b.innerHTML = icon(dark ? "sun" : "moon");
    b.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
  });
}
const lockup = (h) => `<img class="logo-light" src="${ROOT}assets/img/lockup.svg" alt="ITIHAS" height="${h}"><img class="logo-dark" src="${ROOT}assets/img/lockup-dark.svg" alt="ITIHAS" height="${h}">`;

function mountSearch(box) {
  const input = box.querySelector("input"), list = box.querySelector("ul");
  let states = null, hits = [], active = 0;
  const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); };
  const go = (s) => { if (s) location.href = stateUrl(s.slug); };
  function draw() {
    const q = input.value.trim().toLowerCase();
    hits = !states ? [] : states.filter((s) => !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase() === q)
      .sort((a, b) => (b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name));
    active = Math.min(active, Math.max(0, hits.length - 1));
    list.innerHTML = hits.length
      ? hits.map((s, i) => `<li role="option" id="sr-${i}" aria-selected="${i === active}" data-i="${i}">${esc(s.name)}<span>${s.type === "state" ? "State" : "Union territory"}</span></li>`).join("")
      : `<li class="none">${states ? "No state or union territory matches" : "Loading"}</li>`;
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-activedescendant", hits.length ? `sr-${active}` : "");
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }
  const ensure = async () => { if (!states) { states = (await loadSite()).states; draw(); } };
  input.addEventListener("focus", () => { draw(); ensure(); });
  input.addEventListener("input", () => { active = 0; draw(); ensure(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { active = Math.min(hits.length - 1, active + 1); draw(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { active = Math.max(0, active - 1); draw(); e.preventDefault(); }
    else if (e.key === "Enter") go(hits[active]);
    else if (e.key === "Escape") { close(); input.blur(); }
  });
  list.addEventListener("mousedown", (e) => { const li = e.target.closest("li[data-i]"); if (li) go(hits[+li.dataset.i]); });
  input.addEventListener("blur", () => setTimeout(close, 120));
}

export function mountLayout() {
  const page = document.body.dataset.page;
  const head = document.createElement("header");
  head.className = "site-head";
  head.innerHTML = `<div class="wrap">
    <a class="brand" href="${ROOT}" aria-label="ITIHAS home">${lockup(22)}</a>
    <nav class="nav" id="site-nav" aria-label="Main">
      ${NAV.map(([k, href, label]) => `<a href="${ROOT}${href}"${k === page ? ' aria-current="page"' : ""}>${label}</a>`).join("")}
    </nav>
    <div class="head-tools">
      <div class="search" role="search">
        ${icon("search")}
        <input type="text" role="combobox" aria-label="Search states and union territories" aria-controls="search-list" aria-expanded="false" aria-autocomplete="list" placeholder="Search states" autocomplete="off" spellcheck="false">
        <ul id="search-list" class="search-list" role="listbox" hidden></ul>
      </div>
      <button class="icon-btn" type="button" data-theme-toggle></button>
      <button class="menu-btn" type="button" aria-controls="site-nav" aria-expanded="false">Menu</button>
    </div>
  </div>`;
  document.body.prepend(head);
  const nav = head.querySelector(".nav"), mb = head.querySelector(".menu-btn");
  mb.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    mb.setAttribute("aria-expanded", String(open));
    mb.textContent = open ? "Close" : "Menu";
  });
  mountSearch(head.querySelector(".search"));
  syncTheme();
  head.querySelector("[data-theme-toggle]").addEventListener("click", () => setTheme(theme() === "dark" ? "light" : "dark"));

  const foot = document.createElement("footer");
  foot.className = "site-foot";
  foot.innerHTML = `<div class="wrap">
    <div class="foot-grid">
      <div class="foot-cite">
        <a class="brand" href="${ROOT}" aria-label="ITIHAS home">${lockup(26)}</a>
        <div class="cite"><p id="foot-cite">${esc(CITE)}</p><button class="btn btn-secondary btn-sm" type="button" id="foot-copy">Copy</button></div>
      </div>
      <nav class="foot-links" aria-label="Explore" style="grid-column-start:8"><h4>Explore</h4><ul>
        <li><a href="${ROOT}states/">States</a></li>
        <li><a href="${ROOT}findings/two-year-rule/">The two-year rule</a></li>
        <li><a href="${ROOT}findings/league-table/">The league table</a></li>
        <li><a href="${ROOT}findings/money/">Money</a></li>
        <li><a href="${ROOT}calculator/">Calculator</a></li>
      </ul></nav>
      <nav class="foot-links" aria-label="Use"><h4>Use</h4><ul>
        <li><a href="${ROOT}data/">Download the data</a></li>
        <li><a href="${ROOT}data/methods/">Methods</a></li>
        <li><a href="${ROOT}paper/">Paper</a></li>
        <li><a href="${ROOT}about/">About</a></li>
        <li><a href="${REPO_URL}">Source code on GitHub</a></li>
      </ul></nav>
    </div>
    <div class="foot-fine" id="credits">
      <p>Data compiled from state documents and MoSPI releases: CC BY 4.0. Code: MIT.</p>
      <p>* RBI Handbook of Statistics on Indian States: © Reserve Bank of India, reproduced with acknowledgement; not under CC BY.</p>
      <p>† MoSPI: Ministry of Statistics and Programme Implementation, Government of India.</p>
      <p>‡ ${NOTE.map}</p>
      <p id="foot-version"></p>
    </div>
  </div>`;
  document.body.append(foot);
  copyButton(foot.querySelector("#foot-copy"), () => CITE);
  loadSite().then((s) => {
    foot.querySelector("#foot-version").textContent = `Version ${s.version}, built ${fmtDate(s.built)}.`;
  }).catch(() => {});
}

mountLayout();
