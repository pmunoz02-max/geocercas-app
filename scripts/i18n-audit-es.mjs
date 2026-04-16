import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const esPath = path.resolve(__dirname, '../src/i18n/es.json');

// Only strong English-only words that would never appear naturally in Spanish text.
// Loan words used as-is in Spanish tech (email, login, password, dashboard, tracking,
// geofence, user, location, team) are intentionally excluded to avoid false positives.
const englishMarkers = [
  'the', 'and', 'with', 'your', 'for', 'you',
  'sign', 'manage', 'smart', 'anywhere', 'world',
  'welcome', 'save', 'cancel', 'search', 'settings',
  'today', 'check', 'employee', 'employees', 'staff',
  'report', 'reports', 'start', 'clock', 'home'
];

// Product / brand terms accepted as-is in any language — strip before analysis.
const productTermsRe = /\b(magic\s+link|power\s+bi|google|oauth|gps|csv|api|webview|twa|lat|lng|supabase|vercel)\b/gi;

// Technical patterns to strip before analysis.
const stripPatterns = [
  /https?:\/\/\S+/g,        // URLs
  /[\w.-]+@[\w.-]+\.\w+/g, // email addresses
  /\{\{[^}]+\}\}/g,         // i18n interpolations {{var}}
  /\bv?\d+[\d.]+\b/g,       // version strings v1.2.3
  /\b[A-Z]{2,}\b/g,         // acronyms (GPS, CSV, TWA …)
];

function flattenObject(obj, prefix = '') {
  const result = {};

  for (const [key, value] of Object.entries(obj)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, nextKey));
    } else {
      result[nextKey] = value;
    }
  }

  return result;
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWords(text) {
  return normalizeText(text)
    .split(' ')
    .filter(Boolean);
}

function sanitizeForAnalysis(text) {
  let s = text.replace(productTermsRe, ' ');
  for (const re of stripPatterns) {
    s = s.replace(re, ' ');
  }
  return s.replace(/\s+/g, ' ').trim();
}

function detectIssue(value) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed.length <= 2) return null;
  if (/^\d+$/.test(trimmed)) return null;

  // Strip product terms and technical patterns before marker analysis.
  const sanitized = sanitizeForAnalysis(trimmed);
  if (!sanitized || sanitized.length <= 2) return null;

  // Only match markers that are standalone words of length >= 3.
  const words = getWords(sanitized).filter((w) => w.length >= 3);
  if (words.length === 0) return null;

  const foundMarkers = englishMarkers.filter((word) => words.includes(word));
  const hasSpanishAccent = /[áéíóúüñ¿¡]/i.test(trimmed);

  // HIGH: 2 or more English markers — almost certainly English text.
  if (foundMarkers.length >= 2) {
    return {
      severity: 'HIGH',
      reason: `Contains English markers: ${foundMarkers.join(', ')}`
    };
  }

  // HIGH: 1 marker in a very short string (≤3 words) with no Spanish accent.
  if (foundMarkers.length === 1 && words.length <= 3 && !hasSpanishAccent) {
    return {
      severity: 'HIGH',
      reason: `Short text with English marker: ${foundMarkers[0]}`
    };
  }

  // MEDIUM: 1 marker in a medium string (4–8 words) with no Spanish accent.
  // Long sentences without accents are NOT flagged — they are often valid Spanish.
  if (foundMarkers.length === 1 && !hasSpanishAccent && words.length >= 4 && words.length <= 8) {
    return {
      severity: 'MEDIUM',
      reason: `Medium text with English marker and no accents: ${foundMarkers[0]}`
    };
  }

  return null;
}

function main() {
  if (!fs.existsSync(esPath)) {
    console.error(`File not found: ${esPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(esPath, 'utf8');
  const json = JSON.parse(raw);
  const flat = flattenObject(json);

  const entries = Object.entries(flat);
  const totalKeys = entries.length;
  const flagged = [];

  for (const [key, value] of entries) {
    const issue = detectIssue(value);
    if (issue) {
      flagged.push({
        key,
        value,
        severity: issue.severity,
        reason: issue.reason
      });
    }
  }

  const high = flagged.filter((item) => item.severity === 'HIGH');
  const medium = flagged.filter((item) => item.severity === 'MEDIUM');
  const percentage = totalKeys === 0 ? 100 : (((totalKeys - flagged.length) / totalKeys) * 100).toFixed(2);

  console.log('\n🔍 i18n audit (es.json)\n');

  if (high.length > 0) {
    console.log('❌ HIGH\n');
    for (const item of high) {
      console.log(`${item.key}`);
      console.log(`  value : ${JSON.stringify(item.value)}`);
      console.log(`  reason: ${item.reason}\n`);
    }
  }

  if (medium.length > 0) {
    console.log('⚠️ MEDIUM\n');
    for (const item of medium) {
      console.log(`${item.key}`);
      console.log(`  value : ${JSON.stringify(item.value)}`);
      console.log(`  reason: ${item.reason}\n`);
    }
  }

  if (flagged.length === 0) {
    console.log('✅ No suspicious values found in es.json\n');
  }

  console.log('📊 SUMMARY');
  console.log(`total keys   : ${totalKeys}`);
  console.log(`flagged keys : ${flagged.length}`);
  console.log(`clean score  : ${percentage}%\n`);

  if (flagged.length > 0) {
    process.exitCode = 2;
  }
}

main();