// Finance Commission horizontal devolution formulas: a line-for-line port of scripts/fc/fc_core.py.
// Pure functions, no DOM, so the same file runs in the browser and in the Node test.
// Sources: XV-FC Vol I End Note pp.166-167 and 2020-21 report End Note pp.31-32;
// XVI-FC Vol I Technical Note pp.173-175. Only GSDP can be changed; every other input is the published value.

const norm = (d) => {
  let s = 0;
  for (const k in d) s += d[k];
  const o = {};
  for (const k in d) o[k] = d[k] / s;
  return o;
};

function parts15(F, G) {
  const S = F.S, yrs = F.years;
  const pc = {};
  for (const s of S) { pc[s] = {}; for (const fy of yrs) pc[s][fy] = (G(s, fy) * 1e7) / (F.pop[s][fy]); }
  const Y = {};
  for (const s of S) Y[s] = yrs.reduce((a, fy) => a + pc[s][fy], 0) / 3;
  const rank = [...S].sort((a, b) => Y[b] - Y[a]);
  const bench = rank[2], fourth = rank[3];
  const d = {};
  for (const s of S) d[s] = Y[bench] - Y[s];
  for (const s of rank.slice(0, 3)) d[s] = Y[bench] - Y[fourth];
  const C = { ...F.fixedC };
  const id = {};
  for (const s of S) id[s] = d[s] * F.P11[s];
  C.income_distance = norm(id);
  const pcte = (s, fy) => (yrs.includes(fy) ? pc[s][fy] : F.pc_printed[s][fy]);
  const te = {};
  for (const s of S) te[s] = (F.pcotr[s] / (F.tey.reduce((a, fy) => a + pcte(s, fy), 0) / 3)) * F.P11[s];
  C.tax_effort = norm(te);
  return C;
}

function parts16(F, G) {
  const S = F.S, yrs = F.years;
  const gs = {}, pop = {}, Y = {};
  for (const s of S) {
    gs[s] = yrs.map((fy) => G(s, fy));
    pop[s] = yrs.map((fy) => F.pop[s][fy]);
    Y[s] = gs[s].reduce((a, g, i) => a + (10 * g) / pop[s][i], 0) / 5;
  }
  const large = S.filter((s) => s !== "Goa" && s !== "Sikkim").sort((a, b) => Y[b] - Y[a]);
  const top3 = large.slice(0, 3), fourth = large[3];
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const ystar = (10 * sum(top3.map((s) => sum(gs[s])))) / sum(top3.map((s) => sum(pop[s])));
  const d = {};
  for (const s of S) d[s] = ystar - Y[s];
  for (const s of [...top3, fourth, "Goa", "Sikkim"]) d[s] = ystar - Y[fourth];
  const C = { ...F.fixedC };
  const id = {}, gc = {};
  for (const s of S) { id[s] = d[s] * F.P11[s]; gc[s] = Math.sqrt(sum(gs[s]) / 5); }
  C.income_distance = norm(id);
  C.gdp_contribution = norm(gc);
  return C;
}

/**
 * Shares in per cent. `override` maps "State|2018-19" to a GSDP value in Rs crore.
 * F is one award's entry from data/calc.json.
 */
export function shares(F, override = {}) {
  const G = (s, fy) => {
    const k = `${s}|${fy}`;
    return k in override ? override[k] : F.gsdp[s][fy];
  };
  const C = F.which === "fc16" ? parts16(F, G) : parts15(F, G);
  const out = {};
  for (const s of F.S) {
    let v = 0;
    for (const k in F.W) v += F.W[k] * C[k][s];
    out[s] = 100 * v;
  }
  return out;
}

/** Override map from GSDP multipliers: {"State|fy": ratio}. */
export function fromRatios(F, ratios) {
  const o = {};
  for (const k in ratios) {
    const [s, fy] = k.split("|");
    if (F.gsdp[s] && F.gsdp[s][fy] != null) o[k] = F.gsdp[s][fy] * ratios[k];
  }
  return o;
}

/** Percentage points of the pool that move between states. */
export const movedPp = (a, b) => Object.keys(a).reduce((t, s) => t + Math.abs(a[s] - b[s]), 0) / 2;
