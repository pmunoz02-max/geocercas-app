#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * i18n-full-fr-translate.mjs
 * - Base configurable: BASE_LOCALE=en|es (default en)
 * - Target: FR (src/i18n/fr.json)
 * - Traduce por DeepL: missing + looks_english + same_as_base + force-keys
 * - FORCE_KEYS_FILE: lista de key-paths a traducir siempre y sobrescribir en FR
 * - REMOVE_EXTRA=1: elimina keys en FR que no estén en la base
 *
 * Env:
 *   DEEPL_API_KEY (required)
 *   DEEPL_API_URL (default https://api-free.deepl.com/v2/translate)
 *   LOCALES_DIR (default src/i18n)
 *   BASE_LOCALE (default en)  // en o es
 *   BASE_PATH (optional override)
 *   FR_PATH (optional override)
 *   I18N_BATCH_SIZE (default 10)
 *   I18N_RETRY_MAX (default 6)
 *   I18N_RETRY_BASE_MS (default 600)
 *   REMOVE_EXTRA=1 (optional prune keys not in BASE)
 *   DRY_RUN=1 (optional no writes)
 *   FORCE_KEYS_FILE (default scripts/i18n-fr-force-keys.json)
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

//
// --- dotenv-like loader (no deps) ---
//
const ROOT = process.cwd();
const envLocal = path.join(ROOT, ".env.local");
const env = path.join(ROOT, ".env");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);

    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(envLocal);
loadEnvFile(env);

//
// --- config ---
//
const ENV = process.env;

const LOCALES_DIR = ENV.LOCALES_DIR || "src/i18n";
const BASE_LOCALE = String(ENV.BASE_LOCALE || "en").toLowerCase(); // en|es

const defaultBasePath =
  BASE_LOCALE === "es"
    ? path.join(LOCALES_DIR, "es.json")
    : path.join(LOCALES_DIR, "en.json");

const BASE_PATH = ENV.BASE_PATH || defaultBasePath;
const FR_PATH = ENV.FR_PATH || path.join(LOCALES_DIR, "fr.json");

const DEEPL_API_KEY = ENV.DEEPL_API_KEY;
const DEEPL_API_URL = ENV.DEEPL_API_URL || "https://api-free.deepl.com/v2/translate";

const I18N_BATCH_SIZE = toInt(ENV.I18N_BATCH_SIZE, 10);
const I18N_RETRY_MAX = toInt(ENV.I18N_RETRY_MAX, 6);
const I18N_RETRY_BASE_MS = toInt(ENV.I18N_RETRY_BASE_MS, 600);

const REMOVE_EXTRA = ENV.REMOVE_EXTRA === "1";
const DRY_RUN = ENV.DRY_RUN === "1";

const FORCE_KEYS_FILE =
  (ENV.FORCE_KEYS_FILE && ENV.FORCE_KEYS_FILE.trim()) ||
  path.join("scripts", "i18n-fr-force-keys.json");

if (!DEEPL_API_KEY) {
  console.error("❌ Missing DEEPL_API_KEY (define it in .env.local).");
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
      if (cur[idx] == null) cur[idx] = nextIsIndex ? [] : {};
      else {
        if (nextIsIndex && !Array.isArray(cur[idx])) cur[idx] = [];
        if (!nextIsIndex && !isObject(cur[idx])) cur[idx] = {};
      }
      cur = cur[idx];
    } else {
      if (cur[part] == null) cur[part] = nextIsIndex ? [] : {};
      else {
        if (nextIsIndex && !Array.isArray(cur[part])) cur[part] = [];
        if (!nextIsIndex && !isObject(cur[part])) cur[part] = {};
      }
      cur = cur[part];
    }
  }
}

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

function pruneToBase(target, base) {
  if (typeof base === "string") return target;
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
    for (const k of Object.keys(base)) obj[k] = pruneToBase(target?.[k], base[k]);
    return obj;
  }
  return deepClone(base);
}

