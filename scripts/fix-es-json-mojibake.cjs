const fs = require("fs");

const file = "src/i18n/es.json";
const raw = fs.readFileSync(file, "utf8");
const data = JSON.parse(raw);

const mojibakeRegex = /Ã|Â|â|�/;

function fixMojibakeString(value) {
  if (typeof value !== "string") return value;
  if (!mojibakeRegex.test(value)) return value;

  let current = value;
  for (let i = 0; i < 3; i += 1) {
    const fixed = Buffer.from(current, "latin1").toString("utf8");
    if (fixed === current) break;
    current = fixed;
    if (!mojibakeRegex.test(current)) break;
  }
  return current;
}

function walk(value) {
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = walk(v);
    return out;
  }
  return fixMojibakeString(value);
}

const fixed = walk(data);
fs.writeFileSync(file, JSON.stringify(fixed, null, 2) + "\n", "utf8");

JSON.parse(fs.readFileSync(file, "utf8"));
console.log("es.json mojibake fixed and JSON valid");
