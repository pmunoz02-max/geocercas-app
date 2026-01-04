import fs from "fs";
import path from "path";

const projectRoot = process.cwd();
const srcDir = path.join(projectRoot, "src");

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && /\.(jsx|tsx|js|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

function getImports(code) {
  const imports = [];
  const re = /import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["'];?/g;
  let m;
  while ((m = re.exec(code))) imports.push(m[1]);
  return imports;
}

function listDirNames(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return null;
  }
}

function resolveWithExactCase(fromFile, spec) {
  if (!spec.startsWith(".")) return { ok: true, note: "external" };

  const fromDir = path.dirname(fromFile);
  const rawTarget = path.resolve(fromDir, spec);

  const candidates = [
    rawTarget,
    rawTarget + ".js",
    rawTarget + ".jsx",
    rawTarget + ".ts",
    rawTarget + ".tsx",
    path.join(rawTarget, "index.js"),
    path.join(rawTarget, "index.jsx"),
    path.join(rawTarget, "index.ts"),
    path.join(rawTarget, "index.tsx"),
  ];

  const existing = candidates.find((c) => fs.existsSync(c));
  if (!existing) return { ok: false, reason: "NOT_FOUND", existing: null };

  const rel = path.relative(projectRoot, existing);
  const parts = rel.split(path.sep);

  let cur = projectRoot;
  for (const part of parts) {
    const names = listDirNames(cur);
    if (!names) return { ok: false, reason: "CANNOT_READ_DIR", at: cur };
    const exact = names.find((n) => n === part);
    if (!exact) {
      const similar = names.find((n) => n.toLowerCase() === part.toLowerCase());
      return {
        ok: false,
        reason: "CASE_MISMATCH",
        expected: part,
        found: similar || "(none)",
        at: cur,
        resolved: existing,
      };
    }
    cur = path.join(cur, exact);
  }

  return { ok: true, resolved: existing };
}

const files = walk(srcDir);
const problems = [];

for (const f of files) {
  const code = fs.readFileSync(f, "utf-8");
  const specs = getImports(code);
  for (const spec of specs) {
    const r = resolveWithExactCase(f, spec);
    if (!r.ok) {
      problems.push({ file: path.relative(projectRoot, f), spec, ...r });
    }
  }
}

if (!problems.length) {
  console.log("✅ OK: No hay imports con case mismatch ni faltantes.");
  process.exit(0);
}

console.log("❌ Problemas detectados:\n");
for (const p of problems) {
  console.log(`- ${p.file}`);
  console.log(`  import: ${p.spec}`);
  console.log(`  reason: ${p.reason}`);
  if (p.reason === "CASE_MISMATCH") {
    console.log(`  expected: ${p.expected}`);
    console.log(`  found:    ${p.found}`);
    console.log(`  at:       ${p.at}`);
    console.log(`  resolved: ${p.resolved}`);
  }
  console.log("");
}

process.exit(1);
