#!/usr/bin/env node
/**
 * i18n-super-audit.mjs
 *
 * App Geocercas - Auditor integral i18n
 * Modo seguro para PREVIEW
 *
 * Funciones:
 *  1) Audita paridad entre en/es/fr
 *  2) Sincroniza claves faltantes desde EN
 *  3) Detecta claves extra por idioma
 *  4) Escanea /src y detecta textos hardcoded en React/JS/TS
 *  5) Genera reporte JSON
 *
 * Uso:
 *   node scripts/i18n-super-audit.mjs
 *   node scripts/i18n-super-audit.mjs --write
 *   node scripts/i18n-super-audit.mjs --write --src ./src --i18n ./src/i18n
 *
 * Modo por defecto:
 *   - NO escribe cambios
 *   - solo audita y reporta
 *
 * Con --write:
 *   - agrega claves faltantes a es.json y fr.json usando fallback de en.json
 *   - NO borra claves extra
 *   - NO toca archivos React
 */

import fs from "fs";
import path from "path";
import process from "process";

const args = process.argv.slice(2);

const CONFIG = {
  srcDir: getArgValue("--src") || "./src",
  i18nDir: getArgValue("--i18n") || "./src/i18n",
  outDir: getArgValue("--out") || "./i18n-reports",
  write: args.includes("--write"),
  verbose: args.includes("--verbose"),
  failOnMissing: args.includes("--fail-on-missing"),
  primaryLocale: "en",
  locales: ["en", "es", "fr"],
  ignoreDirs: new Set([
    "node_modules",
    "dist",
    "build",
    ".git",
    ".next",
    ".vercel",
    "coverage",
    "vendor",
  ]),
  includeExts: new Set([".js", ".jsx", ".ts", ".tsx"]),
  excludeFiles: [
    /\.test\./i,
    /\.spec\./i,
    /\.stories\./i,
    /src[\\/]+i18n[\\/]/i,
  ],
  minTextLength: 2,
  maxTextLength: 180,
  ignoreTextRegexes: [
    /^\s*$/,
    /^[0-9]+$/,
    /^[#./\\:_-]+$/,
    /^[A-Z0-9_]+$/,
    /^\{.*\}$/,
    /^https?:\/\//i,
    /^aria-/i,
    /^data-/i,
    /^mailto:/i,
    /^tel:/i,
    /^#[0-9a-f]{3,8}$/i,
    /^\/[a-z0-9/_-]*$/i,
    /^[a-z0-9_.-]+\.(png|jpg|jpeg|svg|webp|gif|ico)$/i,
    /^(sm|md|lg|xl|2xl|3xl|4xl)$/i,
    /^(flex|grid|block|inline|hidden)$/i,
    /^(true|false|null|undefined)$/i,
    /^[-a-z0-9]+$/i, // evita classnames simples / slugs
  ],
  jsxTextIgnoreWords: new Set([
    "ok",
    "id",
    "gps",
    "api",
    "url",
    "sql",
    "json",
    "csv",
    "pdf",
    "en",
    "es",
    "fr",
  ]),
};

const REPORT_TS = new Date().toISOString().replace(/[:.]/g, "-");
const REPORT_PATH = path.join(CONFIG.outDir, `i18n-super-audit-${REPORT_TS}.json`);

main().catch((err) => {
  console.error("\n❌ Error fatal:", err?.stack || err?.message || err);
  process.exit(1);
});

async function main() {
  ensureDir(CONFIG.outDir);

  const localePaths = Object.fromEntries(
    CONFIG.locales.map((loc) => [loc, path.join(CONFIG.i18nDir, `${loc}.json`)])
  );

  const localeData = {};
  for (const loc of CONFIG.locales) {
    localeData[loc] = readJson(localePaths[loc]);
  }

  const flat = {};
  for (const loc of CONFIG.locales) {
    flat[loc] = flattenObject(localeData[loc]);
  }

  const primary = flat[CONFIG.primaryLocale];
  if (!primary || Object.keys(primary).length === 0) {
    throw new Error(`El locale fuente ${CONFIG.primaryLocale}.json está vacío o no existe.`);
  }

  const localeAnalysis = analyzeLocales(primary, flat);
  const sourceFiles = walkFiles(CONFIG.srcDir);
  const hardcoded = scanHardcodedTexts(sourceFiles, primary);

  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      mode: CONFIG.write ? "write" : "dry-run",
      srcDir: normalizeSlashes(CONFIG.srcDir),
      i18nDir: normalizeSlashes(CONFIG.i18nDir),
      primaryLocale: CONFIG.primaryLocale,
      locales: CONFIG.locales,
      filesScanned: sourceFiles.length,
    },
    locales: localeAnalysis,
    hardcoded,
    summary: buildSummary(localeAnalysis, hardcoded),
  };

  if (CONFIG.write) {
    writeMissingLocaleKeys(localePaths, localeData, localeAnalysis);
    report.writeResult = {
      changedFiles: CONFIG.locales
        .filter((loc) => loc !== CONFIG.primaryLocale)
        .filter((loc) => localeAnalysis[loc].missing.length > 0)
        .map((loc) => normalizeSlashes(localePaths[loc])),
    };
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  printHumanSummary(report, REPORT_PATH);

  if (CONFIG.failOnMissing) {
    const totalMissing = CONFIG.locales
      .filter((loc) => loc !== CONFIG.primaryLocale)
      .reduce((acc, loc) => acc + localeAnalysis[loc].missing.length, 0);

    if (totalMissing > 0) {
      console.error("\n❌ Faltan claves i18n. Fallando por --fail-on-missing.");
      process.exit(2);
    }
  }
}

