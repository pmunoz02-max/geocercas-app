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

// --- BLOCK main/master branch and report changes ---
if (branch === "main" || branch === "master") {
  console.error("\x1b[31m[PRE-PUSH BLOCKED]\x1b[0m Pushes to main/master are not allowed. Please use a feature or release branch.");
  process.exit(1);
}

if (staged || unstaged) {
  if (staged) {
    console.error("\x1b[33m[PRE-PUSH WARNING]\x1b[0m Staged changes detected:\n" + staged);
  }
  if (unstaged) {
    console.error("\x1b[33m[PRE-PUSH WARNING]\x1b[0m Unstaged changes detected:\n" + unstaged);
  }
  process.exit(1);
}