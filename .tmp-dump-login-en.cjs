const fs = require("fs");
const en = JSON.parse(fs.readFileSync("src/i18n/en.json", "utf8"));
function walk(obj, path = [], out = []) {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) walk(v, [...path, k], out);
  } else if (typeof obj === "string") {
    out.push({ key: path.join('.'), value: obj });
  }
  return out;
}
const entries = walk(en.login, ["login"]);
for (const e of entries) console.log(`${e.key}=${e.value}`);
