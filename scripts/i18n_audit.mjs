#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");

// Ajusta si tus rutas reales difieren:
const LOCALES = {
  es: path.join(SRC_DIR, "i18n", "es.json"),
  en: path.join(SRC_DIR, "i18n", "en.json"),
  fr: path.join(SRC_DIR, "i18n", "fr.json"),
};

function readJson(p) {
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function isObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function flattenKeys(obj, prefix = "") {
  const out = [];
  if (!isObject(obj)) return out;

  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const keyPath = prefix ? `${prefix}.${k}` : k;

    if (isObject(v)) {
      out.push(...flattenKeys(v, keyPath));
    } else if (Array.isArray(v)) {
      out.push(keyPath);
    } else {
      out.push(keyPath);
    }
  }
  return out;
}

function diffKeys(baseKeys, otherKeys) {
  const base = new Set(baseKeys);
  const other = new Set(otherKeys);

  const missingInOther = [...base].filter((k) => !other.has(k)).sort();
  const extraInOther = [...other].filter((k) => !base.has(k)).sort();

  return { missingInOther, extraInOther };
}

function walkFiles(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") continue;
      walkFiles(p, exts, out);
    } else {
      if (exts.includes(path.extname(entry.name))) out.push(p);
    }
  }
  return out;
}

function scanHardcodes() {
  const exts = [".js", ".jsx", ".ts", ".tsx"];
  const files = walkFiles(SRC_DIR, exts);

  const needles = [
    "Iniciar sesión",
    "Login",
    "Cerrar sesión",
    "Sin organización",
    "Sin email",
    "ROOT",
    "SIN ROL",
    "Salir",
    "Inicio",
    "Geocerca",
    "Personal",
    "Actividades",
    "Asignaciones",
    "Reportes",
    "Tracker",
  ];

  const findings = [];
  for (const f of files) {
    const txt = fs.readFileSync(f, "utf8");

    for (const n of needles) {
      if (txt.includes(n)) findings.push({ file: f, type: "needle", match: n });
    }

    const jsxTextRegex = />\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][^<>{}\n]{2,120})\s*</g;
    let m;
    while ((m = jsxTextRegex.exec(txt))) {
      const s = String(m[1] || "").trim();
      if (!s) continue;
      if (s.includes("t(")) continue;
      if (/^[\d\W_]+$/.test(s)) continue;
      if (s.length < 3) continue;

      findings.push({ file: f, type: "jsxText", match: s.slice(0, 120) });
      if (findings.length > 800) break;
    }
  }
  return findings;
}

function main() {
  for (const [lng, p] of Object.entries(LOCALES)) {
    if (!fs.existsSync(p)) {
      console.error(`❌ No existe: ${p}`);
      process.exit(1);
    }
    console.log(`✅ Locale ${lng}: ${path.relative(ROOT, p)}`);
  }

  const data = {
    es: readJson(LOCALES.es),
    en: readJson(LOCALES.en),
    fr: readJson(LOCALES.fr),
  };

  const keys = {
    es: flattenKeys(data.es),
    en: flattenKeys(data.en),
    fr: flattenKeys(data.fr),
  };

  console.log("\n=== i18n AUDIT: Missing/Extra keys (base: ES) ===");
  const enDiff = diffKeys(keys.es, keys.en);
  const frDiff = diffKeys(keys.es, keys.fr);

  console.log(`\n[EN] Missing in EN: ${enDiff.missingInOther.length}`);
  console.log(enDiff.missingInOther.slice(0, 120).join("\n") || "(none)");
  if (enDiff.missingInOther.length > 120) console.log("...");

  console.log(`\n[EN] Extra in EN: ${enDiff.extraInOther.length}`);
  console.log(enDiff.extraInOther.slice(0, 120).join("\n") || "(none)");
  if (enDiff.extraInOther.length > 120) console.log("...");

  console.log(`\n[FR] Missing in FR: ${frDiff.missingInOther.length}`);
  console.log(frDiff.missingInOther.slice(0, 120).join("\n") || "(none)");
  if (frDiff.missingInOther.length > 120) console.log("...");

  console.log(`\n[FR] Extra in FR: ${frDiff.extraInOther.length}`);
  console.log(frDiff.extraInOther.slice(0, 120).join("\n") || "(none)");
  if (frDiff.extraInOther.length > 120) console.log("...");

  console.log("\n=== i18n AUDIT: Possible hardcoded UI strings in src/ ===");
  const hard = scanHardcodes();
  const byFile = new Map();
  for (const it of hard) {
    const arr = byFile.get(it.file) || [];
    arr.push(it);
    byFile.set(it.file, arr);
  }

  const files = [...byFile.keys()].sort();
  console.log(`Found in ${files.length} files.\n`);

  for (const f of files.slice(0, 60)) {
    console.log(`--- ${path.relative(ROOT, f)} ---`);
    const arr = byFile.get(f) || [];
    for (const it of arr.slice(0, 14)) console.log(`  [${it.type}] ${it.match}`);
    if (arr.length > 14) console.log("  ...");
    console.log("");
  }

  if (files.length > 60) console.log("(Output truncated)");
  console.log("\n✅ Done.\n");
}

main();
