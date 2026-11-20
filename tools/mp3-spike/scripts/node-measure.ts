// Supporting numbers in Node (issue #69, exact change 5): CPU time from
// `process.cpuUsage()` deltas and peak memory from `process.memoryUsage()`.
// Two modes, each prints one JSON line. Run with `--expose-gc`:
//   node --expose-gc --import tsx scripts/node-measure.ts <enc> cpu
//   node --expose-gc --import tsx scripts/node-measure.ts <enc> mem <kbps> <sec>
// `mem` runs in a fresh process for each configuration and measures the first
// encode, as in a cold Workflow step. In one process, the memory of an earlier
// Wasm instance is not always freed by `gc()`, which corrupts the baseline.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { BITRATES, DURATIONS, RATE } from "../src/candidates";
import { encodeBreezy } from "../src/enc/breezy";
import type { Encode } from "../src/enc/common";
import { encodeLamejs } from "../src/enc/lamejs";
import { makeWme } from "../src/enc/wme";
import { speechLikePcm } from "../src/fixture";

const WARMUP = 3;
const RUNS = 20;

const require = createRequire(import.meta.url);
// Node compiles the Wasm from the file bytes. The export `./wasm/mp3` works;
// the export `./wasm/mp3.wasm` points to a file that does not exist.
const wasmPath = require.resolve("wasm-media-encoders/wasm/mp3");

const ENCODERS: Record<string, Encode> = {
  "breezy-lamejs": encodeBreezy,
  lamejs: encodeLamejs,
  "wasm-media-encoders": makeWme(() => new Uint8Array(readFileSync(wasmPath))),
};

const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) throw new Error("run with --expose-gc");

type Mem = { contract: number; noDouble: number };
function mem(): Mem {
  const m = process.memoryUsage();
  // The contract formula. `arrayBuffers` is also inside `external`
  // (checked on Node 22.17.1), so this counts ArrayBuffers twice.
  return { contract: m.heapUsed + m.external + m.arrayBuffers, noDouble: m.heapUsed + m.external };
}

const id = process.argv[2] ?? "";
const encode = ENCODERS[id];
if (!encode) throw new Error(`unknown encoder: ${id}`);

const mode = process.argv[3];

if (mode === "mem") {
  const kbps = Number(process.argv[4]);
  const sec = Number(process.argv[5]);
  const pcm = speechLikePcm(sec, RATE);
  // Baseline after a GC; the fixture already exists. Then a sample after
  // every chunk and at the end of the encode.
  gc();
  const base = mem();
  let peak = { ...base };
  const sample = () => {
    const m = mem();
    peak = { contract: Math.max(peak.contract, m.contract), noDouble: Math.max(peak.noDouble, m.noDouble) };
  };
  try {
    await encode(pcm, RATE, kbps, sample);
    sample();
    console.log(
      JSON.stringify({
        peakMemBytes: peak.contract - base.contract,
        peakMemBytesNoDoubleCount: peak.noDouble - base.noDouble,
      }),
    );
  } catch (e) {
    console.log(JSON.stringify({ error: String(e).slice(0, 200) }));
  }
} else {
  const out: unknown[] = [];
  for (const sec of DURATIONS) {
    const pcm = speechLikePcm(sec, RATE);
    for (const kbps of BITRATES) {
      try {
        for (let r = 0; r < WARMUP; r++) await encode(pcm, RATE, kbps);
        const cpuMs: number[] = [];
        let bytes = new Uint8Array(0);
        for (let r = 0; r < RUNS; r++) {
          const c0 = process.cpuUsage();
          bytes = await encode(pcm, RATE, kbps);
          const c = process.cpuUsage(c0);
          cpuMs.push((c.user + c.system) / 1000);
        }
        out.push({ kbps, sec, cpuMs, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
      } catch (e) {
        out.push({ kbps, sec, error: String(e).slice(0, 200) });
      }
    }
  }
  console.log(JSON.stringify({ node: process.version, enc: id, results: out }));
}
