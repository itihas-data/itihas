// Methods: the codebook and the validation notes, fetched from downloads/ and shown as they are written.
import { ROOT, loadSite, esc, fmtInt } from "../core.js";

const $ = (id) => document.getElementById(id);
const DL = `${ROOT}downloads/`;
const DOCS = [["codebook", "codebook.md"], ["validation", "validation.md"]];

/* markdown:start (no DOM apart from esc; checked in Node against the two documents) */
// A small Markdown renderer for these documents: headings, paragraphs, bold, italic, inline code, links,
// unordered and ordered lists (nested), pipe tables and fenced code. HTML in the source is escaped, never run.
const LI = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const HEAD = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;
const RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** Links may only go to the web, to a place on this page, or to a file beside the document. */
function safeHref(url, base) {
  const u = url.trim();
  if (/^https?:\/\//i.test(u) || u.startsWith("#")) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith("//")) return null;
  return base + u.replace(/^\.?\//, "");
}
function inline(src, base) {
  const kept = [];
  const keep = (html) => `\u0000${kept.push(html) - 1}\u0000`;
  let s = esc(src);
  s = s.replace(/`([^`]+)`/g, (_, code) => keep(`<code>${code}</code>`));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
    const href = safeHref(url.replace(/&amp;/g, "&"), base);
    return href ? keep(`<a href="${esc(href)}">`) + text + keep("</a>") : text;
  });
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]*[^\s<.,;:!?)\]])/g, (_, pre, url) => pre + keep(`<a href="${url}">${url}</a>`));
  s = s.replace(/\*\*(?!\s)(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*(?![\s*])([^*]+?)\*(?![*\w])/g, "$1<em>$2</em>");
  while (/\u0000\d+\u0000/.test(s)) s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => kept[+n]);
  return s;
}
/** Split one table row into cells; a bar inside inline code or after a backslash is not a divider. */
function cells(line) {
  const out = [];
  let cell = "", code = false;
  const s = line.trim().replace(/^\|/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "`") code = !code;
    if (c === "\\" && s[i + 1] === "|") { cell += "|"; i++; }
    else if (c === "|" && !code) { out.push(cell.trim()); cell = ""; }
    else cell += c;
  }
  if (cell.trim()) out.push(cell.trim());
  return out;
}
function list(lines, i, base) {
  const first = lines[i].match(LI), indent = first[1].length, ordered = /\d/.test(first[2]);
  let html = "";
  while (i < lines.length) {
    const m = lines[i].match(LI);
    if (!m || m[1].length !== indent || /\d/.test(m[2]) !== ordered) break;
    let text = m[3], inner = "";
    i++;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) {
        const next = (lines[i + 1] || "").match(LI);
        if (next && next[1].length >= indent) { i++; continue; }
        break;
      }
      const lm = l.match(LI);
      if (lm) {
        if (lm[1].length <= indent) break;
        const r = list(lines, i, base);
        inner += r.html;
        i = r.i;
      } else if (/^\s/.test(l) && !FENCE.test(l)) { text += " " + l.trim(); i++; }
      else break;
    }
    html += `<li>${inline(text, base)}${inner}</li>`;
  }
  const tag = ordered ? "ol" : "ul";
  return { html: `<${tag}>${html}</${tag}>`, i };
}
/**
 * src: Markdown text. prefix: put before every heading id. base: where relative links point. demote: how many
 * levels to push headings down (the page has its own h1). Returns {html, heads: [{level, id, text}]}.
 */
export function renderMarkdown(src, { prefix = "md", base = "", demote = 1 } = {}) {
  const lines = src.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  const out = [], heads = [], used = new Set();
  const slug = (text) => {
    const s = `${prefix}-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    let id = s, n = 2;
    while (used.has(id)) id = `${s}-${n++}`;
    used.add(id);
    return id;
  };
  const starts = (l, next) => FENCE.test(l) || HEAD.test(l) || LI.test(l) || (l.includes("|") && next != null && RULE.test(next) && next.includes("-"));
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (!line.trim()) { i++; continue; }
    if ((m = line.match(FENCE))) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(m[1])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
    } else if ((m = line.match(HEAD))) {
      const level = Math.min(6, m[1].length + demote), id = slug(m[2].replace(/[`*]/g, ""));
      heads.push({ level, id, text: m[2].replace(/[`*]/g, "") });
      out.push(`<h${level} id="${id}">${inline(m[2], base)}</h${level}>`);
      i++;
    } else if (line.includes("|") && i + 1 < lines.length && RULE.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const head = cells(line);
      const align = cells(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? "center" : /-:$/.test(c) ? "right" : ""));
      const at = (k) => (align[k] ? ` style="text-align:${align[k]}"` : "");
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) body.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map((c, k) => `<th scope="col"${at(k)}>${inline(c, base)}</th>`).join("")}</tr></thead><tbody>${
        body.map((r) => `<tr>${head.map((_, k) => `<td${at(k)}>${inline(r[k] ?? "", base)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    } else if (LI.test(line)) {
      const r = list(lines, i, base);
      out.push(r.html);
      i = r.i;
    } else {
      const buf = [line.trim()];
      i++;
      while (i < lines.length && lines[i].trim() && !starts(lines[i], lines[i + 1])) buf.push(lines[i++].trim());
      out.push(`<p>${inline(buf.join(" "), base)}</p>`);
    }
  }
  return { html: out.join("\n"), heads };
}
/* markdown:end */

// ---------- the three counts ----------
loadSite().then((site) => {
  const c = site.counts;
  $("stats").innerHTML = [
    [c.text, "values read from the text layer of a PDF"],
    [c.ocr, "values read from scanned pages, by OCR or by eye"],
    [c.hand_checked, "values checked by hand against the source page"],
  ].map(([n, label]) => `<div><p class="num-lg">${fmtInt(n)}</p><p class="small">${label}</p></div>`).join("");
}).catch((e) => { console.error(e); $("stats").innerHTML = `<p class="empty">Could not load the counts. ${esc(e.message)}</p>`; });

// ---------- the documents ----------
async function load([key, file]) {
  try {
    const r = await fetch(DL + file);
    if (!r.ok) throw new Error(`${r.status}`);
    const { html, heads } = renderMarkdown(await r.text(), { prefix: key, base: DL });
    return { heads, html: `<article class="doc" id="doc-${key}"><p class="doc-file">${esc(file)}, shown as written. <a href="${DL}${file}" download>Download</a></p>${html}</article>` };
  } catch (e) {
    console.error(e);
    return { heads: [], html: `<article class="doc"><p class="empty">Could not load ${esc(file)} (${esc(e.message)}). <a href="${DL}${file}">Open the file</a>.</p></article>` };
  }
}
Promise.all(DOCS.map(load)).then((docs) => {
  $("docs").innerHTML = docs.map((d) => d.html).join("");
  const heads = docs.flatMap((d) => d.heads).filter((h) => h.level <= 3);
  $("toc").innerHTML = heads.length
    ? `<p class="toc-title">On this page</p>${heads.map((h) => `<a href="#${h.id}"${h.level === 3 ? ' class="sub"' : ""}>${esc(h.text)}</a>`).join("")}`
    : "";
  // A link that arrived with a #fragment could not be honoured until the documents were drawn.
  if (location.hash.length > 1) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
});
