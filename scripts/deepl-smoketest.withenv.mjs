// scripts/deepl-smoketest.withenv.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const envLocal = path.join(ROOT, ".env.local");
const env = path.join(ROOT, ".env");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);

    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(envLocal);
loadEnvFile(env);

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const DEEPL_API_URL = process.env.DEEPL_API_URL || "https://api-free.deepl.com/v2/translate";

if (!DEEPL_API_KEY) {
  console.error("❌ Falta DEEPL_API_KEY (revisa .env.local).");
  process.exit(1);
}

// Mostrar un “fingerprint” seguro (no imprime el key completo)
const keyTrim = String(DEEPL_API_KEY).trim();
console.log("== DeepL SmokeTest ==");
console.log("DEEPL_API_URL:", DEEPL_API_URL);
console.log("DEEPL_API_KEY length:", keyTrim.length);
console.log("DEEPL_API_KEY prefix:", keyTrim.slice(0, 6) + "..." + keyTrim.slice(-3));

async function main() {
  const body = new URLSearchParams();
  body.set("source_lang", "EN");
  body.set("target_lang", "FR");
  body.append("text", "Hello! This is a test.");

  const res = await fetch(DEEPL_API_URL, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${keyTrim}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const txt = await res.text();
  console.log("HTTP:", res.status, res.statusText);
  console.log("Body:", txt);

  if (!res.ok) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Exception:", e);
  process.exit(1);
});
