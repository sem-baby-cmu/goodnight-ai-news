import { readdirSync, rmSync } from "node:fs";
import { OUT } from "./files";

// Remove the records of an earlier run.
export default function setup() {
  for (const f of readdirSync(OUT).filter((n) => n.startsWith("smoke-") && n.endsWith(".json"))) rmSync(`${OUT}${f}`);
}
