// scripts/i18n-translate.js
// Usage: node scripts/i18n-translate.js
// This script reads src/i18n/es.json and generates en.json and fr.json with translated values, preserving placeholders like {{name}}.

const fs = require('fs');
const path = require('path');
const https = require('https');

const srcDir = path.join(__dirname, '../src/i18n');
const sourceFile = path.join(srcDir, 'es.json');
const targets = [
  { file: 'en.json', lang: 'en' },
  { file: 'fr.json', lang: 'fr' }
];

// Simple regex to match {{placeholders}}
const PLACEHOLDER_REGEX = /{{\s*\w+\s*}}/g;

// Replace placeholders with tokens, return {text, tokens}
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

// Restore tokens to original placeholders
function unmaskPlaceholders(text, tokens) {
  let result = text;
  for (const { token, value } of tokens) {
    result = result.replace(token, value);
  }
  return result;
}

// Translate a string using LibreTranslate API (no key required for demo)
function translateText(text, from, to) {
  return new Promise((resolve, reject) => {
    if (!text.trim()) return resolve(text);
    const { masked, tokens } = maskPlaceholders(text);
    const data = JSON.stringify({
      q: masked,
      source: from,
      target: to,
      format: 'text'
    });
    const options = {
      hostname: 'libretranslate.de',
      path: '/translate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve(unmaskPlaceholders(result.translatedText, tokens));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function translateObject(obj, from, to) {
  if (Array.isArray(obj)) {
    return Promise.all(obj.map((item) => translateObject(item, from, to)));
  } else if (obj && typeof obj === 'object') {
    const result = {};
    for (const key in obj) {
      result[key] = await translateObject(obj[key], from, to);
    }
    return result;
  } else if (typeof obj === 'string') {
    return await translateText(obj, from, to);
  } else {
    return obj;
  }
}

async function main() {
  if (!fs.existsSync(sourceFile)) {
    console.error('Source file not found:', sourceFile);
    process.exit(1);
  }
  const esData = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  for (const { file, lang } of targets) {
    console.log(`Translating to ${lang}...`);
    const translated = await translateObject(esData, 'es', lang);
    const targetPath = path.join(srcDir, file);
    fs.writeFileSync(targetPath, JSON.stringify(translated, null, 2), 'utf8');
    console.log('Generated', targetPath);
  }
}

main().catch((e) => {
  console.error('Translation failed:', e);
  process.exit(1);
});
