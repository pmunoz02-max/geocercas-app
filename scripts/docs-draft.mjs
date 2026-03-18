import { execSync } from "node:child_process";
import fs from "node:fs";

const diff = execSync("git diff --cached --name-only", { encoding: "utf8" }).trim();
const files = diff ? diff.split("\n").filter(Boolean) : [];

const relevant = files.filter((f) =>
  /^(supabase\/functions\/|supabase\/migrations\/|src\/services\/orgs\.ts|api\/)/.test(f)
);

const lines = [
  "# Docs draft",
  "",
  "Archivos técnicos cambiados:",
  ...relevant.map((f) => `- ${f}`),
  "",
  "Revisar impacto en:",
  "- docs/ARCHITECTURE_MEMBERSHIPS.md",
  "- docs/FLUJOS_CLAVE.md",
  "- docs/ORGANIZATION_DATA_ISOLATION.md",
  "- docs/RLS_POLICIES.md",
  "",
];

fs.writeFileSync("docs/_AUTO_DRAFT_PENDING.md", lines.join("\n"));
console.log("✅ Generado docs/_AUTO_DRAFT_PENDING.md");