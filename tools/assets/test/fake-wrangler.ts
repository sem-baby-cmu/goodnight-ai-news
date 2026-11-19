// A stand-in for `runWrangler`: D1 is an in-memory SQLite database with the
// #16 migrations applied, R2 is a map. Tests never start the real wrangler.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { REPO_ROOT } from "../src/paths";

const MIGRATIONS = join(REPO_ROOT, "apps/storybook/migrations");

export function migratedDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  return db;
}

export type FakeOptions = {
  db?: DatabaseSync;
  // Throw for this call (after it is recorded).
  failOn?: (args: string[], index: number) => boolean;
  // Accept the `d1 execute --file` call but do not run the file.
  ignoreFile?: boolean;
};

export function fakeWrangler(opts: FakeOptions = {}) {
  const db = opts.db ?? migratedDb();
  const calls: string[][] = [];
  const objects = new Map<string, Buffer>();
  const runWrangler = async (args: string[]): Promise<string> => {
    calls.push(args);
    if (opts.failOn?.(args, calls.length - 1)) throw new Error(`wrangler ${args.slice(0, 3).join(" ")} failed`);
    if (args[0] === "r2" && args[1] === "object" && args[2] === "put") {
      objects.set(args[3]!, readFileSync(args[args.indexOf("--file") + 1]!));
      return "";
    }
    if (args[0] === "d1" && args[1] === "execute") {
      const file = args.indexOf("--file");
      if (file >= 0) {
        if (!opts.ignoreFile) db.exec(readFileSync(args[file + 1]!, "utf8"));
        return "[]";
      }
      const sql = args[args.indexOf("--command") + 1]!;
      return JSON.stringify([{ results: db.prepare(sql).all(), success: true, meta: {} }]);
    }
    throw new Error(`unexpected wrangler call: ${args.join(" ")}`);
  };
  return { db, calls, objects, runWrangler };
}

export const isPut = (args: string[]) => args[0] === "r2" && args[2] === "put";
export const isFile = (args: string[]) => args[0] === "d1" && args.includes("--file");
