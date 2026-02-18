#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");

const LOCALES = {
  es: path.join(SRC_DIR, "i18n", "es.json"),
  en: path.join(SRC_DIR, "i18n", "en.json"),
  fr: path.join(SRC_DIR, "i18n", "fr.json")
};

const BASE = (process.env.BASE || "es").toLowerCase();
const OUT_DIR = path.join(SRC_DIR, "i18n", "_audit");

function readJson(p) {
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
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

    if (isObject(v)) out.push(...flattenKeys(v, keyPath));
    else out.push(keyPath);
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

function getByPath(obj, dotted) {
  const parts = dotted.split(".");
  let cur = obj;
  for (const p of parts) {
    if (!isObject(cur) && !Array.isArray(cur)) return undefined;
    cur = cur?.[p];
    if (typeof cur === "undefined") return undefined;
  }
  return cur;
}

function setByPath(obj, dotted, value) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const isLast = i === parts.length - 1;
    if (isLast) {
      cur[p] = value;
      return;
    }
    if (!isObject(cur[p])) cur[p] = {};
    cur = cur[p];
  }
}

function buildMissingSkeleton(baseObj, missingKeys) {
  const out = {};
  for (const k of missingKeys) {
    const v = getByPath(baseObj, k);
    setByPath(out, k, v);
  }
  return out;
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
    "Advanced options",
    "Opciones avanzadas",
    "Go to",
    "Ir a"
  ];

  const findings = [];
  for (const f of files) {
    const txt = fs.readFileSync(f, "utf8");

    for (const n of needles) {
      if (txt.includes(n)) findings.push({ file: f, type: "needle", match: n });
    }

    const jsxTextRegex = />\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][^<>{}\n]{2,160})\s*</g;
    let m;
    while ((m = jsxTextRegex.exec(txt))) {
      const s = String(m[1] || "").trim();
      if (!s) continue;
      if (s.includes("t(")) continue;
      if (/^[\d\W_]+$/.test(s)) continue;
      if (s.length < 3) continue;

      findings.push({ file: f, type: "jsxText", match: s.slice(0, 160) });
      if (findings.length > 1200) break;
    }
  }
  return findings;
}

function scanUntranslated({ baseObj, otherObj, baseLng, otherLng }) {
  const baseKeys = flattenKeys(baseObj).sort();
  const issues = [];

  const frenchChars = /[àâçéèêëîïôùûüÿœæ]/i;
  const spanishChars = /[¿¡ñáéíóúü]/i;

  const englishHints = [
    "go to",
    "log in",
    "logout",
    "dashboard",
    "loading",
    "create",
    "delete",
    "save",
    "help center",
    "privacy",
    "support",
    "view",
    "enter"
  ];

  for (const k of baseKeys) {
    const b = getByPath(baseObj, k);
    const o = getByPath(otherObj, k);

    if (typeof o === "undefined") continue;
    if (typeof o !== "string") continue;

    const val = o.trim();
    const baseVal = typeof b === "string" ? b.trim() : "";

    if (baseVal && val === baseVal) {
      issues.push({ key: k, type: "same_as_base", base: baseLng, other: otherLng, sample: val.slice(0, 160) });
      continue;
    }

    if (otherLng === "fr") {
      const low = val.toLowerCase();
      const looksEnglish = englishHints.some((h) => low.includes(h));
      const hasFR = frenchChars.test(val);
      const hasES = spanishChars.test(val);

      if (looksEnglish && !hasFR) {
        issues.push({ key: k, type: "looks_english", base: baseLng, other: otherLng, sample: val.slice(0, 160) });
      } else if (hasES && !hasFR) {
        issues.push({ key: k, type: "looks_spanish", base: baseLng, other: otherLng, sample: val.slice(0, 160) });
      }
    }
  }

  return issues;
}

function ensureLocalesExist() {
  for (const [lng, p] of Object.entries(LOCALES)) {
    if (!fs.existsSync(p)) {
      console.error(`❌ No existe: ${p}`);
      process.exit(1);
    }
    console.log(`✅ Locale ${lng}: ${path.relative(ROOT, p)}`);
  }
}

function main() {
  ensureLocalesExist();

  if (!LOCALES[BASE]) {
    console.error(`❌ BASE inválido: ${BASE}. Opciones: ${Object.keys(LOCALES).join(", ")}`);
    process.exit(1);
  }

  const data = {
    es: readJson(LOCALES.es),
    en: readJson(LOCALES.en),
    fr: readJson(LOCALES.fr)
  };

  const keys = {
    es: flattenKeys(data.es),
    en: flattenKeys(data.en),
    fr: flattenKeys(data.fr)
  };

  console.log(`\n=== i18n AUDIT: Missing/Extra keys (base: ${BASE.toUpperCase()}) ===`);

  const baseKeys = keys[BASE];
  const baseObj = data[BASE];

  for (const lng of Object.keys(LOCALES)) {
    if (lng === BASE) continue;

    const d = diffKeys(baseKeys, keys[lng]);

    console.log(`\n[${lng.toUpperCase()}] Missing in ${lng.toUpperCase()}: ${d.missingInOther.length}`);
    console.log(d.missingInOther.slice(0, 140).join("\n") || "(none)");
    if (d.missingInOther.length > 140) console.log("...");

    console.log(`\n[${lng.toUpperCase()}] Extra in ${lng.toUpperCase()}: ${d.extraInOther.length}`);
    console.log(d.extraInOther.slice(0, 140).join("\n") || "(none)");
    if (d.extraInOther.length > 140) console.log("...");

    const missingSkeleton = buildMissingSkeleton(baseObj, d.missingInOther);
    const outMissingPath = path.join(OUT_DIR, `${lng}.missing.from_${BASE}.json`);
    writeJson(outMissingPath, missingSkeleton);
    console.log(`\n✅ Wrote missing skeleton: ${path.relative(ROOT, outMissingPath)}`);

    const untranslated = scanUntranslated({ baseObj, otherObj: data[lng], baseLng: BASE, otherLng: lng });
    const outUntranslatedPath = path.join(OUT_DIR, `${lng}.untranslated.from_${BASE}.json`);
    writeJson(outUntranslatedPath, untranslated);
    console.log(`✅ Wrote untranslated report: ${path.relative(ROOT, outUntranslatedPath)}`);
    console.log(`   Untranslated candidates: ${untranslated.length}`);
  }

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
    for (const it of arr.slice(0, 16)) console.log(`  [${it.type}] ${it.match}`);
    if (arr.length > 16) console.log("  ...");
    console.log("");
  }

  if (files.length > 60) console.log("(Output truncated)");
  console.log("\n✅ Done.\n");
  console.log(`📌 Outputs: ${path.relative(ROOT, OUT_DIR)}`);
}

main();