function getArgValue(flag) {
  const idx = args.findIndex((a) => a === flag);
  if (idx === -1) return null;
  return args[idx + 1] || null;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function normalizeSlashes(p) {
  return p.replace(/\\/g, "/");
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe archivo: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`JSON inválido en ${filePath}: ${err.message}`);
  }
}

function writeJsonSorted(filePath, obj) {
  const sorted = deepSortObject(obj);
  fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2) + "\n", "utf8");
}

function flattenObject(obj, prefix = "", out = {}) {
  if (obj === null || obj === undefined) return out;

  if (typeof obj !== "object" || Array.isArray(obj)) {
    out[prefix] = obj;
    return out;
  }

  for (const key of Object.keys(obj)) {
    const next = prefix ? `${prefix}.${key}` : key;
    flattenObject(obj[key], next, out);
  }
  return out;
}

function setByPath(obj, dottedPath, value) {
  const parts = dottedPath.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== "object" || Array.isArray(cur[p])) {
      cur[p] = {};
    }
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function deepSortObject(value) {
  if (Array.isArray(value)) {
    return value.map(deepSortObject);
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
      out[key] = deepSortObject(value[key]);
    }
    return out;
  }
  return value;
}

function analyzeLocales(primaryFlat, allFlat) {
  const primaryKeys = new Set(Object.keys(primaryFlat));
  const analysis = {};

  for (const loc of CONFIG.locales) {
    const current = allFlat[loc] || {};
    const currentKeys = new Set(Object.keys(current));

    const missing = [...primaryKeys].filter((k) => !currentKeys.has(k)).sort();
    const extra = [...currentKeys].filter((k) => !primaryKeys.has(k)).sort();
    const emptyValues = Object.entries(current)
      .filter(([, v]) => v === "" || v === null || v === undefined)
      .map(([k]) => k)
      .sort();

    const sameAsEnglish =
      loc === CONFIG.primaryLocale
        ? []
        : Object.keys(current)
            .filter((k) => k in primaryFlat)
            .filter((k) => {
              const a = stringifyValue(primaryFlat[k]);
              const b = stringifyValue(current[k]);
              return a === b;
            })
            .sort();

    analysis[loc] = {
      totalKeys: Object.keys(current).length,
      missing,
      extra,
      emptyValues,
      sameAsEnglish,
    };
  }

  return analysis;
}

function stringifyValue(v) {
  return typeof v === "string" ? v : JSON.stringify(v);
}

function writeMissingLocaleKeys(localePaths, localeData, localeAnalysis) {
  for (const loc of CONFIG.locales) {
    if (loc === CONFIG.primaryLocale) continue;
    const missing = localeAnalysis[loc].missing;
    if (!missing.length) continue;

    const target = structuredCloneSafe(localeData[loc]);
    const sourceFlat = flattenObject(localeData[CONFIG.primaryLocale]);

    for (const key of missing) {
      setByPath(target, key, sourceFlat[key]);
    }

    writeJsonSorted(localePaths[loc], target);
  }
}

function structuredCloneSafe(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function walkFiles(rootDir) {
  const results = [];

  function walk(current) {
    if (!fs.existsSync(current)) return;
    const stat = fs.statSync(current);
    if (!stat.isDirectory()) return;

    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (CONFIG.ignoreDirs.has(entry.name)) continue;
        walk(full);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name);
      if (!CONFIG.includeExts.has(ext)) continue;
      if (CONFIG.excludeFiles.some((rx) => rx.test(full))) continue;

      results.push(full);
    }
  }

  walk(rootDir);
  return results.sort();
}

