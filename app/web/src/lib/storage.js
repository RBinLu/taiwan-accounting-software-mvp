import fs from "node:fs/promises";
import { assertInsideWorkspace, exportsDir, uploadsDir } from "./project-paths";

export async function ensureStorageDirs() {
  assertInsideWorkspace(uploadsDir, "uploadsDir");
  assertInsideWorkspace(exportsDir, "exportsDir");
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.mkdir(exportsDir, { recursive: true });
}