function looksEnglish(s) {
  const t = String(s || "").trim();
  if (!t) return false;

  // si tiene “caracteres franceses” es poco probable que sea inglés puro
  if (/[àâçéèêëîïôùûüÿœæ]/i.test(t)) return false;

  // pistas típicas inglés UI
  if (
    /\b(sign in|log in|logout|dashboard|help|support|terms|privacy|reset password|loading|send|saving|back|view)\b/i.test(
      t
    )
  ) return true;

  const hits =
    (t.match(/\b(the|and|or|to|from|with|without|your|you|are|is|in|on|of|for|please|select|create|invite|profile|status|error)\b/gi) || [])
      .length;

  return hits >= 2;
}

// Protección fuerte de placeholders/tokens/emails/urls
function protectPlaceholders(text) {
  const src = String(text);
  const tokens = [];
  let out = src;

  const patterns = [
    /\{\{\s*[^}]+\s*\}\}/g,                           // {{...}}
    /\$\{\s*[^}]+\s*\}/g,                             // ${...}
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,     // emails
    /\bhttps?:\/\/[^\s)]+/gi,                         // urls
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

async function safeText(res) {
  try { return await res.text(); } catch { return ""; }
}

async function deeplTranslateBatch(texts, sourceLang, targetLang) {
  if (!texts.length) return [];

  const protectedItems = texts.map((t) => protectPlaceholders(normalizeNewlines(t)));

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
          Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      if (res.status === 429) {
        if (attempt > I18N_RETRY_MAX) {
          const msg = await safeText(res);
          throw new Error(`DeepL 429 too many requests (max retries). Body: ${msg}`);
        }
        const wait = I18N_RETRY_BASE_MS * Math.pow(2, attempt - 1);
        console.warn(`⚠️ DeepL 429. Retry ${attempt}/${I18N_RETRY_MAX} in ${wait}ms...`);
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
        throw new Error(`DeepL returned ${translations.length}, expected ${protectedItems.length}.`);
      }

      return translations.map((tr, i) => {
        const raw = tr?.text ?? "";
        return restorePlaceholders(raw, protectedItems[i].tokens);
      });
    } catch (err) {
      if (attempt > I18N_RETRY_MAX) throw err;
      const wait = I18N_RETRY_BASE_MS * Math.pow(2, attempt - 1);
      console.warn(`⚠️ DeepL failed (${String(err?.message || err)}). Retry ${attempt}/${I18N_RETRY_MAX} in ${wait}ms...`);
      await sleep(wait);
    }
  }
}

