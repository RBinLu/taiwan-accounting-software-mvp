import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const textExtensions = new Set([
  ".css",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".prisma",
  ".sh",
  ".sql",
  ".toml",
  ".yml",
  ".yaml"
]);
const ignoredDirectories = new Set([
  ".cache",
  ".data",
  ".git",
  ".next",
  "node_modules",
  "storage/backups",
  "storage/exports",
  "storage/ocr",
  "storage/ocr-dev",
  "storage/security",
  "storage/tailscale",
  "storage/uploads"
]);

function relative(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function isIgnoredDirectory(dirPath) {
  const rel = relative(dirPath);
  return ignoredDirectories.has(rel) || ignoredDirectories.has(path.basename(dirPath));
}

async function collectFiles(dirPath, files = []) {
  for (const entry of await fs.readdir(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (!isIgnoredDirectory(fullPath)) {
        await collectFiles(fullPath, files);
      }
      continue;
    }

    if (entry.isFile() && textExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function pushIssue(issues, filePath, lineNumber, message) {
  issues.push(`${relative(filePath)}:${lineNumber}: ${message}`);
}

async function lintTextFiles(issues) {
  const files = await collectFiles(root);
  for (const filePath of files) {
    const text = await fs.readFile(filePath, "utf8");
    const lines = text.split("\n");

    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      if (/[ \t]$/.test(line)) {
        pushIssue(issues, filePath, lineNumber, "trailing whitespace");
      }
      if (/^(<<<<<<<|=======|>>>>>>>)/.test(line)) {
        pushIssue(issues, filePath, lineNumber, "git conflict marker");
      }
      if (/\b(?:describe|it|test)\.only\(/.test(line)) {
        pushIssue(issues, filePath, lineNumber, "focused test committed");
      }
      if (
        relative(filePath).startsWith("app/web/src/") &&
        /\bconsole\.log\(/.test(line)
      ) {
        pushIssue(issues, filePath, lineNumber, "console.log in app source");
      }
    });
  }
}

async function lintPackageScripts(issues) {
  const rootPackagePath = path.join(root, "package.json");
  const webPackagePath = path.join(root, "app", "web", "package.json");
  const rootPackage = await readJson(rootPackagePath);
  const webPackage = await readJson(webPackagePath);

  for (const scriptName of ["lint", "test", "verify"]) {
    if (!rootPackage.scripts?.[scriptName]) {
      pushIssue(issues, rootPackagePath, 1, `missing root ${scriptName} script`);
    }
  }

  for (const scriptName of ["lint", "test"]) {
    if (!webPackage.scripts?.[scriptName]) {
      pushIssue(issues, webPackagePath, 1, `missing web ${scriptName} script`);
    }
  }
}

const issues = [];
await lintTextFiles(issues);
await lintPackageScripts(issues);

if (issues.length) {
  console.error(`Project lint failed with ${issues.length} issue(s):`);
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("Project lint passed.");
