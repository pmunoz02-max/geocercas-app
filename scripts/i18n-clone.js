// DEPRECATED: Use i18n-translate.js for translation and placeholder preservation.
// scripts/i18n-clone.js
// Usage: node scripts/i18n-clone.js
// This script reads src/i18n/es.json and generates en.json and fr.json with fake translated values, preserving placeholders like {{name}}.
//
// This script guarantees that en.json and fr.json always have the exact same structure and keys as es.json, using es.json as the source of truth.
// No API calls are made; this is a structure sync utility for i18n workflows.

import fs from 'fs';
import path from 'path';
import https from 'https';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) process.env[k] = envConfig[k];
}

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const DEEPL_API_URL = process.env.DEEPL_API_URL;
if (!DEEPL_API_KEY || !DEEPL_API_URL) {
  console.error('DEEPL_API_KEY or DEEPL_API_URL not set in .env.local');
  process.exit(1);
}

const srcDir = path.join(__dirname, '../src/i18n');
const sourceFile = path.join(srcDir, 'es.json');
const targets = [
  { file: 'en.json', lang: 'en' },
  { file: 'fr.json', lang: 'fr' }
];

// Simple regex to match {{placeholders}}
const PLACEHOLDER_REGEX = /{{\s*\w+\s*}}/g;

// Mask and restore placeholders for batch translation
const PLACEHOLDER_PATTERNS = [
  /{{\s*\w+\s*}}/g, // {{name}}
  /{\w+}/g,          // {name}
  /%s/g,              // %s
  /:\w+/g             // :count
];

function maskPlaceholders(text) {
  const tokens = [];
  let i = 0;
  const masked = text.replace(PLACEHOLDER_REGEX, (match) => {
    const token = `__PH_${i}__`;
    tokens.push({ token, value: match });
    i++;
    return token;
  });
  return { masked, tokens };
}

function unmaskPlaceholders(text, tokens) {
  let result = text;
  for (const { token, value } of tokens) {
    result = result.replace(token, value);
  }
  return result;
}

function maskAllPlaceholders(text) {
  let tokens = [];
  let masked = text;
  let i = 0;
  PLACEHOLDER_PATTERNS.forEach((pattern) => {
    masked = masked.replace(pattern, (match) => {
      const token = `__PH_${i}__`;
      tokens.push({ token, value: match });
      i++;
      return token;
    });
  });
  return { masked, tokens };
}

function unmaskAllPlaceholders(text, tokens) {
  let result = text;
  for (const { token, value } of tokens) {
    result = result.replace(token, value);
  }
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function translateText(text, from, to, retries = 3, timeoutMs = 10000) {
  if (!text.trim()) return text;
  const { masked, tokens } = maskPlaceholders(text);
  const payload = JSON.stringify({
    text: [masked],
    source_lang: from.toUpperCase(),
    target_lang: to.toUpperCase(),
    preserve_formatting: true
  });
  const url = new URL(DEEPL_API_URL);
  const options = {
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    timeout: timeoutMs,
    headers: {
      'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
      'Content-Type': 'application/json',
    },
  };
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let bodyData = '';
          res.on('data', (chunk) => { bodyData += chunk; });
          res.on('end', () => {
            // Log status code and first 500 chars of response
            console.warn(`DeepL status: ${res.statusCode}, body: ${bodyData.slice(0, 500)}`);
            let result;
            try {
              result = JSON.parse(bodyData);
            } catch (e) {
              console.warn('Invalid DeepL response, not retrying.');
              return resolve(text); // fallback
            }
            const translated = result?.translations?.[0]?.text;
            if (!translated) {
              console.warn('Missing translation, fallback to original');
              return resolve(text);
            } else {
              resolve(unmaskPlaceholders(translated, tokens));
            }
          });
        });
        req.on('error', (err) => {
          console.warn('DeepL request error:', err.message);
          resolve(text);
        });
        req.on('timeout', () => {
          req.destroy();
          console.warn('DeepL request timeout, fallback to original');
          resolve(text);
        });
        req.write(payload);
        req.end();
      });
    } catch (err) {
      if (attempt === retries) {
        console.warn('Translation failed after 3 retries, fallback to original');
        return text;
      }
      console.warn(`Retrying translation (${attempt}/${retries}) for:`, text);
      await sleep(1000 * attempt);
    }
  }
  // Should never reach here, but fallback just in case
  return text;
}

