// scripts/i18n-audit.mjs
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const I18N_DIR = path.join(ROOT, "src", "i18n");

const FILES = [
  { code: "es", file: "es.json" },
  { code: "en", file: "en.json" },
  { code: "fr", file: "fr.json" },
];

function readJson(absPath) {
  const raw = fs.readFileSync(absPath, "utf8");
  return JSON.parse(raw);
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function flattenKeys(obj, prefix = "") {
  const out = new Map();

  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      const key = prefix ? `${prefix}[${idx}]` : `[${idx}]`;
      if (isPlainObject(item) || Array.isArray(item)) {
        for (const [k, v] of flattenKeys(item, key)) out.set(k, v);
      } else {
        out.set(key, item);
      }
    });
    return out;
  }

  if (!isPlainObject(obj)) {
    if (prefix) out.set(prefix, obj);
    return out;
  }

  for (const [k, v] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v) || Array.isArray(v)) {
      for (const [kk, vv] of flattenKeys(v, next)) out.set(kk, vv);
    } else {
      out.set(next, v);
    }
  }

  return out;
}

function getAllStructuralKeys(obj, prefix = "", out = new Set()) {
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      const key = prefix ? `${prefix}[${idx}]` : `[${idx}]`;
      out.add(key);
      getAllStructuralKeys(item, key, out);
    });
    return out;
  }

  if (!isPlainObject(obj)) {
    if (prefix) out.add(prefix);
    return out;
  }

  for (const [k, v] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    out.add(next);
    getAllStructuralKeys(v, next, out);
  }

  return out;
}

function setDiff(a, b) {
  return [...a].filter((x) => !b.has(x)).sort();
}

function intersectAll(sets) {
  if (!sets.length) return new Set();
  const [first, ...rest] = sets;
  return new Set([...first].filter((x) => rest.every((s) => s.has(x))));
}

function unionAll(sets) {
  const out = new Set();
  for (const s of sets) {
    for (const x of s) out.add(x);
  }
  return out;
}

function countPlaceholders(str) {
  if (typeof str !== "string") return [];
  const matches = str.match(/\{\{[^}]+\}\}/g);
  return matches ? matches.sort() : [];
}

function comparePlaceholders(baseMap, otherMap) {
  const mismatches = [];

  for (const [key, baseVal] of baseMap.entries()) {
    const otherVal = otherMap.get(key);
    if (typeof baseVal !== "string" || typeof otherVal !== "string") continue;

    const a = countPlaceholders(baseVal).join("|");
    const b = countPlaceholders(otherVal).join("|");

    if (a !== b) {
      mismatches.push({
        key,
        base: countPlaceholders(baseVal),
        other: countPlaceholders(otherVal),
      });
    }
  }

  return mismatches;
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function printList(title, items, limit = 200) {
  console.log(`\n${title}: ${items.length}`);
  items.slice(0, limit).forEach((x) => console.log(`- ${x}`));
  if (items.length > limit) {
    console.log(`... +${items.length - limit} more`);
  }
}

function main() {
  const loaded = [];
  const errors = [];

  for (const { code, file } of FILES) {
    const abs = path.join(I18N_DIR, file);

    if (!fs.existsSync(abs)) {
      errors.push(`${file} not found`);
      continue;
    }

    try {
      const json = readJson(abs);
      loaded.push({
        code,
        file,
        abs,
        json,
        flat: flattenKeys(json),
        structural: getAllStructuralKeys(json),
      });
    } catch (err) {
      errors.push(`${file} invalid JSON: ${err.message}`);
    }
  }

  if (errors.length) {
    printSection("FATAL");
    errors.forEach((e) => console.error(`- ${e}`));
    process.exit(1);
  }

  printSection("FILES");
  loaded.forEach((x) => {
    console.log(
      `- ${x.file} | flat keys: ${x.flat.size} | structural keys: ${x.structural.size}`
    );
  });

  const structuralSets = loaded.map((x) => x.structural);
  const allStructural = unionAll(structuralSets);
  const commonStructural = intersectAll(structuralSets);

  printSection("SUMMARY");
  console.log(`- Common structural keys in all languages: ${commonStructural.size}`);
  console.log(`- Union structural keys across languages: ${allStructural.size}`);

  for (const lang of loaded) {
    const missing = setDiff(allStructural, lang.structural);
    const extra = setDiff(lang.structural, commonStructural);

    printList(`Missing in ${lang.code}`, missing);
    printList(`Extra/non-common in ${lang.code}`, extra);
  }

  const base = loaded.find((x) => x.code === "es") || loaded[0];

  for (const lang of loaded) {
    if (lang.code === base.code) continue;

    const missingFlat = setDiff(new Set(base.flat.keys()), new Set(lang.flat.keys()));
    const extraFlat = setDiff(new Set(lang.flat.keys()), new Set(base.flat.keys()));

    printSection(`COMPARE ${base.code.toUpperCase()} -> ${lang.code.toUpperCase()}`);
    printList(`Missing leaf keys in ${lang.code}`, missingFlat);
    printList(`Extra leaf keys in ${lang.code}`, extraFlat);

    const placeholderMismatches = comparePlaceholders(base.flat, lang.flat);
    console.log(`\nPlaceholder mismatches (${lang.code}): ${placeholderMismatches.length}`);
    placeholderMismatches.slice(0, 200).forEach((m) => {
      console.log(`- ${m.key}`);
      console.log(`  base : ${JSON.stringify(m.base)}`);
      console.log(`  other: ${JSON.stringify(m.other)}`);
    });
    if (placeholderMismatches.length > 200) {
      console.log(`... +${placeholderMismatches.length - 200} more`);
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    files: loaded.map((x) => ({
      code: x.code,
      file: x.file,
      flat_keys: x.flat.size,
      structural_keys: x.structural.size,
    })),
    common_structural_keys: commonStructural.size,
    union_structural_keys: allStructural.size,
    per_language: Object.fromEntries(
      loaded.map((lang) => [
        lang.code,
        {
          missing_structural: setDiff(allStructural, lang.structural),
          extra_non_common_structural: setDiff(lang.structural, commonStructural),
        },
      ])
    ),
    leaf_compare_from_es: Object.fromEntries(
      loaded
        .filter((x) => x.code !== base.code)
        .map((lang) => [
          lang.code,
          {
            missing_leaf: setDiff(new Set(base.flat.keys()), new Set(lang.flat.keys())),
            extra_leaf: setDiff(new Set(lang.flat.keys()), new Set(base.flat.keys())),
            placeholder_mismatches: comparePlaceholders(base.flat, lang.flat),
          },
        ])
    ),
  };

  const outDir = path.join(ROOT, "tmp");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, "i18n-audit-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  printSection("REPORT");
  console.log(`- JSON report written to: ${outPath}`);

  const hasProblems =
    loaded.some((lang) => setDiff(allStructural, lang.structural).length > 0) ||
    loaded.some((lang) => setDiff(lang.structural, commonStructural).length > 0) ||
    loaded
      .filter((x) => x.code !== base.code)
      .some((lang) => comparePlaceholders(base.flat, lang.flat).length > 0);

  if (hasProblems) {
    printSection("RESULT");
    console.log("- Differences found. Review report before deploy.");
    process.exit(2);
  }

  printSection("RESULT");
  console.log("- OK. Languages are structurally aligned.");
}

main();