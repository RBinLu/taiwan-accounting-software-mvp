import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const expectedRoot = "/Users/rbin/Documents/Codex/會計軟體";

if (path.resolve(root) !== expectedRoot) {
  throw new Error(`Run this script from ${expectedRoot}. Current cwd: ${root}`);
}

const dirs = [
  ".data/postgres",
  ".data/postgres-run",
  ".data/logs",
  ".cache/npm",
  "storage/uploads",
  "storage/exports"
];

for (const dir of dirs) {
  await fs.mkdir(path.join(root, dir), { recursive: true });
}

console.log("Project-local directories are ready.");
