// One-off preparation of the map outlines in geo/india.json. Not part of the site build.
//
// Source: DataMeet India community, "maps" repository, States/Admin2 (CC BY 4.0)
//   https://github.com/datameet/maps/tree/master/States
//   Admin2.shp sha256 b61ebc11a7487ce1c340d55fc9d0c1a2b63af1f73191fef691c11693c726130d (fetched 10 Nov 2026)
//
// Step 1 (mapshaper 0.7.101, run once through npx; nothing from it ships):
//   npx -y mapshaper Admin2.shp snap -clean -simplify weighted percentage=0.8% keep-shapes -clean \
//       -o precision=0.001 format=geojson india_simplified.json
// Step 2 (this script): tag each shape with the site's state code, check ring winding for D3,
//   and write geo/india.json.
//   node scripts/prepare_map.mjs <india_simplified.json>
//
// The simplification is uniform (about 100 m coordinate precision). No shape is dropped or added.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const d3 = require("../assets/vendor/d3-7.9.0.min.js");

const CODES = {
  "Andhra Pradesh": "AP", "Arunachal Pradesh": "AR", "Assam": "AS", "Bihar": "BR", "Chhattisgarh": "CG",
  "Goa": "GA", "Gujarat": "GJ", "Haryana": "HR", "Himachal Pradesh": "HP", "Jharkhand": "JH",
  "Karnataka": "KA", "Kerala": "KL", "Madhya Pradesh": "MP", "Maharashtra": "MH", "Manipur": "MN",
  "Meghalaya": "ML", "Mizoram": "MZ", "Nagaland": "NL", "Odisha": "OD", "Punjab": "PB", "Rajasthan": "RJ",
  "Sikkim": "SK", "Tamil Nadu": "TN", "Telangana": "TS", "Tripura": "TR", "Uttar Pradesh": "UP",
  "Uttarakhand": "UK", "West Bengal": "WB", "Jammu & Kashmir": "JK", "Ladakh": "LA",
  "Andaman & Nicobar": "AN", "Chandigarh": "CH", "Delhi": "DL", "Puducherry": "PY",
  // Units with no GSDP series in the database: drawn, never left off.
  "Lakshadweep": "LD", "Dadra and Nagar Haveli and Daman and Diu": "DN",
};
const NAMES = { LD: "Lakshadweep", DN: "Dadra and Nagar Haveli and Daman and Diu", AN: "Andaman and Nicobar Islands", JK: "Jammu and Kashmir" };

const src = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (src.features.length !== 36) throw new Error(`expected 36 shapes, found ${src.features.length}`);
const out = { type: "FeatureCollection", features: [] };
for (const f of src.features) {
  const name = f.properties.ST_NM, code = CODES[name];
  if (!code) throw new Error(`no code for ${name}`);
  const feat = { type: "Feature", properties: { code, name: NAMES[code] || name }, geometry: f.geometry };
  // D3 treats a ring wound the "wrong" way as covering the rest of the globe. Reverse if so.
  if (d3.geoArea(feat) > 2 * Math.PI) {
    const rev = (poly) => poly.map((ring) => ring.slice().reverse());
    feat.geometry = feat.geometry.type === "Polygon"
      ? { type: "Polygon", coordinates: rev(feat.geometry.coordinates) }
      : { type: "MultiPolygon", coordinates: feat.geometry.coordinates.map(rev) };
    if (d3.geoArea(feat) > 2 * Math.PI) throw new Error(`winding not fixed for ${name}`);
  }
  out.features.push(feat);
}
out.features.sort((a, b) => a.properties.name.localeCompare(b.properties.name));
const b = d3.geoBounds(out);
writeFileSync(new URL("../geo/india.json", import.meta.url), JSON.stringify(out));
console.log(`wrote geo/india.json: ${out.features.length} shapes; bounds ${JSON.stringify(b.map((p) => p.map((v) => +v.toFixed(3))))}`);