async function translateObject(obj, from, to) {
  if (Array.isArray(obj)) {
    return Promise.all(obj.map((item) => translateObject(item, from, to)));
  } else if (obj && typeof obj === 'object') {
    const result = {};
    for (const key in obj) {
      try {
        result[key] = await translateObject(obj[key], from, to);
      } catch (e) {
        console.warn(`Translation error for key '${key}', fallback to original.`);
        result[key] = obj[key];
      }
    }
    return result;
  } else if (typeof obj === 'string') {
    try {
      return await translateText(obj, from, to);
    } catch (e) {
      console.warn('Translation error for string, fallback to original.');
      return obj;
    }
  } else {
    return obj;
  }
}

function filterKeys(template, target) {
  if (Array.isArray(template) && Array.isArray(target)) {
    return target.slice(0, template.length);
  } else if (template && typeof template === 'object' && target && typeof target === 'object') {
    const filtered = {};
    for (const key in template) {
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        filtered[key] = filterKeys(template[key], target[key]);
      } else {
        filtered[key] = Array.isArray(template[key]) ? [] : (typeof template[key] === 'object' ? {} : '');
      }
    }
    return filtered;
  } else {
    return target;
  }
}

// QUICK FALLBACK: Generate en.json and fr.json by copying es.json and replacing values with basic equivalents (no API calls)
function fakeEnglish(text) {
  if (typeof text === 'string') return '[EN] ' + text;
  return text;
}
function fakeFrench(text) {
  if (typeof text === 'string') return '[FR] ' + text;
  return text;
}
function cloneWithFake(obj, fakeFn) {
  if (Array.isArray(obj)) {
    return obj.map((item) => cloneWithFake(item, fakeFn));
  } else if (obj && typeof obj === 'object') {
    const result = {};
    for (const key in obj) {
      result[key] = cloneWithFake(obj[key], fakeFn);
    }
    return result;
  } else if (typeof obj === 'string') {
    return fakeFn(obj);
  } else {
    return obj;
  }
}

// Utility to flatten and unflatten JSON for batch translation
function flattenObject(obj, prefix = '', result = {}) {
  if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
    for (const key in obj) {
      flattenObject(obj[key], prefix ? prefix + '.' + key : key, result);
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      flattenObject(item, `${prefix}[${idx}]`, result);
    });
  } else {
    result[prefix] = obj;
  }
  return result;
}

function unflattenObject(flat) {
  const result = {};
  for (const flatKey in flat) {
    const keys = flatKey.split(/\.(?![^\[]*\])/g);
    let cur = result;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const arrMatch = key.match(/(\w+)\[(\d+)\]/);
      if (arrMatch) {
        const arrKey = arrMatch[1];
        const idx = parseInt(arrMatch[2], 10);
        if (!cur[arrKey]) cur[arrKey] = [];
        if (i === keys.length - 1) {
          cur[arrKey][idx] = flat[flatKey];
        } else {
          if (!cur[arrKey][idx]) cur[arrKey][idx] = {};
          cur = cur[arrKey][idx];
        }
      } else {
        if (i === keys.length - 1) {
          cur[key] = flat[flatKey];
        } else {
          if (!cur[key]) cur[key] = {};
          cur = cur[key];
        }
      }
    }
  }
  return result;
}

