import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");
const localEnvPath = path.join(projectRoot, ".env.local");

if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}

const i18nDir = path.join(projectRoot, "src/i18n");
const esPath = path.join(i18nDir, "es.json");
const cachePath = path.join(projectRoot, "tmp", "i18n-translate-cache.json");
const targets = [
  { filePath: path.join(i18nDir, "en.json"), locale: "en", targetLang: "EN" },
  { filePath: path.join(i18nDir, "fr.json"), locale: "fr", targetLang: "FR" },
];

const PLACEHOLDER_REGEX = /\{\{\s*[^{}]+\s*\}\}|\{[^{}]+\}|%s|:[A-Za-z_][A-Za-z0-9_]*/g;
const CHUNK_SIZE = 50;

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const DEEPL_API_URL = process.env.DEEPL_API_URL;

function assertDeepLConfig() {
  if (!DEEPL_API_KEY || !DEEPL_API_URL) {
    console.error("[i18n-translate] Missing DEEPL_API_KEY or DEEPL_API_URL in process.env");
    process.exit(1);
  }
}

// Flatten all string leaves into [{ path: (string|number)[], value: string }]
function flattenStrings(obj, prefix = []) {
  const result = [];
  if (typeof obj === "string") {
    result.push({ path: prefix, value: obj });
  } else if (Array.isArray(obj)) {
    obj.forEach((item, i) => result.push(...flattenStrings(item, [...prefix, i])));
  } else if (obj && typeof obj === "object") {
    for (const [key, val] of Object.entries(obj)) {
      result.push(...flattenStrings(val, [...prefix, key]));
    }
  }
  return result;
}

// Replace placeholders with opaque tokens; returns masked string + restore map
function maskPlaceholders(text) {
  const map = {};
  let i = 0;
  const masked = text.replace(PLACEHOLDER_REGEX, (match) => {
    const token = `__PH${i++}__`;
    map[token] = match;
    return token;
  });
  return { masked, map };
}

// Restore tokens back to original placeholders
function restorePlaceholders(text, map) {
  return text.replace(/__PH\d+__/g, (token) => map[token] ?? token);
}

// Set a value in a nested object/array by path array
function setByPath(obj, pathArr, value) {
  let cur = obj;
  for (let i = 0; i < pathArr.length - 1; i++) {
    cur = cur[pathArr[i]];
  }
  cur[pathArr[pathArr.length - 1]] = value;
}

function loadPersistentCache() {
  if (!fs.existsSync(cachePath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (err) {
    console.warn(`[i18n-translate] Invalid cache file, starting fresh: ${err.message}`);
  }

  return {};
}

function savePersistentCache(cache) {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

function getLocaleCache(cache, targetLang) {
  if (!cache[targetLang] || typeof cache[targetLang] !== "object") {
    cache[targetLang] = {};
  }
  return cache[targetLang];
}

// Send one chunk to DeepL; on any failure return originals for that chunk
async function translateBatch(texts, targetLang) {
  try {
    const response = await fetch(DEEPL_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `DeepL-Auth-Key ${DEEPL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: texts,
        source_lang: "ES",
        target_lang: targetLang.toUpperCase(),
        preserve_formatting: true,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(`[i18n-translate] Batch failed (${response.status}): ${detail || response.statusText} — using originals`);
      return { ok: false, translated: texts };
    }

    const data = await response.json();
    const translated = data?.translations?.map((t) => t.text);
    if (!Array.isArray(translated) || translated.length !== texts.length) {
      console.warn("[i18n-translate] Unexpected DeepL response shape — using originals");
      return { ok: false, translated: texts };
    }
    return { ok: true, translated };
  } catch (err) {
    console.warn(`[i18n-translate] Batch error: ${err.message} — using originals`);
    return { ok: false, translated: texts };
  }
}

const BATCH_DELAY_MS = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function translateLocale(es, targetLang, persistentCache) {
  // Step 1: flatten all string leaves
  const leaves = flattenStrings(es);

  // Step 2: mask placeholders; keep restore maps per leaf
  const masked = leaves.map((leaf) => maskPlaceholders(leaf.value));
  const maskedTexts = masked.map((m) => m.masked);

  // Step 3: deduplicate repeated strings and only translate cache misses
  const localeCache = getLocaleCache(persistentCache, targetLang);
  const uniqueMaskedTexts = [...new Set(maskedTexts)];
  const missing = uniqueMaskedTexts.filter((text) => typeof localeCache[text] !== "string");
  const cacheHits = uniqueMaskedTexts.length - missing.length;

  // Step 4: batch-translate only unique cache misses in CHUNK_SIZE chunks
  const chunks = chunkArray(missing, CHUNK_SIZE);
  console.log(
    `[i18n-translate] ${targetLang}: ${maskedTexts.length} string(s), ${uniqueMaskedTexts.length} unique, ${missing.length} miss(es) → ${chunks.length} batch(es)`
  );

  let fallbackCount = 0;
  let batchesSent = 0;

  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) await sleep(BATCH_DELAY_MS);
    const batch = chunks[i];
    batchesSent += 1;
    const result = await translateBatch(batch, targetLang);

    // Cache only successful DeepL responses; failed batches keep originals and remain uncached.
    if (result.ok) {
      batch.forEach((source, idx) => {
        localeCache[source] = result.translated[idx];
      });
    } else {
      fallbackCount += 1;
    }
  }

  const translatedMasked = maskedTexts.map((text) => localeCache[text] ?? text);

  // Step 5: restore placeholders in each translated string
  const translatedStrings = translatedMasked.map((text, i) =>
    restorePlaceholders(text, masked[i].map)
  );

  // Step 6: rebuild JSON from a deep clone of es.json
  const output = JSON.parse(JSON.stringify(es));
  leaves.forEach((leaf, i) => {
    setByPath(output, leaf.path, translatedStrings[i]);
  });

  return {
    output,
    metrics: {
      cacheHits,
      cacheMisses: missing.length,
      batchesSent,
      fallbackCount,
      cacheFilePath: cachePath,
    },
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  assertDeepLConfig();

  if (!fs.existsSync(esPath)) {
    console.error(`[i18n-translate] Source file not found: ${esPath}`);
    process.exit(1);
  }

  const es = readJson(esPath);
  const persistentCache = loadPersistentCache();

  for (const target of targets) {
    const { output, metrics } = await translateLocale(es, target.targetLang, persistentCache);
    const translated = output;
    writeJson(target.filePath, translated);
    savePersistentCache(persistentCache);
    console.log(`[i18n-translate] Generated ${target.locale}.json`);
    console.log(
      `[i18n-translate] Summary ${target.locale}: cache_hits=${metrics.cacheHits}, cache_misses=${metrics.cacheMisses}, batches_sent=${metrics.batchesSent}, fallback_count=${metrics.fallbackCount}, cache_file=${metrics.cacheFilePath}`
    );
  }
}

main().catch((error) => {
  console.error("[i18n-translate] Failed:", error);
  process.exit(1);
});