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

async function main() {
  if (!fs.existsSync(sourceFile)) {
    console.error('[i18n-sync] Source file not found:', sourceFile);
    process.exit(1);
  }
  const esData = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  // Fallback: generate en.json and fr.json with fake translations
  const enFake = cloneWithFake(esData, fakeEnglish);
  const frFake = cloneWithFake(esData, fakeFrench);
  const enPath = path.join(srcDir, 'en.json');
  const frPath = path.join(srcDir, 'fr.json');
  fs.writeFileSync(enPath, JSON.stringify(enFake, null, 2), 'utf8');
  fs.writeFileSync(frPath, JSON.stringify(frFake, null, 2), 'utf8');
  console.log('[i18n-sync] Generated', enPath, '(fake English, structure parity with es.json)');
  console.log('[i18n-sync] Generated', frPath, '(fake French, structure parity with es.json)');
  // DeepL translation is disabled in this fallback mode.
}

main().catch((e) => {
  console.error('Translation failed:', e);
  process.exit(1);
});
