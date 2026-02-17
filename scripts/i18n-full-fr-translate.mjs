#!/usr/bin/env node
/**
 * i18n-full-fr-translate.mjs
 * - Base: ES (src/i18n/es.json)
 * - Target: FR (src/i18n/fr.json)
 * - Traduce por DeepL: missing + looks_english + same_as_base + force-keys
 * - FORCE_KEYS_FILE: lista de key-paths que SIEMPRE se traducen desde ES y sobrescriben FR
 *
 * Env:
 *   DEEPL_API_KEY (required)
 *   DEEPL_API_URL (default https://api-free.deepl.com/v2/translate)
 *   LOCALES_DIR (default src/i18n)
 *   ES_PATH / FR_PATH (optional overrides)
 *   I18N_BATCH_SIZE (default 10)
 *   I18N_RETRY_MAX (default 6)
 *   I18N_RETRY_BASE_MS (default 600)
 *   REMOVE_EXTRA=1 (optional prune keys not in ES)
 *   DRY_RUN=1 (optional no writes)
 *   FORCE_KEYS_FILE (optional, default "")
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ENV = process.env;

const LOCALES_DIR = ENV.LOCALES_DIR || "src/i18n";
const ES_PATH = ENV.ES_PATH || path.join(LOCALES_DIR, "es.json");
const FR_PATH = ENV.FR_PATH || path.join(LOCALES_DIR, "fr.json");

const DEEPL_API_KEY = ENV.DEEPL_API_KEY;
const DEEPL_API_URL = ENV.DEEPL_API_URL || "https://api-free.deepl.com/v2/translate";

const I18N_BATCH_SIZE = toInt(ENV.I18N_BATCH_SIZE, 10);
const I18N_RETRY_MAX = toInt(ENV.I18N_RETRY_MAX, 6);
const I18N_RETRY_BASE_MS = toInt(ENV.I18N_RETRY_BASE_MS, 600);

const REMOVE_EXTRA = ENV.REMOVE_EXTRA === "1";
const DRY_RUN = ENV.DRY_RUN === "1";

const FORCE_KEYS_FILE = (ENV.FORCE_KEYS_FILE || "").trim();

if (!DEEPL_API_KEY) {
  console.error("❌ Missing DEEPL_API_KEY in env.");
  process.exit(1);
}

function toInt(v, d) {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : d;
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, obj) {
  const json = JSON.stringify(obj, null, 2) + "\n";
  fs.writeFileSync(p, json, "utf8");
}

function isObject(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

function deepClone(x) {
  return JSON.parse(JSON.stringify(x));
}

function normalizeNewlines(s) {
  return String(s).replace(/\r\n/g, "\n");
}

/**
 * getByPath(obj, "a.b.0.c")
 */
function getByPath(obj, keyPath) {
  if (!keyPath) return undefined;
  const parts = String(keyPath).split(".");
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    const isIndex = /^\d+$/.test(part);
    cur = isIndex ? cur[Number(part)] : cur[part];
  }
  return cur;
}

/**
 * setByPath(obj, "a.b.0.c", value)
 * Creates intermediate objects/arrays as needed.
 */
function setByPath(obj, keyPath, value) {
  const parts = String(keyPath).split(".");
  let cur = obj;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const last = i === parts.length - 1;
    const nextPart = parts[i + 1];
    const nextIsIndex = nextPart != null && /^\d+$/.test(nextPart);
    const isIndex = /^\d+$/.test(part);

    if (last) {
      if (isIndex) cur[Number(part)] = value;
      else cur[part] = value;
      return;
    }

    if (isIndex) {
      const idx = Number(part);
      if (!Array.isArray(cur)) {
        // convert current slot into array if needed
        // (this happens only if someone set mismatched structures)
      }
      if (cur[idx] == null || (nextIsIndex ? !Array.isArray(cur[idx]) : !isObject(cur[idx]))) {
        cur[idx] = nextIsIndex ? [] : {};
      }
      cur = cur[idx];
    } else {
      if (cur[part] == null || (nextIsIndex ? !Array.isArray(cur[part]) : !isObject(cur[part]))) {
        cur[part] = nextIsIndex ? [] : {};
      }
      cur = cur[part];
    }
  }
}

/**
 * Flatten strings into keyPath->value
 */
function flattenStrings(obj, prefix = "") {
  const out = [];
  if (typeof obj === "string") {
    out.push({ keyPath: prefix, value: obj });
    return out;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const p = prefix ? `${prefix}.${i}` : String(i);
      out.push(...flattenStrings(obj[i], p));
    }
    return out;
  }
  if (isObject(obj)) {
    for (const k of Object.keys(obj)) {
      const p = prefix ? `${prefix}.${k}` : k;
      out.push(...flattenStrings(obj[k], p));
    }
    return out;
  }
  return out;
}

/**
 * Remove keys from target that are not present in base
 */
