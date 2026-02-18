// scripts/i18n-full-fr-translate.withenv.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const envLocal = path.join(projectRoot, ".env.local");
const env = path.join(projectRoot, ".env");

// Loader mínimo tipo dotenv (sin dependencia externa)
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

    // quitar comillas
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);

    // no sobreescribir si ya viene del shell/CI
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(envLocal);
loadEnvFile(env);

// defaults defensivos
if (!process.env.DEEPL_API_URL) {
  process.env.DEEPL_API_URL = "https://api-free.deepl.com/v2/translate";
}

// Ejecuta el script real
await import("./i18n-full-fr-translate.mjs");
