// `spike:run` (issue #69, exact change 5). Starts `wrangler dev` (local
// workerd) for the spike Worker, measures every candidate x bitrate x duration
// there, repeats the encode in Node for supporting numbers, probes each MP3
// file with ffprobe, and writes out/results.json and the files in out/.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pcmToWav } from "@storybook/models";
import { BITRATES, CANDIDATES, DURATIONS, RATE } from "../src/candidates";
import { speechLikePcm } from "../src/fixture";
import { summary } from "./stats";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = `${ROOT}out/`;
const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const WARMUP = 3;
const RUNS = 20;
const MEM_REPEATS = 3;

mkdirSync(OUT, { recursive: true });

function sh(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8" }).trim();
}

async function waitReady(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      await fetch(`${BASE}/`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("wrangler dev did not start in 60 s");
}

function nodeRun(args: string[]): unknown {
  const line = execFileSync(process.execPath, ["--expose-gc", "--import", "tsx", "scripts/node-measure.ts", ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return JSON.parse(line.trim().split("\n").pop()!);
}

function ffprobe(file: string): unknown {
  const raw = sh("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration,bit_rate,size:stream=codec_name,sample_rate,channels",
    "-of",
    "json",
    file,
  ]);
  return JSON.parse(raw);
}

// Control file for the WebKit smoke test: the 15 s fixture as WAV.
const control = speechLikePcm(15, RATE);
const controlWav = pcmToWav(new Uint8Array(control.buffer, control.byteOffset, control.byteLength), RATE, 1);
writeFileSync(`${OUT}control-15s.wav`, controlWav);

// One fresh local workerd per configuration (implementation decision): in one
// long dev session, later configurations ran up to 2.5x slower and one request
// ended in ECONNRESET. A fresh isolate per configuration is closer to a
// Workflow step and keeps candidates from affecting each other.
async function startDev(log: string): Promise<() => void> {
  const dev = spawn("pnpm", ["exec", "wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1"], {
    cwd: ROOT,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const lines: string[] = [];
  dev.stdout.on("data", (d) => lines.push(String(d)));
  dev.stderr.on("data", (d) => lines.push(String(d)));
  const exited = new Promise<void>((r) => dev.on("exit", () => r()));
  const stop = async () => {
    try {
      process.kill(-dev.pid!, "SIGTERM");
    } catch {
      // Already stopped.
    }
    await exited;
    writeFileSync(`${OUT}${log}`, lines.join(""));
  };
  await waitReady();
  return stop;
}

type Entry = Record<string, unknown>;
const entries: Entry[] = [];

for (const c of CANDIDATES) {
  const nodeCpu = c.notUsable ? undefined : (nodeRun([c.id, "cpu"]) as { results: Entry[] });
  for (const sec of DURATIONS) {
    for (const kbps of BITRATES) {
      const e: Entry = { enc: c.id, pkg: c.pkg, version: c.version, kbps, sec };
      entries.push(e);
      if (c.notUsable) {
        e.error = c.notUsable;
        continue;
      }
      const q = `enc=${encodeURIComponent(c.id)}&kbps=${kbps}&sec=${sec}`;
      const log = `dev-${c.id}-${kbps}k-${sec}s.log`;
      const stopDev = await startDev(log);
      try {
        const warm = await fetch(`${BASE}/encode?${q}&runs=${WARMUP}`);
        const warmBody = (await warm.json()) as Entry;
        if (warm.status !== 200) {
          e.status = warm.status;
          e.error = String(warmBody.error ?? "no error text").slice(0, 200);
          continue;
        }
        const res = await fetch(`${BASE}/encode?${q}&runs=${RUNS}`);
        const body = (await res.json()) as { runsMs: number[]; bytes: number; sha256: string; error?: string };
        if (res.status !== 200) {
          e.status = res.status;
          e.error = String(body.error ?? "no error text").slice(0, 200);
          continue;
        }
        const file = `${c.id}-${kbps}k-${sec}s.mp3`;
        const mp3 = await fetch(`${BASE}/mp3?${q}`);
        const bytes = new Uint8Array(await mp3.arrayBuffer());
        writeFileSync(`${OUT}${file}`, bytes);
        const s = summary(body.runsMs);
        e.status = 200;
        e.workerd = {
          runsMs: body.runsMs,
          ...s,
          msPerAudioSecond: s.p95 / sec,
          bytes: body.bytes,
          sha256: body.sha256,
        };
        e.file = file;
        e.fileBytes = bytes.length;
        e.ffprobe = ffprobe(`${OUT}${file}`);

        const n = nodeCpu!.results.find((r) => r.kbps === kbps && r.sec === sec)!;
        if (n.error) {
          e.node = { error: n.error };
        } else {
          const mems = Array.from(
            { length: MEM_REPEATS },
            () => nodeRun([c.id, "mem", String(kbps), String(sec)]) as Entry,
          );
          const cpuMs = n.cpuMs as number[];
          e.node = {
            cpuMs,
            ...summary(cpuMs),
            sha256: n.sha256,
            memRuns: mems,
            peakMemBytes: Math.max(...mems.map((m) => Number(m.peakMemBytes))),
            peakMemBytesNoDoubleCount: Math.max(...mems.map((m) => Number(m.peakMemBytesNoDoubleCount))),
          };
          e.sameBytes = n.sha256 === body.sha256;
        }
        console.log(`${c.id} ${kbps} kbps ${sec} s: workerd p95 ${s.p95} ms, ${body.bytes} B`);
      } catch (err) {
        // A network error is a harness failure, not a candidate result.
        e.error = `harness: ${String(err)} ${String((err as Error).cause ?? "")}`.slice(0, 200);
        e.devLog = log;
        console.log(`${c.id} ${kbps} kbps ${sec} s: ${e.error}`);
      } finally {
        await stopDev();
      }
    }
  }
  if (c.notUsable) console.log(`${c.id}: ${c.notUsable}`);
}

const results = {
  measuredAt: new Date().toISOString(),
  commit: sh("git", ["rev-parse", "HEAD"]),
  machine: { cpu: sh("sysctl", ["-n", "machdep.cpu.brand_string"]), os: `macOS ${sh("sw_vers", ["-productVersion"])}` },
  node: process.version,
  wrangler: sh("pnpm", ["exec", "wrangler", "--version"]).split("\n").pop(),
  ffprobe: sh("ffprobe", ["-version"]).split("\n")[0],
  method: { warmup: WARMUP, runs: RUNS, memRepeats: MEM_REPEATS, percentile: "nearest rank" },
  controlWav: { file: "control-15s.wav", bytes: controlWav.length },
  entries,
  webkit: readPrevious("webkit"),
};
writeFileSync(`${OUT}results.json`, `${JSON.stringify(results, null, 2)}\n`);
console.log(`wrote ${OUT}results.json (${entries.length} entries)`);
process.exit(0);

// Keep the WebKit result of an earlier `spike:smoke` run, if any.
function readPrevious(key: string): unknown {
  try {
    return JSON.parse(readFileSync(`${OUT}results.json`, "utf8"))[key] ?? null;
  } catch {
    return null;
  }
}
