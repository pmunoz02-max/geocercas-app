import { execSync } from "node:child_process";

function run(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

const branch = run("git branch --show-current");
const staged = run("git diff --cached --name-only || true");
const unstaged = run("git diff --name-only || true");

if (branch !== "preview") {
  console.error(`ERROR: Estás en branch "${branch}". Usa preview.`);
  process.exit(1);
}

if (!staged && !unstaged) {
  console.log("OK: No hay cambios pendientes. No hagas commit.");
  process.exit(0);
}

console.log("Branch OK:", branch);

if (staged) {
  console.log("\nArchivos staged:\n" + staged);
}

if (unstaged) {
  console.log("\nArchivos no staged:\n" + unstaged);
}

console.log("\nOK: Hay cambios reales para revisar antes de commit.");