function pruneToBase(target, base) {
  if (typeof base === "string") return target; // keep whatever string (will be replaced by translate logic)
  if (Array.isArray(base)) {
    if (!Array.isArray(target)) return deepClone(base);
    const arr = [];
    for (let i = 0; i < base.length; i++) {
      if (i in base) arr[i] = pruneToBase(target?.[i], base[i]);
    }
    return arr;
  }
  if (isObject(base)) {
    const obj = {};
    for (const k of Object.keys(base)) {
      obj[k] = pruneToBase(target?.[k], base[k]);
    }
    return obj;
  }
  // numbers/booleans/null – mirror base
  return deepClone(base);
}

/**
 * Heuristic: looks like English (loose, but helpful)
 * - You can tweak patterns safely.
 */
function looksEnglish(s) {
  const t = String(s || "").trim();
  if (!t) return false;

  // If already clearly French (accents or common FR articles), skip:
  if (/[àâçéèêëîïôùûüÿœæ]/i.test(t)) return false;
  if (/\b(le|la|les|des|une|un|du|de|et|pour|avec|sans|sur|dans)\b/i.test(t)) return false;

  // English-ish triggers:
  if (/\b(sign in|log in|logout|dashboard|help|support|terms|privacy|reset password|loading|send|saving|back|view|table of contents|preparing|recovery link)\b/i.test(t)) {
    return true;
  }

  // Many common English words (basic signal)
  const hits = (t.match(/\b(the|and|or|to|from|with|without|your|you|are|is|in|on|of|for|please|select|create|invite|profile|status|error|timeout)\b/gi) || []).length;
  if (hits >= 2) return true;

  // If mostly ASCII letters/spaces and ends with typical EN punctuation patterns
  const asciiRatio = (t.match(/[\x20-\x7E]/g) || []).length / Math.max(1, t.length);
  if (asciiRatio > 0.98 && t.length >= 6 && /[a-z]/i.test(t) && !/[¿¡]/.test(t)) {
    // still might be ES without accents; keep this as weak signal:
    if (hits >= 1) return true;
  }

  return false;
}

/**
 * Protect placeholders like {{count}} {{email}} to avoid DeepL modifying them.
 * We also protect sequences like ${var} if they exist.
 */
function protectPlaceholders(text) {
  const src = String(text);
  const tokens = [];
  let out = src;

  const patterns = [
    /\{\{\s*[^}]+\s*\}\}/g, // {{...}}
    /\$\{\s*[^}]+\s*\}/g,   // ${...}
  ];

  for (const re of patterns) {
    out = out.replace(re, (m) => {
      const id = tokens.length;
      tokens.push(m);
      return `___I18N_PH_${id}___`;
    });
  }

  return { text: out, tokens };
}

function restorePlaceholders(text, tokens) {
  let out = String(text);
  for (let i = 0; i < tokens.length; i++) {
    out = out.replaceAll(`___I18N_PH_${i}___`, tokens[i]);
  }
  return out;
}

/**
 * DeepL translate batch with retry on 429 + exponential backoff
 */