function chunkBatch(arr, maxBytes = 128 * 1024) {
  const batches = [];
  let current = [];
  let currentBytes = 2; // for [ and ]
  for (const str of arr) {
    const strBytes = Buffer.byteLength(JSON.stringify(str), 'utf8') + (current.length ? 1 : 0); // comma
    if (current.length && currentBytes + strBytes > maxBytes) {
      batches.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(str);
    currentBytes += strBytes;
  }
  if (current.length) batches.push(current);
  return batches;
}


// --- CACHE HELPERS RESTORED ---
const cachePath = path.join(__dirname, '.i18n-cache.json');
let translationCache = {};
// Load cache if exists
if (fs.existsSync(cachePath)) {
  try {
    translationCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch (e) {
    console.warn('[i18n-sync] Failed to load translation cache, starting fresh.');
    translationCache = {};
  }
}

function normalizeText(text) {
  return typeof text === 'string' ? text.trim() : text;
}

function getCacheKey(lang, text) {
  return lang + '|' + normalizeText(text);
}

function getCachedTranslations(lang, texts) {
  const cached = {};
  const toTranslate = [];
  const toTranslateIdx = [];
  texts.forEach((t, i) => {
    const key = getCacheKey(lang, t);
    if (translationCache[key]) {
      cached[i] = translationCache[key];
    } else {
      toTranslate.push(t);
      toTranslateIdx.push(i);
    }
  });
  return { cached, toTranslate, toTranslateIdx };
}

function updateCache(lang, srcArr, translatedArr) {
  srcArr.forEach((src, i) => {
    const key = getCacheKey(lang, src);
    const originalMasked = typeof src === 'string' ? maskAllPlaceholders(src).masked : src;
    const translated = translatedArr[i];
    // Only cache if translated is non-empty, string, and different from original masked source
    if (
      typeof translated === 'string' &&
      translated.trim() !== '' &&
      translated !== originalMasked
    ) {
      translationCache[key] = translated;
    }
  });
}

function saveCache() {
  fs.writeFileSync(cachePath, JSON.stringify(translationCache, null, 2), 'utf8');
}

// --- BATCH TRANSLATE WITH CACHE ---
async function batchTranslateDeepLWithCache(texts, from, to) {
  // Deduplicate source strings
  const { cached, toTranslate, toTranslateIdx } = getCachedTranslations(to, texts);
  // Map: unique string -> all indices in toTranslate where it appears
  const uniqueMap = new Map();
  toTranslate.forEach((str, i) => {
    const norm = normalizeText(str);
    if (!uniqueMap.has(norm)) uniqueMap.set(norm, []);
    uniqueMap.get(norm).push(i);
  });
  const uniqueArr = Array.from(uniqueMap.keys());
  let uniqueTranslated = [];
  let batchStats = { batches: 0 };
  if (uniqueArr.length > 0) {
    uniqueTranslated = await batchTranslateDeepL(uniqueArr, from, to, batchStats);
    // Map back to all positions in toTranslate
    const expandedTranslated = new Array(toTranslate.length);
    uniqueArr.forEach((uniq, i) => {
      uniqueMap.get(uniq).forEach(idx => {
        expandedTranslated[idx] = uniqueTranslated[i];
      });
    });
    // Save new translations to cache (for all toTranslate)
    updateCache(to, toTranslate, expandedTranslated);
    saveCache();
  }
  // Rebuild result array in original order
  const result = texts.map((_, i) => {
    if (cached[i] !== undefined) return cached[i];
    // Find index in toTranslateIdx
    const idx = toTranslateIdx.indexOf(i);
    return idx !== -1 ? translationCache[getCacheKey(to, toTranslate[idx])] : texts[i];
  });
  // Stats for logging
  return {
    result,
    stats: {
      total: texts.length,
      unique: uniqueArr.length,
      cacheHits: Object.keys(cached).length,
      deepLRequested: uniqueArr.length,
      batches: batchStats.batches || 0
    }
  };
}

async function batchTranslateDeepL(strings, from, to, batchStats) {
  // Mask placeholders for all strings
  const maskedArr = strings.map(s => {
    if (typeof s !== 'string') return { masked: s, tokens: [] };
    return maskAllPlaceholders(s);
  });
  const maskedStrings = maskedArr.map(m => typeof m.masked === 'string' ? m.masked : m.masked);

  const batches = chunkBatch(maskedStrings, 128 * 1024);
  const results = new Array(strings.length);
  const maxConcurrency = 3;
  let inFlight = 0;
  let idx = 0;
  let batchPromises = [];
  if (batchStats) batchStats.batches = batches.length;

  // Track retry and error stats
  let retryStats = { total429: 0, total5xx: 0, totalBatches: 0, totalRetries: 0 };
  function translateBatch(batch, batchIdx, offset) {
    return new Promise(async (resolve) => {
      let attempt = 0;
      let success = false;
      let lastStatus = null;
      while (!success && attempt < 5) {
        attempt++;
        const payload = JSON.stringify({
          text: batch,
          source_lang: from.toUpperCase(),
          target_lang: to.toUpperCase(),
          preserve_formatting: true
        });
        const url = new URL(DEEPL_API_URL);
        const options = {
          hostname: url.hostname,
          path: url.pathname,
          method: 'POST',
          timeout: 10000,
          headers: {
            'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
            'Content-Type': 'application/json',
          },
        };
        try {
          const translatedBatch = await new Promise((resolveBatch) => {
            const req = https.request(options, (res) => {
              let bodyData = '';
              res.on('data', (chunk) => { bodyData += chunk; });
              res.on('end', async () => {
                lastStatus = res.statusCode;
                if (res.statusCode === 429) {
                  retryStats.total429++;
                  retryStats.totalRetries++;
                  console.warn(`[i18n-sync] DeepL HTTP 429 (attempt ${attempt}), will backoff and retry`);
                  return resolveBatch(null); // trigger retry
                }
                if (res.statusCode >= 500 && res.statusCode < 600) {
                  retryStats.total5xx++;
                  retryStats.totalRetries++;
                  console.warn(`[i18n-sync] DeepL HTTP ${res.statusCode} (attempt ${attempt}), will backoff and retry`);
                  return resolveBatch(null); // trigger retry
                }
                let result;
                try {
                  result = JSON.parse(bodyData);
                } catch (e) {
                  console.warn('[i18n-sync] Invalid DeepL response, not retrying.');
                  return resolveBatch(null); // treat as failed, do not cache
                }
                if (!result.translations || !Array.isArray(result.translations)) {
                  console.warn('[i18n-sync] Missing translations, treat as failed');
                  return resolveBatch(null); // treat as failed, do not cache
                }
                resolveBatch(result.translations.map(t => t.text));
              });
            });
            req.on('error', (err) => {
              console.warn('[i18n-sync] DeepL request error:', err.message);
              resolveBatch(null); // treat as failed, do not cache
            });
            req.on('timeout', () => {
              req.destroy();
              console.warn('[i18n-sync] DeepL request timeout, treat as failed');
              resolveBatch(null); // treat as failed, do not cache
            });
            req.write(payload);
            req.end();
          });
          if (translatedBatch === null) {
            // Exponential backoff for 429/5xx
            const backoff = Math.min(32000, 1000 * Math.pow(2, attempt));
            console.warn(`[i18n-sync] Backing off for ${backoff}ms before retrying batch...`);
            await sleep(backoff);
            continue;
          }
          // Place results in correct order, restoring placeholders
          for (let i = 0; i < batch.length; i++) {
            const origIdx = offset + i;
            const tokens = maskedArr[origIdx].tokens;
            results[origIdx] = unmaskAllPlaceholders(translatedBatch[i], tokens);
          }
          success = true;
        } catch (e) {
          if (attempt === 5) {
            console.warn('[i18n-sync] Batch translation failed after 5 retries, fallback to originals');
            for (let i = 0; i < batch.length; i++) {
              const origIdx = offset + i;
              const tokens = maskedArr[origIdx].tokens;
              results[origIdx] = unmaskAllPlaceholders(batch[i], tokens);
            }
          } else {
            await sleep(1000 * attempt);
          }
        }
      }
      retryStats.totalBatches++;
      resolve();
    });
  }

  async function runBatches() {
    let offset = 0;
    let batchIdx = 0;
    while (batchIdx < batches.length) {
      while (inFlight < maxConcurrency && batchIdx < batches.length) {
        const batch = batches[batchIdx];
        const thisOffset = offset;
        inFlight++;
        const p = translateBatch(batch, batchIdx, thisOffset).then(() => { inFlight--; });
        batchPromises.push(p);
        offset += batch.length;
        batchIdx++;
      }
      // Wait for at least one batch to finish before launching more
      if (inFlight >= maxConcurrency) {
        await Promise.race(batchPromises);
        // Remove resolved promises
        batchPromises = batchPromises.filter(p => p && p.isPending !== false);
      }
    }
    // Wait for all remaining batches
    await Promise.all(batchPromises);
  }

  await runBatches();
  // Log DeepL retry/failure summary
  if (retryStats.total429 > 0 || retryStats.total5xx > 0) {
    console.warn(`[i18n-sync] DeepL summary: ${retryStats.totalBatches} batches, ${retryStats.total429} HTTP 429, ${retryStats.total5xx} HTTP 5xx, ${retryStats.totalRetries} retries`);
  }
  return results;
}

const main = async () => {
  if (!fs.existsSync(sourceFile)) {
    console.error('[i18n-sync] Source file not found:', sourceFile);
    process.exit(1);
  }
  const esData = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));

  // Fallback: generate en.json and fr.json with fake translations in case DeepL fails
  let enObj, frObj;
  let enStats = null, frStats = null;
  let enFallback = 0, frFallback = 0;
  try {
    // Flatten all string leaves
    const flat = flattenObject(esData);
    const keys = Object.keys(flat);
    const values = Object.values(flat);

    // Translate in batches with cache
    const enResult = await batchTranslateDeepLWithCache(values, 'es', 'en');
    const frResult = await batchTranslateDeepLWithCache(values, 'es', 'fr');
    const enTranslated = enResult.result;
    const frTranslated = frResult.result;
    enStats = enResult.stats;
    frStats = frResult.stats;

    // Count fallback (where translation equals source)
    enFallback = enTranslated.filter((t, i) => t === values[i]).length;
    frFallback = frTranslated.filter((t, i) => t === values[i]).length;

    // Build flat maps for translated values by path
    const enFlatMap = {};
    const frFlatMap = {};
    keys.forEach((k, i) => {
      enFlatMap[k] = enTranslated[i];
      frFlatMap[k] = frTranslated[i];
    });

    // Recursively clone es.json, replacing only string values using flat translated map by path
    function rebuildFromTemplate(template, flatMap, path = '') {
      if (typeof template === 'string') {
        return flatMap[path] ?? template;
      }
      if (Array.isArray(template)) {
        return template.map((item, i) =>
          rebuildFromTemplate(item, flatMap, `${path}[${i}]`)
        );
      }
      if (template && typeof template === 'object') {
        const result = {};
        for (const key in template) {
          const newPath = path ? `${path}.${key}` : key;
          result[key] = rebuildFromTemplate(template[key], flatMap, newPath);
        }
        return result;
      }
      return template;
    }
    enObj = rebuildFromTemplate(esData, enFlatMap);
    frObj = rebuildFromTemplate(esData, frFlatMap);
  } catch (e) {
    console.error('[i18n-sync] DeepL translation failed, using fallback fake translations. Error:', e);
    enObj = cloneWithFake(esData, fakeEnglish);
    frObj = cloneWithFake(esData, fakeFrench);
    enFallback = frFallback = Object.keys(flattenObject(esData)).length;
  }

  const enPath = path.join(srcDir, 'en.json');
  const frPath = path.join(srcDir, 'fr.json');
  fs.writeFileSync(enPath, JSON.stringify(enObj, null, 2), 'utf8');
  fs.writeFileSync(frPath, JSON.stringify(frObj, null, 2), 'utf8');
  console.log('[i18n-sync] Generated', enPath, '(DeepL batch or fallback, structure parity with es.json)');
  console.log('[i18n-sync] Generated', frPath, '(DeepL batch or fallback, structure parity with es.json)');

  // Final stats logs
  if (enStats) {
    console.log(`[i18n-sync][en] Total: ${enStats.total}, Unique: ${enStats.unique}, Cache hits: ${enStats.cacheHits}, DeepL requested: ${enStats.deepLRequested}, Batches: ${enStats.batches}, Fallback: ${enFallback}`);
  }
  if (frStats) {
    console.log(`[i18n-sync][fr] Total: ${frStats.total}, Unique: ${frStats.unique}, Cache hits: ${frStats.cacheHits}, DeepL requested: ${frStats.deepLRequested}, Batches: ${frStats.batches}, Fallback: ${frFallback}`);
  }
}

main().catch((e) => {
  console.error('Translation failed:', e);
  process.exit(1);
});
