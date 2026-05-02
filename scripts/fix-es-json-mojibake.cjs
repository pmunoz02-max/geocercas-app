const fs = require("fs");

const file = "src/i18n/es.json";
const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
const data = JSON.parse(raw);

const cp1252 = new Map([
  [0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83], [0x201E, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02C6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8A], [0x2039, 0x8B], [0x0152, 0x8C],
  [0x017D, 0x8E], [0x2018, 0x91], [0x2019, 0x92], [0x201C, 0x93],
  [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A], [0x203A, 0x9B],
  [0x0153, 0x9C], [0x017E, 0x9E], [0x0178, 0x9F],
]);

const mojibakeRegex = /[ÃÂâð�]/;

function encodeWin1252(str) {
  const bytes = [];
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code <= 0xff) bytes.push(code);
    else if (cp1252.has(code)) bytes.push(cp1252.get(code));
    else return null;
  }
  return Buffer.from(bytes);
}

function fixString(value) {
  if (typeof value !== "string") return value;
  if (!mojibakeRegex.test(value)) return value;

  let current = value;

  for (let i = 0; i < 3; i += 1) {
    const encoded = encodeWin1252(current);
    if (!encoded) break;

    const fixed = encoded.toString("utf8");
    if (!fixed || fixed === current) break;

    current = fixed;
    if (!mojibakeRegex.test(current)) break;
  }

  return current;
}

function walk(value) {
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = walk(v);
    }
    return out;
  }
  return fixString(value);
}

const fixed = walk(data);
fs.writeFileSync(file, JSON.stringify(fixed, null, 2) + "\n", "utf8");

JSON.parse(fs.readFileSync(file, "utf8"));
console.log("es.json mojibake fixed and JSON valid");
