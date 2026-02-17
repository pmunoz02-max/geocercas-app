// scripts/i18n-full-fr-translate.mjs
// ES (base) -> FR (target) full translator + fixer (DeepL)
// Batch + retry-on-429 to avoid rate limits.
//
// Env:
// - DEEPL_API_KEY (required)
// - DEEPL_API_URL (optional, default api-free)
// - LOCALES_DIR or ES_PATH/FR_PATH
// - REMOVE_EXTRA=1 (optional)
// - DRY_RUN=1 (optional)
// - I18N_CONCURRENCY (kept for compatibility; batch mode uses 1 request per batch)
// - I18N_BATCH_SIZE (default 20)
// - I18N_RETRY_MAX (default 6)
// - I18N_RETRY_BASE_MS (default 1200)
// - I18N_RETRY_JITTER_MS (default 500)

import fs from "node:fs";
import path from "node:path";
import https from "node:https";

const ROOT = process.cwd();

const DRY_RUN = String(process.env.DRY_RUN || "").trim() === "1";
const REMOVE_EXTRA = String(process.env.REMOVE_EXTRA || "").trim() === "1";

const DEEPL_API_KEY = String(process.env.DEEPL_API_KEY || "").trim();
const DEEPL_API_URL = String(process.env.DEEPL_API_URL || "https://api-free.deepl.com/v2/translate").trim();

const OVERRIDE_ES_PATH = String(process.env.ES_PATH || "").trim();
const OVERRIDE_FR_PATH = String(process.env.FR_PATH || "").trim();
const OVERRIDE_LOCALES_DIR = String(process.env.LOCALES_DIR || "").trim();

const BATCH_SIZE = Math.max(1, Number(process.env.I18N_BATCH_SIZE || 20));
const RETRY_MAX = Math.max(0, Number(process.env.I18N_RETRY_MAX || 6));
const RETRY_BASE_MS = Math.max(100, Number(process.env.I18N_RETRY_BASE_MS || 1200));
const RETRY_JITTER_MS = Math.max(0, Number(process.env.I18N_RETRY_JITTER_MS || 500));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function safeReadDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function findFilesRecursive(startDir, maxDepth = 8) {
  const out = [];
  function walk(dir, depth) {
    if (depth > maxDepth) return;
    for (const ent of safeReadDir(dir)) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full, depth + 1);
      else if (ent.isFile()) out.push(full);
    }
  }
  walk(startDir, 0);
  return out;
}

function normalizeSlashes(p) {
  return p.replaceAll("\\", "/");
}

