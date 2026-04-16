import fs from "node:fs/promises";
import path from "node:path";

const i18nDir = path.resolve("src/i18n");
const localeFiles = ["es.json", "en.json", "fr.json"];

function getValueType(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

async function readJson(fileName) {
  const filePath = path.join(i18nDir, fileName);
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function flattenObject(input, prefix = "", acc = new Map()) {
  if (getValueType(input) !== "object") {
    if (prefix) acc.set(prefix, getValueType(input));
    return acc;
  }

  for (const [key, value] of Object.entries(input)) {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    const valueType = getValueType(value);

    acc.set(nextPath, valueType);

    if (valueType === "object") {
      flattenObject(value, nextPath, acc);
    }
  }

  return acc;
}

function compareLocales(flattenedByLocale) {
  const allPaths = new Set();
  for (const flattened of Object.values(flattenedByLocale)) {
    for (const keyPath of flattened.keys()) {
      allPaths.add(keyPath);
    }
  }

  const missingByLocale = new Map();
  const extraByLocale = new Map();
  const typeMismatches = [];

  for (const locale of Object.keys(flattenedByLocale)) {
    missingByLocale.set(locale, []);
    extraByLocale.set(locale, []);
  }

  for (const keyPath of [...allPaths].sort()) {
    const presentLocales = [];
    const missingLocales = [];
    const types = new Map();

    for (const [locale, flattened] of Object.entries(flattenedByLocale)) {
      if (flattened.has(keyPath)) {
        presentLocales.push(locale);
        types.set(locale, flattened.get(keyPath));
      } else {
        missingLocales.push(locale);
      }
    }

    if (missingLocales.length > 0 && presentLocales.length > 0) {
      for (const locale of missingLocales) {
        missingByLocale.get(locale).push(keyPath);
      }
      for (const locale of presentLocales) {
        extraByLocale.get(locale).push(keyPath);
      }
    }

    const distinctTypes = [...new Set(types.values())];
    if (distinctTypes.length > 1) {
      typeMismatches.push({
        keyPath,
        types: Object.fromEntries(types),
      });
    }
  }

  return { missingByLocale, extraByLocale, typeMismatches };
}

function printSection(title, items) {
  if (!items.length) return;
  console.log(`\n${title}`);
  for (const item of items) {
    console.log(`  - ${item}`);
  }
}

async function main() {
  const localeEntries = await Promise.all(
    localeFiles.map(async (fileName) => {
      const locale = path.basename(fileName, ".json");
      const json = await readJson(fileName);
      return [locale, flattenObject(json)];
    })
  );

  const flattenedByLocale = Object.fromEntries(localeEntries);
  const { missingByLocale, extraByLocale, typeMismatches } = compareLocales(flattenedByLocale);

  let hasDiffs = false;

  for (const locale of Object.keys(flattenedByLocale)) {
    const missing = missingByLocale.get(locale) || [];
    const extra = extraByLocale.get(locale) || [];

    if (missing.length || extra.length) {
      hasDiffs = true;
      console.log(`\nLocale ${locale}.json`);
      printSection("Missing keys:", missing);
      printSection("Extra keys:", extra);
    }
  }

  if (typeMismatches.length) {
    hasDiffs = true;
    console.log("\nType mismatches:");
    for (const mismatch of typeMismatches) {
      const details = Object.entries(mismatch.types)
        .map(([locale, type]) => `${locale}=${type}`)
        .join(", ");
      console.log(`  - ${mismatch.keyPath}: ${details}`);
    }
  }

  if (hasDiffs) {
    console.error("\nI18n validation failed.");
    process.exit(1);
  }

  console.log("I18n validation passed: es.json, en.json, and fr.json match.");
}

main().catch((error) => {
  console.error("I18n validation error:", error);
  process.exit(1);
});