function loadForceKeys(forceFile) {
  if (!forceFile) return [];
  if (!fs.existsSync(forceFile)) {
    console.warn(`⚠️ FORCE_KEYS_FILE not found: ${forceFile}`);
    return [];
  }
  const raw = readJson(forceFile);
  if (Array.isArray(raw)) return raw.map(String);
  if (raw && Array.isArray(raw.keys)) return raw.keys.map(String);
  console.warn(`⚠️ FORCE_KEYS_FILE format not recognized. Use array or {keys:[...]}.`);
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

function applyPostFixFr(frOut) {
  // Placeholder específico: “tu correo @ ejemplo” → FR
  const p1 = getByPath(frOut, "login.emailPlaceholder");
  if (typeof p1 === "string") {
    setByPath(
      frOut,
      "login.emailPlaceholder",
      p1
        .replace(/tucorreo@ejemplo\.com/gi, "votrecourriel@exemple.com")
        .replace(/tucorreo@/gi, "votrecourriel@")
        .replace(/@ejemplo\.com/gi, "@exemple.com")
    );
  }

  const p2 = getByPath(frOut, "inviteTracker.form.emailPlaceholder");
  if (typeof p2 === "string") {
    setByPath(frOut, "inviteTracker.form.emailPlaceholder", p2.replace(/@ejemplo\.com/gi, "@exemple.com"));
  }

  // Barrido global seguro (solo cambia el dominio)
  const flat = flattenStrings(frOut);
  for (const { keyPath, value } of flat) {
    if (typeof value !== "string") continue;
    if (/@ejemplo\.com/i.test(value)) {
      setByPath(frOut, keyPath, value.replace(/@ejemplo\.com/gi, "@exemple.com"));
    }
  }
}

function sourceLangForBase(baseLocale) {
  if (baseLocale === "es") return "ES";
  return "EN";
}

async function main() {
  console.log("🧩 i18n FR full translate");
  console.log(`   BASE_LOCALE: ${BASE_LOCALE.toUpperCase()}`);
  console.log(`   BASE: ${BASE_PATH}`);
  console.log(`   FR:   ${FR_PATH}`);
  console.log(`   FORCE_KEYS_FILE: ${FORCE_KEYS_FILE}`);
  console.log(`   BATCH: ${I18N_BATCH_SIZE} | RETRY_MAX: ${I18N_RETRY_MAX} | RETRY_BASE_MS: ${I18N_RETRY_BASE_MS}`);
  console.log(`   REMOVE_EXTRA: ${REMOVE_EXTRA ? "1" : "0"} | DRY_RUN: ${DRY_RUN ? "1" : "0"}`);

  if (!fs.existsSync(BASE_PATH)) {
    console.error(`❌ BASE file not found: ${BASE_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(FR_PATH)) {
    console.error(`❌ FR file not found: ${FR_PATH}`);
    process.exit(1);
  }

  const base = readJson(BASE_PATH);
  const fr = readJson(FR_PATH);

  let frOut = deepClone(fr);
  if (REMOVE_EXTRA) frOut = pruneToBase(frOut, base);

  const baseFlat = new Map(flattenStrings(base).map(({ keyPath, value }) => [keyPath, value]));
  const frFlat = new Map(flattenStrings(frOut).map(({ keyPath, value }) => [keyPath, value]));

  // Detect pending
  const pending = [];
  for (const [keyPath, baseText] of baseFlat.entries()) {
    if (typeof baseText !== "string") continue;

    const frText = frFlat.get(keyPath);

    const missing = frText == null || String(frText).trim() === "";
    const same_as_base = frText != null && eqNormalized(frText, baseText);
    const looks_english = frText != null && looksEnglish(frText);

    if (missing || same_as_base || looks_english) {
      pending.push({ keyPath, baseText, reason: missing ? "missing" : same_as_base ? "same_as_base" : "looks_english" });
    }
  }

  // Force keys
  const forceKeyPaths = loadForceKeys(FORCE_KEYS_FILE);
  const forcePending = [];
  const forceSet = new Set();

  for (const kp of forceKeyPaths) {
    const baseText = baseFlat.get(kp);
    if (typeof baseText !== "string" || !String(baseText).trim()) {
      console.warn(`⚠️ Force key not found in BASE or not a string: ${kp}`);
      continue;
    }
    forceSet.add(kp);
    forcePending.push({ keyPath: kp, baseText, reason: "force" });
  }

  const finalPending = [...pending.filter((p) => !forceSet.has(p.keyPath)), ...forcePending];

  console.log(`📌 Pending translations: ${finalPending.length} (normal=${pending.length}, force=${forcePending.length})`);

  // even if nothing pending, still apply post-fix and maybe prune
  if (!finalPending.length) {
    applyPostFixFr(frOut);

    if (DRY_RUN) {
      console.log("🧪 DRY_RUN=1 → Not writing fr.json");
      return;
    }
    if (REMOVE_EXTRA) {
      console.log("💾 Writing pruned FR (REMOVE_EXTRA=1) + post-fix...");
      writeJson(FR_PATH, frOut);
    } else {
      console.log("✅ Nothing to translate.");
    }
    return;
  }

  const sourceLang = sourceLangForBase(BASE_LOCALE);
  let translatedCount = 0;

  const batches = chunk(finalPending, I18N_BATCH_SIZE);
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const texts = batch.map((x) => x.baseText);

    console.log(`🔤 Batch ${bi + 1}/${batches.length} (${batch.length} items)...`);
    const frTexts = await deeplTranslateBatch(texts, sourceLang, "FR");

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const tr = frTexts[i];
      setByPath(frOut, item.keyPath, String(tr ?? "").replace(/\r\n/g, "\n"));
      translatedCount++;
    }
  }

  applyPostFixFr(frOut);

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
