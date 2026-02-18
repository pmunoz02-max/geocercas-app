#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const OUT_DIR = path.join(SRC_DIR, "i18n", "_audit_en_fr");

const EN_PATH = path.join(SRC_DIR, "i18n", "en.json");
const FR_PATH = path.join(SRC_DIR, "i18n", "fr.json");

// ✅ Valores que pueden ser iguales EN↔FR y NO deben contarse como issue
// (términos "internacionales" o abreviaturas UI aceptables)
const SAME_OK = new Set([
  "date",
  "description",
  "actions",
  "dimension",
  "note",
  "lat",
  "lng",
  "pts",
  "instructions",
  "contact / support",
  "app geocercas",
  "(login-v31 no-js)"
]);

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
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

  if (
    typeof obj === "string" ||
    typeof obj === "number" ||
    typeof obj === "boolean" ||
    obj == null
  ) {
    if (prefix) out.push(prefix);
    return out;
  }

  if (Array.isArray(obj)) {
    if (prefix) out.push(prefix);
    for (let i = 0; i < obj.length; i++) {
      const p = prefix ? `${prefix}.${i}` : String(i);
      out.push(...flattenKeys(obj[i], p));
    }
    return out;
  }

  if (isObject(obj)) {
    for (const k of Object.keys(obj)) {
      const p = prefix ? `${prefix}.${k}` : k;
      out.push(...flattenKeys(obj[k], p));
    }
    return out;
  }

  if (prefix) out.push(prefix);
  return out;
}

function diffKeys(baseKeys, otherKeys) {
  const base = new Set(baseKeys);
  const other = new Set(otherKeys);

  const missing = [...base].filter((k) => !other.has(k)).sort();
  const extra = [...other].filter((k) => !base.has(k)).sort();

  return { missing, extra };
}

function getByPath(obj, dotted) {
  const parts = dotted.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur?.[p];
  }
  return cur;
}

function normalizeLite(s) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isSameOk(enText, frText) {
  // Si ambos son iguales (sin case/espacios) y están en whitelist, no es issue.
  const a = normalizeLite(enText);
  const b = normalizeLite(frText);
  if (!a || a !== b) return false;
  return SAME_OK.has(a);
}

function scanIssues(enObj, frObj) {
  const keys = flattenKeys(enObj).sort();
  const issues = [];

  const frenchChars = /[àâçéèêëîïôùûüÿœæ]/i;
  const spanishChars = /[¿¡ñáéíóúü]/i;

  // ⚠️ placeholders / dominios “malos” a detectar
  const placeholderBad = /@ejemplo\.com|tucorreo@|tracker@ejemplo\.com/i;
  const exampleBad = /@example\.com/i; // EN → queremos @exemple.com en FR

  const englishHints = [
    "go to",
    "log in",
    "logout",
    "dashboard",
    "loading",
    "create",
    "delete",
    "save",
    "help",
    "privacy",
    "support",
    "view",
    "enter",
    "back to"
  ];

  for (const k of keys) {
    const enVal = getByPath(enObj, k);
    const frVal = getByPath(frObj, k);

    if (typeof frVal !== "string") continue;

    const val = frVal.trim();
    const enText = typeof enVal === "string" ? enVal.trim() : "";

    // ✅ detecta placeholders/dominios primero (aunque sean "same_as_en")
    if (placeholderBad.test(val)) {
      issues.push({ key: k, type: "placeholder_email", sample: val });
      continue;
    }
    if (exampleBad.test(val)) {
      issues.push({ key: k, type: "placeholder_email", sample: val });
      continue;
    }

    // ✅ same_as_en pero permitido
    if (enText && val === enText) {
      if (!isSameOk(enText, val)) {
        issues.push({ key: k, type: "same_as_en", sample: val });
      }
      continue;
    }

    const low = val.toLowerCase();
    const looksEnglish = englishHints.some((h) => low.includes(h));

    if (looksEnglish && !frenchChars.test(val)) {
      issues.push({ key: k, type: "looks_english", sample: val });
      continue;
    }

    if (spanishChars.test(val) && !frenchChars.test(val)) {
      issues.push({ key: k, type: "looks_spanish", sample: val });
      continue;
    }
  }

  return issues;
}

function main() {
  if (!fs.existsSync(EN_PATH) || !fs.existsSync(FR_PATH)) {
    console.error("❌ en.json o fr.json no existen.");
    process.exit(1);
  }

  console.log("🧩 i18n AUDIT EN ↔ FR");

  const en = readJson(EN_PATH);
  const fr = readJson(FR_PATH);

  const enKeys = flattenKeys(en);
  const frKeys = flattenKeys(fr);

  const d = diffKeys(enKeys, frKeys);

  console.log("\n[FR] Missing in FR (vs EN):", d.missing.length);
  console.log(d.missing.slice(0, 50).join("\n") || "(none)");

  console.log("\n[FR] Extra in FR (vs EN):", d.extra.length);
  console.log(d.extra.slice(0, 50).join("\n") || "(none)");

  const issues = scanIssues(en, fr);
  console.log("\nIssues candidates:", issues.length);

  writeJson(path.join(OUT_DIR, "fr.missing.from_en.json"), d.missing);
  writeJson(path.join(OUT_DIR, "fr.extra.from_en.json"), d.extra);
  writeJson(path.join(OUT_DIR, "fr.issues.vs_en.json"), issues);

  console.log("\n📌 Output:", path.relative(ROOT, OUT_DIR));
  console.log("✅ Done.\n");
}

main();
