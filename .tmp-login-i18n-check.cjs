const fs = require("fs");

const login = fs.readFileSync("src/pages/Login.tsx", "utf8");
const keyRegex = /\bt\(\s*["']([^"']+)["']/g;
const keys = new Set();
let m;
while ((m = keyRegex.exec(login))) keys.add(m[1]);

const locales = {
  es: JSON.parse(fs.readFileSync("src/i18n/es.json", "utf8")),
  en: JSON.parse(fs.readFileSync("src/i18n/en.json", "utf8")),
  fr: JSON.parse(fs.readFileSync("src/i18n/fr.json", "utf8")),
};

const get = (obj, k) =>
  k.split(".").reduce((a, p) =>
    a && Object.prototype.hasOwnProperty.call(a, p) ? a[p] : undefined, obj
  );

const all = [...keys].sort();
const missing = [];
const sameAll = [];
const differentAll = [];

for (const k of all) {
  const vals = {};
  let miss = false;
  for (const lng of ["es", "en", "fr"]) {
    vals[lng] = get(locales[lng], k);
    if (vals[lng] === undefined) miss = true;
  }
  if (miss) {
    missing.push({ key: k, vals });
    continue;
  }
  if (
    typeof vals.es === "string" &&
    typeof vals.en === "string" &&
    typeof vals.fr === "string" &&
    vals.es === vals.en &&
    vals.en === vals.fr
  ) {
    sameAll.push({ key: k, value: vals.es });
  } else {
    differentAll.push({ key: k, vals });
  }
}

console.log("TOTAL_KEYS=" + all.length);
console.log("MISSING_COUNT=" + missing.length);
console.log("SAME_ALL_COUNT=" + sameAll.length);
console.log("DIFFERENT_ALL_COUNT=" + differentAll.length);
console.log("---MISSING---");
for (const x of missing) console.log(JSON.stringify(x));
console.log("---SAME_ALL---");
for (const x of sameAll) console.log(JSON.stringify(x));
