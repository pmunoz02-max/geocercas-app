import { execSync } from "node:child_process";

const CRITICAL_PATTERNS = [
  /^supabase\/functions\//,
  /^supabase\/migrations\//,
  /^src\/services\/orgs\.ts$/,
  /^src\/lib\/membershipsService\.js$/,
  /^api\/.*invite.*\.(js|ts)$/,
];

const DOC_PATTERNS = [
  /^docs\//,
];

function getChangedFiles() {
  try {
    const out = execSync("git diff --cached --name-only", { encoding: "utf8" }).trim();
    return out ? out.split("\n").map((s) => s.trim()).filter(Boolean) : [];
  } catch (error) {
    console.error("Error al leer archivos staged con git diff --cached --name-only");
    console.error(String(error?.message || error));
    process.exit(1);
  }
}

const changed = getChangedFiles();
const touchedCritical = changed.some((f) => CRITICAL_PATTERNS.some((rx) => rx.test(f)));
const touchedDocs = changed.some((f) => DOC_PATTERNS.some((rx) => rx.test(f)));

if (touchedCritical && !touchedDocs) {
  const criticalChanged = changed.filter((f) => CRITICAL_PATTERNS.some((rx) => rx.test(f)));
  console.error("\nERROR: Cambiaste archivos criticos de backend/arquitectura sin actualizar docs.");
  console.error("Agrega al menos un archivo bajo docs/ antes de hacer commit.\n");
  console.error("Archivos criticos staged:");
  for (const f of criticalChanged) console.error(` - ${f}`);
  process.exit(1);
}

console.log("Docs sync check OK");