import * as schema from "./schema";

export { schema };

/**
 * Runtime persistence for the VPS build lives in `lib/training-db.ts`
 * (Node built-in SQLite). Keep this module for Drizzle schema imports only.
 */
export function getDb(): never {
  throw new Error(
    "VPS runtime uses lib/training-db.ts (node:sqlite). Do not call getDb() in this build.",
  );
}