async function deeplTranslateBatch(texts, sourceLang = "ES", targetLang = "FR") {
  if (!texts.length) return [];

  // Protect placeholders per item
  const protectedItems = texts.map((t) => protectPlaceholders(normalizeNewlines(t)));

  // DeepL accepts multiple "text" fields
  const body = new URLSearchParams();
  body.set("source_lang", sourceLang);
  body.set("target_lang", targetLang);
  for (const item of protectedItems) body.append("text", item.text);

  let attempt = 0;
  while (true) {
    attempt++;
    try {
      const res = await fetch(DEEPL_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `DeepL-Auth-Key ${DEEPL_API_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      if (res.status === 429) {
        if (attempt > I18N_RETRY_MAX) {
          const msg = await safeText(res);
          throw new Error(`DeepL 429 too many requests (max retries reached). Body: ${msg}`);
        }
        const wait = I18N_RETRY_BASE_MS * Math.pow(2, attempt - 1);
        console.warn(`⚠️  DeepL 429 rate-limited. Retry ${attempt}/${I18N_RETRY_MAX} in ${wait}ms...`);
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        const msg = await safeText(res);
        throw new Error(`DeepL error HTTP ${res.status}: ${msg}`);
      }

      const json = await res.json();
      const translations = json?.translations || [];
      if (translations.length !== protectedItems.length) {
        throw new Error(`DeepL returned ${translations.length} translations, expected ${protectedItems.length}.`);
      }

      // Restore placeholders
      const out = translations.map((tr, i) => {
        const raw = tr?.text ?? "";
        return restorePlaceholders(raw, protectedItems[i].tokens);
      });
      return out;
    } catch (err) {
      // network / unexpected: retry a bit (also with backoff)
      if (attempt > I18N_RETRY_MAX) throw err;
      const wait = I18N_RETRY_BASE_MS * Math.pow(2, attempt - 1);
      console.warn(`⚠️  DeepL request failed (${String(err?.message || err)}). Retry ${attempt}/${I18N_RETRY_MAX} in ${wait}ms...`);
      await sleep(wait);
    }
  }
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/**
 * Load force keys file.
 * Accepts:
 * - ["a.b.c", "x.y"]
 * - {"keys": ["a.b.c"]}
 */
function loadForceKeys(forceFile) {
  if (!forceFile) return [];
  if (!fs.existsSync(forceFile)) {
    console.warn(`⚠️  FORCE_KEYS_FILE not found: ${forceFile}`);
    return [];
  }
  const raw = readJson(forceFile);
  if (Array.isArray(raw)) return raw.map(String);
  if (raw && Array.isArray(raw.keys)) return raw.keys.map(String);
  console.warn(`⚠️  FORCE_KEYS_FILE format not recognized. Use array or {keys:[...]}.`);
  return [];
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function eqNormalized(a, b) {
  return normalizeNewlines(String(a ?? "")).trim() === normalizeNewlines(String(b ?? "")).trim();
}

async function main() {
  console.log("🧩 i18n FR full translate");
  console.log(`   ES: ${ES_PATH}`);
  console.log(`   FR: ${FR_PATH}`);
  console.log(`   FORCE_KEYS_FILE: ${FORCE_KEYS_FILE || "(none)"}`);
  console.log(`   BATCH: ${I18N_BATCH_SIZE} | RETRY_MAX: ${I18N_RETRY_MAX} | RETRY_BASE_MS: ${I18N_RETRY_BASE_MS}`);
  console.log(`   REMOVE_EXTRA: ${REMOVE_EXTRA ? "1" : "0"} | DRY_RUN: ${DRY_RUN ? "1" : "0"}`);

  if (!fs.existsSync(ES_PATH)) {
    console.error(`❌ ES file not found: ${ES_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(FR_PATH)) {
    console.error(`❌ FR file not found: ${FR_PATH}`);
    process.exit(1);
  }

  const es = readJson(ES_PATH);
  const fr = readJson(FR_PATH);

  // Optionally prune fr structure to match es
  let frOut = deepClone(fr);
  if (REMOVE_EXTRA) {
    frOut = pruneToBase(frOut, es);
  }

  // Flatten strings for base and current target
  const esFlat = new Map(flattenStrings(es).map(({ keyPath, value }) => [keyPath, value]));
  const frFlat = new Map(flattenStrings(frOut).map(({ keyPath, value }) => [keyPath, value]));

  // Determine candidates
  const pending = [];
  for (const [keyPath, esText] of esFlat.entries()) {
    if (typeof esText !== "string") continue;

    const frText = frFlat.get(keyPath);

    const missing = frText == null || String(frText).trim() === "";
    const same_as_base = frText != null && eqNormalized(frText, esText);
    const looks_english = frText != null && looksEnglish(frText);

    if (missing || same_as_base || looks_english) {
      pending.push({ keyPath, esText, reason: missing ? "missing" : same_as_base ? "same_as_base" : "looks_english" });
    }
  }

  // Force keys always override FR from ES
  const forceKeyPaths = loadForceKeys(FORCE_KEYS_FILE);
  const forcePending = [];
  const forceSet = new Set();

  for (const kp of forceKeyPaths) {
    const esText = esFlat.get(kp);
    if (typeof esText !== "string" || !String(esText).trim()) {
      console.warn(`⚠️  Force key not found in ES or not a string: ${kp}`);
      continue;
    }
    forceSet.add(kp);
    forcePending.push({ keyPath: kp, esText, reason: "force" });
  }

  // Remove duplicates: if force includes a key, we translate it only once (as force)
  const finalPending = [
    ...pending.filter((p) => !forceSet.has(p.keyPath)),
    ...forcePending,
  ];

  console.log(`📌 Pending translations: ${finalPending.length} (normal=${pending.length}, force=${forcePending.length})`);

  if (!finalPending.length) {
    console.log("✅ Nothing to translate.");
    if (!DRY_RUN && REMOVE_EXTRA) {
      console.log("💾 Writing pruned FR (REMOVE_EXTRA=1)...");
      writeJson(FR_PATH, frOut);
    }
    return;
  }

  // Translate in batches (from ES text)
  let translatedCount = 0;

  const batches = chunk(finalPending, I18N_BATCH_SIZE);
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const texts = batch.map((x) => x.esText);

    console.log(`🔤 Batch ${bi + 1}/${batches.length} (${batch.length} items)...`);
    const frTexts = await deeplTranslateBatch(texts, "ES", "FR");

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const tr = frTexts[i];

      // Basic cleanup: keep original newlines as returned; do not over-trim punctuation
      const outText = String(tr ?? "").replace(/\r\n/g, "\n");

      // Apply to frOut at keyPath
      setByPath(frOut, item.keyPath, outText);
      translatedCount++;
    }
  }

  console.log(`✅ Translated/applied: ${translatedCount}`);

  if (DRY_RUN) {
    console.log("🧪 DRY_RUN=1 → Not writing fr.json");
    return;
  }

  console.log(`💾 Writing: ${FR_PATH}`);
  writeJson(FR_PATH, frOut);
  console.log("🎉 Done.");
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