function scanHardcodedTexts(files, englishFlat) {
  const englishValuesSet = new Set(
    Object.values(englishFlat)
      .filter((v) => typeof v === "string")
      .map((s) => normalizeText(s))
      .filter(Boolean)
  );

  const items = [];

  for (const file of files) {
    const code = fs.readFileSync(file, "utf8");
    const normalizedPath = normalizeSlashes(file);

    const jsxTextHits = detectJsxInnerText(code, normalizedPath);
    const attrHits = detectJsxAttributeText(code, normalizedPath);
    const literalHits = detectStringLiterals(code, normalizedPath);

    const merged = [...jsxTextHits, ...attrHits, ...literalHits]
      .filter((hit) => shouldKeepHardcodedHit(hit.text))
      .map((hit) => ({
        ...hit,
        normalizedText: normalizeText(hit.text),
      }))
      .filter((hit) => hit.normalizedText.length >= CONFIG.minTextLength)
      .filter((hit) => hit.normalizedText.length <= CONFIG.maxTextLength)
      .filter((hit) => !englishValuesSet.has(hit.normalizedText));

    for (const hit of merged) {
      hit.suggestedKey = suggestI18nKey(hit.text, normalizedPath);
      delete hit.normalizedText;
      items.push(hit);
    }
  }

  return dedupeHits(items).sort(sortHardcodedHits);
}