function detectLocaleFiles() {
  if (OVERRIDE_ES_PATH && OVERRIDE_FR_PATH) {
    const esAbs = path.isAbsolute(OVERRIDE_ES_PATH) ? OVERRIDE_ES_PATH : path.join(ROOT, OVERRIDE_ES_PATH);
    const frAbs = path.isAbsolute(OVERRIDE_FR_PATH) ? OVERRIDE_FR_PATH : path.join(ROOT, OVERRIDE_FR_PATH);
    return { esPath: esAbs, frPath: frAbs, mode: "override:ES_PATH/FR_PATH" };
  }

  if (OVERRIDE_LOCALES_DIR) {
    const dirAbs = path.isAbsolute(OVERRIDE_LOCALES_DIR) ? OVERRIDE_LOCALES_DIR : path.join(ROOT, OVERRIDE_LOCALES_DIR);
    const esAbs = path.join(dirAbs, "es.json");
    const frAbs = path.join(dirAbs, "fr.json");
    return { esPath: esAbs, frPath: frAbs, mode: "override:LOCALES_DIR" };
  }

  const roots = [path.join(ROOT, "src"), path.join(ROOT, "public"), ROOT].filter(exists);

  const allFiles = [];
  for (const r of roots) allFiles.push(...findFilesRecursive(r, 9));

  const jsons = allFiles.filter((f) => f.toLowerCase().endsWith(".json"));

  const esCandidates = jsons.filter((f) => {
    const p = normalizeSlashes(f).toLowerCase();
    return p.endsWith("/es.json") || p.endsWith("/locales/es/translation.json");
  });

  const frCandidates = jsons.filter((f) => {
    const p = normalizeSlashes(f).toLowerCase();
    return p.endsWith("/fr.json") || p.endsWith("/locales/fr/translation.json");
  });

  if (!esCandidates.length || !frCandidates.length) {
    return { esPath: null, frPath: null, mode: "auto:failed", details: { esCandidates, frCandidates } };
  }

  const scoreFile = (f) => {
    const p = normalizeSlashes(f).toLowerCase();
    let s = 0;
    if (p.includes("/src/")) s += 10;
    if (p.includes("/i18n/")) s += 10;
    if (p.includes("/locales/")) s += 10;
    if (p.endsWith("/es.json") || p.endsWith("/fr.json")) s += 20;
    if (p.endsWith("/translation.json")) s += 5;
    return s;
  };

  let best = null;
  let bestScore = -1;

  for (const esPath of esCandidates) {
    const esDir = path.dirname(esPath);
    for (const frPath of frCandidates) {
      const frDir = path.dirname(frPath);
      let s = scoreFile(esPath) + scoreFile(frPath);

      if (esDir === frDir) s += 100;

      const esp = normalizeSlashes(esPath).toLowerCase();
      const frp = normalizeSlashes(frPath).toLowerCase();
      if (esp.endsWith("/locales/es/translation.json") && frp.endsWith("/locales/fr/translation.json")) s += 60;

      if (s > bestScore) {
        bestScore = s;
        best = { esPath, frPath };
      }
    }
  }

  return { ...best, mode: "auto:ok", details: { esCandidates, frCandidates } };
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function writeJson(filePath, obj) {
  const txt = JSON.stringify(obj, null, 2) + "\n";
  fs.writeFileSync(filePath, txt, "utf8");
}

function isObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

// --- English detection (short strings too) ---
const EN_HINT_WORDS = [
  "the","and","or","your","you","with","without","password","reset","sign","signin","sign-in","log","login","log-in",
  "dashboard","cost","costs","people","person","activity","activities","geofence","geofences","organization",
  "start","end","from","to","filter","filters","apply","clear","export","download","loading",
  "error","success","new","edit","save","delete","cancel","continue","invite","invitation","support",
  "help","faq","guide","quick","panel","live","system","online","offline",
  "team","staff","send","link","magic","enter","home"
];

const EN_HINT_PHRASES = [
  "log in","login","sign in","send magic link","magic link","back to","control your team","go to","reset password"
];

function tokenizeWords(s) {
  return (String(s).toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || []);
}

function looksEnglish(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (!t) return false;

  const lower = t.toLowerCase();

  // quick FR cues -> not English
  if (/\b(le|la|les|des|une|un|du|au|aux|et|ou|votre|vos|mot de passe|réinitialiser|connexion)\b/i.test(lower)) {
    return false;
  }

  for (const p of EN_HINT_PHRASES) {
    if (lower.includes(p)) return true;
  }

  if (/\b(don't|doesn't|can't|won't|it's|you're|we're|they're|i'm)\b/i.test(t)) return true;

  const words = tokenizeWords(t);
  if (!words.length) return false;

  let hits = 0;
  const set = new Set(words.map((w) => w.replace(/-/g, "")));

  for (const w of EN_HINT_WORDS) {
    const ww = w.toLowerCase().replace(/[^a-z-]/g, "");
    if (!ww) continue;
    const ww2 = ww.replace(/-/g, "");
    if (set.has(ww2) || lower.includes(` ${ww} `) || lower.startsWith(`${ww} `) || lower.endsWith(` ${ww}`)) hits++;
    if (hits >= 2) return true;
  }

  const asciiLetters = (t.match(/[A-Za-z]/g) || []).length;
  const accents = (t.match(/[À-ÿ]/g) || []).length;
  const hasOnlyBasic = /^[A-Za-z0-9\s.,'"\-–—:;!?()]+$/.test(t);

  if (t.length <= 28 && hits >= 1 && asciiLetters >= 3 && accents === 0 && hasOnlyBasic) return true;

  if (asciiLetters >= 18 && accents === 0) {
    if (/\b(the|and|with|your|you|from|to|for|in|on)\b/i.test(t)) return true;
  }

  return false;
}

function sameAsBase(frVal, esVal) {
  if (typeof frVal !== "string" || typeof esVal !== "string") return false;
  const a = frVal.trim();
  const b = esVal.trim();
  if (!a || !b) return false;
  return a === b;
}

// --- traversal (build markers) ---
const pending = [];

function translateOrFallback(esText, keyPath, reason) {
  const marker = `__PENDING_TRANSLATION__${Math.random().toString(16).slice(2)}`;
  pending.push({ marker, esText, keyPath, reason });
  return marker;
}

function walk(esNode, frNode, keyPath = []) {
  const stats = {
    visited: 0,
    filledMissing: 0,
    kept: 0,
    skippedNonString: 0,
    englishFixed: 0,
    sameAsBaseFixed: 0
  };

  function add(other) {
    stats.visited += other.visited;
    stats.filledMissing += other.filledMissing;
    stats.kept += other.kept;
    stats.skippedNonString += other.skippedNonString;
    stats.englishFixed += other.englishFixed;
    stats.sameAsBaseFixed += other.sameAsBaseFixed;
  }

  if (Array.isArray(esNode)) {
    const frArr = Array.isArray(frNode) ? frNode : [];
    const out = [];
    for (let i = 0; i < esNode.length; i++) {
      const [child, childStats] = walk(esNode[i], frArr[i], keyPath.concat(String(i)));
      out[i] = child;
      add(childStats);
    }
    return [out, stats];
  }

  if (isObject(esNode)) {
    const frObj = isObject(frNode) ? frNode : {};
    const out = { ...frObj };
    for (const k of Object.keys(esNode)) {
      const [child, childStats] = walk(esNode[k], frObj[k], keyPath.concat(k));
      out[k] = child;
      add(childStats);
    }
    return [out, stats];
  }

  stats.visited += 1;

  if (typeof esNode === "string") {
    const esText = esNode;
    const frText = typeof frNode === "string" ? frNode : undefined;

    const missing = frText === undefined || frText === null || String(frText).trim() === "";
    const english = typeof frText === "string" ? looksEnglish(frText) : false;
    const sameBase = typeof frText === "string" ? sameAsBase(frText, esText) : false;

    if (missing) {
      stats.filledMissing += 1;
      return [translateOrFallback(esText, keyPath.join("."), "missing"), stats];
    }

    if (english) {
      stats.englishFixed += 1;
      return [translateOrFallback(esText, keyPath.join("."), "looks_english"), stats];
    }

    if (sameBase) {
      stats.sameAsBaseFixed += 1;
      return [translateOrFallback(esText, keyPath.join("."), "same_as_base"), stats];
    }

    stats.kept += 1;
    return [frText, stats];
  }

  if (frNode === undefined) return [clone(esNode), stats];
  stats.skippedNonString += 1;
  return [clone(frNode), stats];
}

function replaceMarkers(node, map) {
  if (typeof node === "string") return map.has(node) ? map.get(node) : node;
  if (Array.isArray(node)) return node.map((x) => replaceMarkers(x, map));
  if (isObject(node)) {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = replaceMarkers(v, map);
    return out;
  }
  return node;
}

function pruneExtras(frObj, esObj) {
  if (Array.isArray(frObj) || Array.isArray(esObj)) return frObj;
  if (!isObject(frObj) || !isObject(esObj)) return frObj;

  const out = {};
  for (const k of Object.keys(esObj)) {
    if (Object.prototype.hasOwnProperty.call(frObj, k)) {
      out[k] = pruneExtras(frObj[k], esObj[k]);
    }
  }
  return out;
}

// --- placeholders protection ---
function protectPlaceholders(s) {
  const placeholders = [];
  const protectedText = s.replace(/{{\s*[^}]+\s*}}/g, (m) => {
    const token = `__PH_${placeholders.length}__`;
    placeholders.push({ token, value: m });
    return token;
  });
  return { protectedText, placeholders };
}

function restorePlaceholders(s, placeholders) {
  let out = s;
  for (const p of placeholders) out = out.replaceAll(p.token, p.value);
  return out;
}

// --- DeepL batch translate with retry on 429 ---
async function deeplTranslateBatch(texts) {
  if (!DEEPL_API_KEY) throw new Error("DEEPL_API_KEY not set");

  // Protect placeholders per item
  const protectedItems = texts.map((txt) => protectPlaceholders(txt));
  const protectedTexts = protectedItems.map((x) => x.protectedText);

  const doRequest = () =>
    new Promise((resolve, reject) => {
      const data = new URLSearchParams();
      for (const t of protectedTexts) data.append("text", t);
      data.set("source_lang", "ES");
      data.set("target_lang", "FR");
      data.set("preserve_formatting", "1");

      const url = new URL(DEEPL_API_URL);
      const req = https.request(
        {
          method: "POST",
          hostname: url.hostname,
          path: url.pathname + (url.search || ""),
          headers: {
            "Authorization": `DeepL-Auth-Key ${DEEPL_API_KEY}`,
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(data.toString())
          }
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            const code = res.statusCode || 0;
            if (code >= 200 && code < 300) {
              try {
                const json = JSON.parse(body);
                const arr = json?.translations || [];
                resolve({ ok: true, translations: arr.map((x) => x?.text || ""), code });
              } catch (e) {
                reject(new Error(`DeepL JSON parse error: ${String(e)}`));
              }
            } else {
              const err = new Error(`DeepL HTTP ${code}: ${body}`);
              err.statusCode = code;
              reject(err);
            }
          });
        }
      );

      req.on("error", reject);
      req.write(data.toString());
      req.end();
    });

  let attempt = 0;
  while (true) {
    try {
      const r = await doRequest();
      // restore placeholders
      const restored = r.translations.map((tr, i) =>
        restorePlaceholders(String(tr).replace(/\r\n/g, "\n"), protectedItems[i].placeholders)
      );
      return restored;
    } catch (e) {
      const code = Number(e?.statusCode || 0);
      if (code === 429 && attempt < RETRY_MAX) {
        const wait = RETRY_BASE_MS * Math.pow(2, attempt) + Math.floor(Math.random() * RETRY_JITTER_MS);
        console.warn(`⏳ DeepL 429: retry ${attempt + 1}/${RETRY_MAX} in ${wait}ms (batch size=${texts.length})`);
        await sleep(wait);
        attempt++;
        continue;
      }
      throw e;
    }
  }
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const detected = detectLocaleFiles();

  if (!detected.esPath || !detected.frPath) {
    console.error("❌ Could not auto-detect ES/FR locale files.");
    if (detected.details) {
      console.error("— ES candidates:", detected.details.esCandidates);
      console.error("— FR candidates:", detected.details.frCandidates);
    }
    console.error("✅ Fix: set LOCALES_DIR or ES_PATH/FR_PATH env vars.");
    console.error('   Example (PowerShell): $env:LOCALES_DIR="src/i18n"');
    process.exit(1);
  }

  const ES_PATH = detected.esPath;
  const FR_PATH = detected.frPath;

  if (!exists(ES_PATH)) {
    console.error(`❌ Missing: ${ES_PATH}`);
    process.exit(1);
  }
  if (!exists(FR_PATH)) {
    console.error(`❌ Missing: ${FR_PATH}`);
    process.exit(1);
  }

  console.log("📍 Locales resolved:", detected.mode);
  console.log("— ES:", ES_PATH);
  console.log("— FR:", FR_PATH);

  const es = readJson(ES_PATH);
  const fr = readJson(FR_PATH);

  const [frDraft, stats] = walk(es, fr);

  const markerMap = new Map();
  let ok = 0;
  let fail = 0;

  if (pending.length) {
    if (!DEEPL_API_KEY) {
      console.error("❌ DEEPL_API_KEY is not set. Cannot auto-translate.");
      process.exit(1);
    }

    console.log(`🧠 Pending translations: ${pending.length} (provider: DeepL, batch=${BATCH_SIZE})`);

    const batches = chunk(pending, BATCH_SIZE);

    for (let bi = 0; bi < batches.length; bi++) {
      const b = batches[bi];
      const texts = b.map((p) => p.esText);

      try {
        const trs = await deeplTranslateBatch(texts);
        for (let i = 0; i < b.length; i++) {
          markerMap.set(b[i].marker, trs[i] || b[i].esText);
          ok++;
        }
        console.log(`✅ Batch ${bi + 1}/${batches.length} ok (${b.length})`);
      } catch (e) {
        // If a batch fails (non-429 or exhausted retries), fallback each item to ES
        console.error(`⚠️ Batch ${bi + 1}/${batches.length} failed: ${String(e?.message || e)}`);
        for (const p of b) {
          markerMap.set(p.marker, p.esText);
          fail++;
        }
      }
    }
  }

  let frOut = replaceMarkers(frDraft, markerMap);
  if (REMOVE_EXTRA) frOut = pruneExtras(frOut, es);

  if (!DRY_RUN) writeJson(FR_PATH, frOut);

  console.log("✅ i18n FR translate done.");
  console.log("— Stats:", stats);
  console.log("— Translations:", { ok, fail });
  console.log(DRY_RUN ? "🟡 DRY_RUN=1: no files written." : "🟢 FR written.");
  console.log(REMOVE_EXTRA ? "🧹 REMOVE_EXTRA=1: extras removed in FR." : "ℹ️ Extras not removed.");
}

main().catch((e) => {
  console.error("❌ Fatal:", e);
  process.exit(1);
});
