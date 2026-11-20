import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { OUT } from "./files";

// Merge the per-profile records into results.json under `webkit`.
export default function teardown() {
  const file = `${OUT}results.json`;
  const results = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  const webkit: unknown[] = [];
  for (const f of readdirSync(OUT).filter((n) => n.startsWith("smoke-") && n.endsWith(".json"))) {
    webkit.push(JSON.parse(readFileSync(`${OUT}${f}`, "utf8")));
  }
  results.webkit = { measuredAt: new Date().toISOString(), records: webkit };
  writeFileSync(file, `${JSON.stringify(results, null, 2)}\n`);
}
