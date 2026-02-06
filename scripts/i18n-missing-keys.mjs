import fs from "node:fs";

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const es = read("src/i18n/es.json");
const en = read("src/i18n/en.json");
const fr = read("src/i18n/fr.json");

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

function missing(baseFlat, targetFlat) {
  return Object.keys(baseFlat).filter((k) => !(k in targetFlat));
}

const fEs = flatten(es);
const fEn = flatten(en);
const fFr = flatten(fr);

const missEn = missing(fEs, fEn);
const missFr = missing(fEs, fFr);

console.log("Missing in EN:", missEn.length);
missEn.slice(0, 50).forEach((k) => console.log("  -", k));

console.log("\nMissing in FR:", missFr.length);
missFr.slice(0, 50).forEach((k) => console.log("  -", k));

process.exit((missEn.length || missFr.length) ? 1 : 0);
