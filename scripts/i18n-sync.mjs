import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const i18nDir = path.join(__dirname, "../src/i18n");
const esPath = path.join(i18nDir, "es.json");
const enPath = path.join(i18nDir, "en.json");
const frPath = path.join(i18nDir, "fr.json");
const VALID_MODES = new Set(["sync", "fake-translate"]);

function transformTree(value, transformString) {
  if (typeof value === "string") {
    return transformString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => transformTree(item, transformString));
  }

  if (value && typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value)) {
      result[key] = transformTree(value[key], transformString);
    }
    return result;
  }

  return value;
}

function prefixString(prefix) {
  return (value) => {
    if (typeof value !== "string") return value;
    return `${prefix}${value}`;
  };
}

function identity(value) {
  return value;
}

function parseMode(argv) {
  const rawModeArg = argv.find((arg) => arg.startsWith("--mode="));
  const mode = rawModeArg ? rawModeArg.slice("--mode=".length).trim() : "sync";

  if (!VALID_MODES.has(mode)) {
    console.error(`[i18n-sync] Invalid mode: ${mode}`);
    console.error(`[i18n-sync] Supported modes: ${[...VALID_MODES].join(", ")}`);
    process.exit(1);
  }

  return mode;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function main() {
  const mode = parseMode(process.argv.slice(2));

  if (!fs.existsSync(esPath)) {
    console.error(`[i18n-sync] Source file not found: ${esPath}`);
    process.exit(1);
  }

  const es = readJson(esPath);
  const enTransform = mode === "fake-translate" ? prefixString("[TODO EN] ") : identity;
  const frTransform = mode === "fake-translate" ? prefixString("[TODO FR] ") : identity;

  const en = transformTree(es, enTransform);
  const fr = transformTree(es, frTransform);

  writeJson(enPath, en);
  writeJson(frPath, fr);

  console.log(`[i18n-sync] Mode: ${mode}`);
  console.log(`[i18n-sync] Generated ${enPath}`);
  console.log(`[i18n-sync] Generated ${frPath}`);
}

main();