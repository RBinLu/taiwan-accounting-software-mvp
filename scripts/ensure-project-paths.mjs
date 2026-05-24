import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const packageJson = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8")
);

if (packageJson.name !== "taiwan-accounting-ocr-platform") {
  throw new Error(`Run this script from the project root. Current cwd: ${root}`);
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
