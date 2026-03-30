// i18n-validate.mjs
// Deeply compares es.json, en.json, fr.json in src/i18n for missing/extra keys and type mismatches.
// Exits with code 1 if any differences are found.
import fs from 'fs/promises';
import path from 'path';

const i18nDir = path.resolve('src/i18n');
const files = ['es.json', 'en.json', 'fr.json'];

async function readJson(file) {
  const filePath = path.join(i18nDir, file);
  const data = await fs.readFile(filePath, 'utf8');
  return JSON.parse(data);
}

function compareKeys(ref, other, refPath = '', diffs = []) {
  // Check for missing/extra keys and type mismatches
  for (const key of Object.keys(ref)) {
    const fullPath = refPath ? `${refPath}.${key}` : key;
    if (!(key in other)) {
      diffs.push(`Missing key in target: ${fullPath}`);
    } else {
      if (typeof ref[key] !== typeof other[key]) {
        diffs.push(`Type mismatch at ${fullPath}: ${typeof ref[key]} vs ${typeof other[key]}`);
      } else if (typeof ref[key] === 'object' && ref[key] && other[key]) {
        compareKeys(ref[key], other[key], fullPath, diffs);
      }
    }
  }
  for (const key of Object.keys(other)) {
    const fullPath = refPath ? `${refPath}.${key}` : key;
    if (!(key in ref)) {
      diffs.push(`Extra key in target: ${fullPath}`);
    }
  }
  return diffs;
}

async function main() {
  const [es, en, fr] = await Promise.all(files.map(readJson));
  let hasDiffs = false;

  const pairs = [
    { base: 'es', baseObj: es, compare: 'en', compareObj: en },
    { base: 'es', baseObj: es, compare: 'fr', compareObj: fr },
    { base: 'en', baseObj: en, compare: 'fr', compareObj: fr },
  ];

  for (const { base, baseObj, compare, compareObj } of pairs) {
    const diffs = compareKeys(baseObj, compareObj);
    if (diffs.length) {
      hasDiffs = true;
      console.log(`\nComparing ${base}.json → ${compare}.json:`);
      for (const diff of diffs) {
        console.log('  ' + diff);
      }
    }
  }

  if (hasDiffs) {
    console.error('\n❌ i18n files have differences.');
    process.exit(1);
  } else {
    console.log('✅ All i18n files match.');
  }
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
