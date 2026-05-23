import { PrismaClient } from "@prisma/client";
import { assertDatabaseIsolation } from "./project-paths";

assertDatabaseIsolation();

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.accountingPrisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.accountingPrisma = prisma;
}