function dedupeHits(items) {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    const key = [
      item.file,
      item.line,
      item.column,
      item.kind,
      item.text.trim(),
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function sortHardcodedHits(a, b) {
  return (
    a.file.localeCompare(b.file) ||
    a.line - b.line ||
    a.column - b.column ||
    a.text.localeCompare(b.text)
  );
}

function detectJsxInnerText(code, file) {
  const hits = [];
  const regex = />([^<>{}\n][^<>{]*?)</g;

  let match;
  while ((match = regex.exec(code)) !== null) {
    const raw = match[1];
    const text = cleanupTextCandidate(raw);
    if (!text) continue;

    const startIndex = match.index + 1;
    const pos = getLineColumn(code, startIndex);

    hits.push({
      file,
      line: pos.line,
      column: pos.column,
      kind: "jsx-text",
      text,
      context: safeSnippet(code, startIndex, 120),
    });
  }

  return hits;
}

function detectJsxAttributeText(code, file) {
  const hits = [];
  const attrRegex =
    /\b(?:label|title|placeholder|alt|helperText|aria-label|aria-description|emptyText|description|tooltip|confirmText|cancelText)\s*=\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/g;

  let match;
  while ((match = attrRegex.exec(code)) !== null) {
    const text = cleanupTextCandidate(match[1] || match[2] || match[3] || "");
    if (!text) continue;

    const pos = getLineColumn(code, match.index);
    hits.push({
      file,
      line: pos.line,
      column: pos.column,
      kind: "jsx-attr",
      text,
      context: safeSnippet(code, match.index, 140),
    });
  }

  return hits;
}

function detectStringLiterals(code, file) {
  const hits = [];
  const regex = /(?<![.\w])(?:"([^"\n]{2,180})"|'([^'\n]{2,180})'|`([^`\n]{2,180})`)/g;

  let match;
  while ((match = regex.exec(code)) !== null) {
    const text = cleanupTextCandidate(match[1] || match[2] || match[3] || "");
    if (!text) continue;

    const before = code.slice(Math.max(0, match.index - 40), match.index);
    const after = code.slice(match.index, Math.min(code.length, match.index + 60));

    // Evitar imports, paths, classNames, keys técnicas
    if (/\bimport\s*$/.test(before)) continue;
    if (/\brequire\s*\($/.test(before)) continue;
    if (/\bfrom\s*$/.test(before)) continue;
    if (/\bclassName\s*=\s*$/.test(before)) continue;
    if (/\bvariant\s*[:=]\s*$/.test(before)) continue;
    if (/\bsize\s*[:=]\s*$/.test(before)) continue;
    if (/\btype\s*[:=]\s*$/.test(before)) continue;
    if (/\bkey\s*[:=]\s*$/.test(before)) continue;
    if (/\bt\s*\(\s*$/.test(before)) continue;
    if (/^\s*["'`][A-Za-z0-9_.-]+["'`]\s*[,)}\]]?$/.test(after)) {
      // posible enum técnico
    }

    const pos = getLineColumn(code, match.index);
    hits.push({
      file,
      line: pos.line,
      column: pos.column,
      kind: "string-literal",
      text,
      context: safeSnippet(code, match.index, 140),
    });
  }

  return hits;
}

function shouldKeepHardcodedHit(text) {
  const cleaned = text.trim();
  if (!cleaned) return false;

  const norm = normalizeText(cleaned);
  if (!norm) return false;

  if (CONFIG.ignoreTextRegexes.some((rx) => rx.test(cleaned))) return false;

  const lower = cleaned.toLowerCase();
  if (CONFIG.jsxTextIgnoreWords.has(lower)) return false;

  // Debe tener al menos una letra visible
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñÜüÀÂÆÇÈÉÊËÎÏÔŒÙÛÜŸàâæçèéêëîïôœùûüÿ]/.test(cleaned)) {
    return false;
  }

  // Evitar trozos evidentemente técnicos
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(cleaned) && cleaned.length < 18) {
    return false;
  }

  return true;
}

function cleanupTextCandidate(value) {
  if (!value) return "";
  return value
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .trim();
}

function normalizeText(value) {
  return cleanupTextCandidate(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getLineColumn(code, index) {
  const lines = code.slice(0, index).split("\n");
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

function safeSnippet(code, index, size = 120) {
  const start = Math.max(0, index - Math.floor(size / 2));
  const end = Math.min(code.length, index + Math.floor(size / 2));
  return code.slice(start, end).replace(/\s+/g, " ").trim();
}

function suggestI18nKey(text, filePath) {
  const clean = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[%$€°]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");

  const baseWords = clean
    .split("_")
    .filter(Boolean)
    .slice(0, 6);

  const stem = baseWords.join("_") || "text";

  const folder = deriveFeatureFromPath(filePath);
  return `${folder}.${stem}`;
}

function deriveFeatureFromPath(filePath) {
  const p = normalizeSlashes(filePath).toLowerCase();

  if (p.includes("/billing")) return "billing";
  if (p.includes("/pricing")) return "pricing";
  if (p.includes("/tracker")) return "tracker";
  if (p.includes("/geocerca")) return "geocercas";
  if (p.includes("/dashboard")) return "dashboard";
  if (p.includes("/report")) return "reportes";
  if (p.includes("/header")) return "app";
  if (p.includes("/tabs")) return "app.tabs";
  if (p.includes("/layout")) return "app";
  if (p.includes("/login")) return "auth";
  if (p.includes("/invite")) return "invitarTracker";
  return "common";
}

function buildSummary(localeAnalysis, hardcoded) {
  const missingByLocale = {};
  const extraByLocale = {};
  const emptyByLocale = {};

  for (const loc of CONFIG.locales) {
    missingByLocale[loc] = localeAnalysis[loc].missing.length;
    extraByLocale[loc] = localeAnalysis[loc].extra.length;
    emptyByLocale[loc] = localeAnalysis[loc].emptyValues.length;
  }

  return {
    localeKeyCounts: Object.fromEntries(
      CONFIG.locales.map((loc) => [loc, localeAnalysis[loc].totalKeys])
    ),
    missingByLocale,
    extraByLocale,
    emptyByLocale,
    hardcodedCount: hardcoded.length,
    topFilesWithHardcoded: topCounts(hardcoded.map((x) => x.file), 15),
  };
}

function topCounts(values, limit = 10) {
  const map = new Map();
  for (const v of values) map.set(v, (map.get(v) || 0) + 1);
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function printHumanSummary(report, reportPath) {
  const { summary, locales } = report;

  console.log("\n================ I18N SUPER AUDIT ================");
  console.log(`Modo:           ${report.meta.mode}`);
  console.log(`SRC:            ${report.meta.srcDir}`);
  console.log(`I18N:           ${report.meta.i18nDir}`);
  console.log(`Archivos:       ${report.meta.filesScanned}`);
  console.log("");

  for (const loc of CONFIG.locales) {
    console.log(
      `${loc.toUpperCase().padEnd(4)} keys=${String(locales[loc].totalKeys).padEnd(5)} missing=${String(
        locales[loc].missing.length
      ).padEnd(5)} extra=${String(locales[loc].extra.length).padEnd(5)} empty=${String(
        locales[loc].emptyValues.length
      ).padEnd(5)}`
    );
  }

  console.log("");
  console.log(`Hardcoded detectados: ${summary.hardcodedCount}`);
  console.log(`Reporte JSON:         ${normalizeSlashes(reportPath)}`);

  if (summary.topFilesWithHardcoded.length) {
    console.log("\nTop archivos con hardcoded:");
    for (const item of summary.topFilesWithHardcoded.slice(0, 10)) {
      console.log(`- ${item.count.toString().padStart(3)}  ${item.value}`);
    }
  }

  const nonPrimaryMissing = CONFIG.locales
    .filter((loc) => loc !== CONFIG.primaryLocale)
    .some((loc) => locales[loc].missing.length > 0);

  if (!nonPrimaryMissing) {
    console.log("\n✅ Paridad de claves OK respecto a EN.");
  } else {
    console.log("\n⚠ Hay claves faltantes en locales secundarios.");
  }

  if (CONFIG.write) {
    console.log("\n📝 Modo write activo: se agregaron claves faltantes usando fallback desde EN.");
  } else {
    console.log("\n🔒 Modo seguro: no se escribieron cambios.");
  }

  console.log("==================================================\n");
}