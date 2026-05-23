export const workspaceRoot =
  process.env.ACCOUNTING_WORKSPACE_ROOT ||
  "/Users/rbin/Documents/Codex/會計軟體";

export const uploadsDir = `${workspaceRoot}/storage/uploads`;
export const exportsDir = `${workspaceRoot}/storage/exports`;

export function assertInsideWorkspace(targetPath, label = "path") {
  const resolved = String(targetPath);
  const root = String(workspaceRoot);

  if (resolved !== root && !resolved.startsWith(`${root}/`)) {
    throw new Error(`${label} must stay inside the project folder: ${resolved}`);
  }

  return resolved;
}

export function assertDatabaseIsolation() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing.");
  }

  const isProjectPort =
    databaseUrl.includes("127.0.0.1:55432") ||
    databaseUrl.includes("localhost:55432");

  if (process.env.NODE_ENV !== "production" && !isProjectPort) {
    throw new Error(
      "Development DATABASE_URL must use 127.0.0.1:55432 or localhost:55432."
    );
  }
}

export function safeUploadName(originalName, hash) {
  const extension = String(originalName || "").match(/(\.[a-zA-Z0-9]{1,12})$/)?.[1]?.toLowerCase() || "";
  const cleanedExtension = extension.match(/^\.[a-z0-9]{1,12}$/) ? extension : "";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${hash.slice(0, 16)}${cleanedExtension}`;
}
