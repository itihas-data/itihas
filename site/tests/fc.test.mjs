// Checks the browser port of the Finance Commission formulas against the Python original.
// Run from the site folder:  node tests/fc.test.mjs
import { readFileSync } from "node:fs";
import { shares, fromRatios, movedPp } from "../assets/js/fc.js";

const here = new URL(".", import.meta.url);
const calc = JSON.parse(readFileSync(new URL("../data/calc.json", here)));
const vectors = JSON.parse(readFileSync(new URL("./fc_vectors.json", here)));
let failures = 0, checks = 0;
const fail = (msg) => { failures++; console.error("FAIL", msg); };

for (const [w, F] of Object.entries(calc)) {
  // 1. Published shares reproduced. The reports print shares to three decimals, so the
  //    rounding alone allows about 0.001 pp.
  const base = shares(F);
  let worstPub = 0;
  for (const s of F.S) worstPub = Math.max(worstPub, Math.abs(base[s] - F.published[s]));
  checks++;
  if (worstPub > 0.0011) fail(`${w}: published shares off by ${worstPub.toFixed(5)} pp`);

  // 2. Same numbers as Python on every test vector.
  let worst = 0;
  for (const c of vectors[w]) {
    const js = shares(F, fromRatios(F, c.ratios));
    for (const s of F.S) worst = Math.max(worst, Math.abs(js[s] - c.shares[s]));
    checks++;
  }
  if (worst > 1e-9) fail(`${w}: JS differs from Python by ${worst} pp`);

  // 3. Shares sum to 100.
  const tot = Object.values(base).reduce((a, b) => a + b, 0);
  checks++;
  if (Math.abs(tot - 100) > 1e-9) fail(`${w}: shares sum to ${tot}`);

  // 4. Scaling every state's GSDP by the same factor moves nothing. Exception: the 15th interim
  //    award's tax-effort term also uses 2014-15 per-capita GSDP as printed in the report, which
  //    the formula holds fixed, so a uniform change moves a tiny amount there.
  const all = {};
  for (const s of F.S) for (const fy of F.years) all[`${s}|${fy}`] = 1.07;
  const m = movedPp(base, shares(F, fromRatios(F, all)));
  checks++;
  if (m > (w === "fc15_interim" ? 0.001 : 1e-9)) fail(`${w}: uniform scaling moved ${m} pp`);

  console.log(`${w}: published within ${worstPub.toExponential(2)} pp; vs Python max ${worst.toExponential(2)} pp over ${vectors[w].length} cases; uniform 7% moves ${m.toExponential(2)} pp`);
}
console.log(failures ? `${failures} of ${checks} checks failed` : `all ${checks} checks passed`);
process.exit(failures ? 1 : 0);
