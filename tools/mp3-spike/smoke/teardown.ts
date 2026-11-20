import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { OUT } from "./files";

type SmokeRecord = {
  profile: string;
  enc: string;
  pass: boolean | string;
  checks: Record<string, { pass: boolean }>;
};

// Merge the per-test records into results.json under `webkit`.
// Control rule (exact change 7): if the WAV control fails a check on a
// profile, every candidate record of that profile becomes
// "not measured: harness (<check>)". A harness failure is not a candidate failure.
export default function teardown() {
  const file = `${OUT}results.json`;
  const results = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  const records: SmokeRecord[] = readdirSync(OUT)
    .filter((n) => n.startsWith("smoke-") && n.endsWith(".json"))
    .map((n) => JSON.parse(readFileSync(`${OUT}${n}`, "utf8")) as SmokeRecord);
  for (const control of records.filter((r) => r.enc === "control" && r.pass !== true)) {
    const failed = Object.entries(control.checks)
      .filter(([, c]) => !c.pass)
      .map(([k]) => k)
      .join(", ");
    for (const r of records) {
      if (r.profile === control.profile && r.enc !== "control") r.pass = `not measured: harness (${failed})`;
    }
  }
  results.webkit = { measuredAt: new Date().toISOString(), records };
  writeFileSync(file, `${JSON.stringify(results, null, 2)}\n`);
}
