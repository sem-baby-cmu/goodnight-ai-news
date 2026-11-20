import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const OUT = fileURLToPath(new URL("../out/", import.meta.url));

export type SmokeFile = { name: string; type: "audio/mpeg" | "audio/wav"; enc: string; kbps?: number };

// The WAV control first, then the 15 s files of each candidate that passed
// T1 (an entry with status 200 in results.json).
export function smokeFiles(): SmokeFile[] {
  const results = JSON.parse(readFileSync(`${OUT}results.json`, "utf8")) as {
    entries: { enc: string; kbps: number; sec: number; status?: number; file?: string }[];
  };
  const files: SmokeFile[] = [{ name: "control-15s.wav", type: "audio/wav", enc: "control" }];
  for (const e of results.entries) {
    if (e.sec === 15 && e.status === 200 && e.file) files.push({ name: e.file, type: "audio/mpeg", enc: e.enc, kbps: e.kbps });
  }
  return files;
}
