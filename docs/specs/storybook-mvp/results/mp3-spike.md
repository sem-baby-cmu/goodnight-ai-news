# MP3 narration spike: results

Issue: #69. Source: [ADR 0016](../../../adr/0016-backdrops-page-turn.md)
"Decisions" E. This spike changes no production code. The switch to MP3 is a
follow-up issue.

The implementer filled every row except "Device" and the listening verdict.
The owner fills those.

| Field | Value |
| :-- | :-- |
| Date | 2026-11-19 (US time); `results.json` `measuredAt` 2026-11-20T01:23:45Z, WebKit smoke 2026-11-20T02:09:33Z (re-run after the control rule moved into `smoke/teardown.ts`; same values as the 01:27:44Z run) |
| Commit SHA | `8ccedc0`, the harness commit in `results.json` `commit`. After the rebase on `origin/main` it is `eaf06f6`; `git diff 8ccedc0 eaf06f6 -- tools/mp3-spike` is empty |
| Machine | Apple M4, macOS 26.5.2 |
| Node | v22.17.1 (supporting numbers only) |
| wrangler | 4.165.0 (local workerd from `wrangler dev`) |
| ffprobe | 9.0.1 |
| Playwright | 1.65.1, WebKit build 2388 |

## Summary

| Candidate | Verdict | Reason |
| :-- | :-- | :-- |
| `wasm-media-encoders` 0.7.0 | **pass** (T1 to T8, T10) | Lowest CPU, 16.2 MB peak memory, correct format at all 3 bitrates |
| `@breezystack/lamejs` 1.2.7 | fail | T3: 77.1 MB peak memory. T6: at 32 kbps the output is 22050 Hz, not 24000 Hz |
| `lamejs` 1.2.1 | fail | T1: `ReferenceError: MPEGMode is not defined` in workerd |
| `shine.js` 0.0.3 | not usable | Wrong package: a CSS shadow library, not the shine MP3 encoder |

Cloudflare (D69-1, owner approved 2026-11-19): the deployed CPU time and
`startup_time_ms` also pass. The throwaway Worker was deleted in the same
session, and the deletion was confirmed (see "Cloudflare deploy").

Spike verdict: **open**. One candidate passes T1 to T8 and T10. The spike
passes when T9 (real iPhone and iPad) passes. The named candidate is
`wasm-media-encoders` (the only candidate that passes). The owner picks the
bitrate after the listening test.

## Method

All commands run from the repository root. `tools/mp3-spike/out/` is not
tracked.

1. Install once per machine: `pnpm install` and
   `pnpm --filter @storybook/mp3-spike exec playwright install webkit`.
2. Measure: `PATH=$HOME/.nvm/versions/node/v22.17.1/bin:$PATH pnpm --filter
   @storybook/mp3-spike run spike:run`. The `PATH` prefix selects Node 22 for
   the Node numbers.
   - The fixture is `speechLikePcm(sec)` in `tools/mp3-spike/src/fixture.ts`:
     24 kHz, mono, 16-bit, seed 69. It is speech-like and broadband. It is
     generated in code, so no model call is made.
   - For each candidate × bitrate {32, 48, 64} × duration {15, 60} s, the
     script starts a new local workerd (`wrangler dev`), calls
     `/encode?runs=3` (warm-up, discarded), then `/encode?runs=20`, then
     `/mp3`. The Worker times each encode with `performance.now()`. Local
     workerd advances the timer during CPU work. It shows whole
     milliseconds.
   - p50 and p95 are nearest-rank values over the 20 timed runs.
   - Node: one process per candidate, 3 warm-ups and 20 runs with
     `process.cpuUsage()` deltas (user + system). Peak memory: a new process
     for each configuration, 3 times; the table gives the highest value.
     Baseline after `gc()`, with the fixture already made. Then one sample
     after each 1152-sample chunk and at the end.
   - Each MP3 file: `ffprobe -v error -show_entries
     format=duration,bit_rate,size:stream=codec_name,sample_rate,channels -of
     json`.
   - SHA-256 of the workerd output and of the Node output, with `sameBytes`.
3. Bundle: `pnpm --filter @storybook/mp3-spike run spike:bundle`. It runs
   `wrangler deploy <entry> --dry-run --outdir out/bundle-<id> --metafile ...`
   for a baseline entry with no encoder and for each candidate. It records
   `Total Upload` and `gzip`.
4. WebKit smoke: `pnpm --filter @storybook/mp3-spike run spike:smoke`.
   Profiles `devices["iPhone 13"]` and `devices["iPad (gen 7)"]`. The test
   serves each file with `page.route` (byte ranges answered with 206), then
   runs the checks of exact change 7. The WAV control runs first.
5. Output: `tools/mp3-spike/out/results.json` (24 entries plus the WebKit
   records), `out/bundle.json`, and for the deploy `out/deploy-*.log`,
   `out/tail.jsonl` and `out/delete.log`.

Values marked † were read from the terminal output of a command in this
session and were not saved to a file. They cannot be measured again: the
earlier run was overwritten, and the deployed Worker is deleted.

### Implementation decisions

| Decision | Reason |
| :-- | :-- |
| A new local workerd for each configuration | In one long `wrangler dev` session, later configurations ran up to 2.5 times slower (`@breezystack/lamejs` 64 kbps 60 s: p95 2590 ms, against 1000 to 1300 ms in a new isolate). One request ended in `ECONNRESET`. A new isolate is closer to a Workflow step. |
| The Worker imports `../node_modules/wasm-media-encoders/wasm/mp3.wasm` by relative path | wrangler applies its Wasm rule only to specifiers that end in `.wasm`. The package export `./wasm/mp3` has no `.wasm` ending, and the export `./wasm/mp3.wasm` points to `./wasm.mp3.wasm`, which does not exist. The package is not modified. |
| Adapters take an optional 4th argument `onChunk` | The Node harness samples memory after each chunk. The Worker does not pass it. |
| Node memory runs in a new process for each configuration | In one process, the memory of an earlier Wasm instance was not always released by `gc()`. The baseline was then too high, and several peaks were 0. |
| `shine.js` is not a dependency | It has no PCM-to-MP3 API (see Candidates). Its 6 entries are in `results.json` with the error text. |
| One file per adapter in `src/enc/*.ts` and the candidate list in `src/candidates.ts`, not one `src/encoders.ts` | Each bundle entry in `worker/bundle/` must import exactly one encoder, so that its `Total Upload` delta is that encoder's cost. |
| The WAV control rule is applied in `smoke/teardown.ts` | It rewrites the candidate records of a profile to "not measured: harness (<check>)" when the control fails there. |

## Candidates

| Package | Version | Licence (registry) | T1 in workerd | Note |
| :-- | :-- | :-- | :-- | :-- |
| `@breezystack/lamejs` | 1.2.7 | LGPL-3.0 | 200 at all bitrates | JS port of LAME |
| `lamejs` | 1.2.1 | LGPL-3.0 | 500: `ReferenceError: MPEGMode is not defined` | Same error in Node 22. The other file in the package, `lame.all.js`, is a browser script with no module export. It is not used. |
| `wasm-media-encoders` | 0.7.0 | MIT | 200 at all bitrates | `LICENSE` is MIT and does not name LAME. The README says the package is "The LAME MP3 and Ogg Vorbis audio encoders, compiled to minimal WebAssembly". The licence question goes to decision 2. |
| `shine.js` | 0.0.3 | ISC | not usable | `npm view shine.js description` = "A library for pretty shadows". Not an MP3 encoder. |

## CPU (T2)

Local workerd, 20 timed runs. Node p95 is the supporting number.

| Candidate | kbps | Audio s | workerd p50 ms | p95 ms | max ms | p95 ms per audio s | Node p95 ms |
| :-- | --: | --: | --: | --: | --: | --: | --: |
| `wasm-media-encoders` | 32 | 15 | 91 | 143 | 198 | 9.5 | 80.3 |
| `wasm-media-encoders` | 48 | 15 | 110 | 202 | 247 | 13.5 | 100.1 |
| `wasm-media-encoders` | 64 | 15 | 111 | 132 | 257 | 8.8 | 96.0 |
| `wasm-media-encoders` | 32 | 60 | 336 | 426 | 532 | 7.1 | 265.6 |
| `wasm-media-encoders` | 48 | 60 | 387 | 544 | 553 | 9.1 | 324.0 |
| `wasm-media-encoders` | 64 | 60 | 337 | 361 | 383 | 6.0 | 335.3 |
| `@breezystack/lamejs` | 32 | 15 | 1031 | 1180 | 1260 | 78.7 | 1627.7 |
| `@breezystack/lamejs` | 48 | 15 | 218 | 302 | 304 | 20.1 | 322.0 |
| `@breezystack/lamejs` | 64 | 15 | 228 | 288 | 344 | 19.2 | 289.0 |
| `@breezystack/lamejs` | 32 | 60 | 5204 | 7203 | 7258 | 120.0 | 6154.1 |
| `@breezystack/lamejs` | 48 | 60 | 1197 | 1455 | 1563 | 24.2 | 1106.1 |
| `@breezystack/lamejs` | 64 | 60 | 1089 | 1317 | 1456 | 21.9 | 1122.1 |

- Run-to-run spread †: an earlier run of the same code (2026-11-20T01:12Z,
  before the commit) gave `wasm-media-encoders` 15 s p95 of 99, 113 and 122
  ms. So a p95 can move by about 2 times between runs on this laptop. Every
  `wasm-media-encoders` value stays at least 14 times below the T2 limits
  (3,000 ms; 200 ms per audio second).
- `@breezystack/lamejs` at 32 kbps is about 4 times slower than at 48 kbps.
  At 32 kbps it resamples to 22050 Hz (see Output).
- Cloudflare CPU time: see "Cloudflare deploy". The deployed encode
  estimate is 1.4 to 3.3 times the local workerd p50 of the same
  configuration (for example 48 kbps 15 s: 181 ms against 110 ms). The
  10 times margin of T2 covers it.

## Memory (T3)

Node 22, peak minus baseline, highest of 3 processes.

| Candidate | kbps | Audio s | Contract formula MB | Without double count MB |
| :-- | --: | --: | --: | --: |
| `wasm-media-encoders` | 32 | 15 | 16.0 | 15.6 |
| `wasm-media-encoders` | 48 | 15 | 16.1 | 15.7 |
| `wasm-media-encoders` | 64 | 15 | 16.2 | 15.7 |
| `wasm-media-encoders` | 32 | 60 | 8.5 | 8.0 |
| `wasm-media-encoders` | 48 | 60 | 9.3 | 8.5 |
| `wasm-media-encoders` | 64 | 60 | 9.7 | 8.6 |
| `@breezystack/lamejs` | 32 | 15 | 64.9 | 61.8 |
| `@breezystack/lamejs` | 48 | 15 | 60.8 | 44.1 |
| `@breezystack/lamejs` | 64 | 15 | 60.8 | 43.8 |
| `@breezystack/lamejs` | 32 | 60 | 57.7 | 54.8 |
| `@breezystack/lamejs` | 48 | 60 | 74.2 | 45.2 |
| `@breezystack/lamejs` | 64 | 60 | 77.1 | 47.1 |

- MB = 10^6 bytes.
- The contract formula is `heapUsed + external + arrayBuffers`. On Node
  22.17.1, `arrayBuffers` is also inside `external`. Check: a new 100 MiB
  `ArrayBuffer` raised both `external` and `arrayBuffers` by 100.0 MiB. So the
  formula counts ArrayBuffers twice. The second column is `heapUsed +
  external`. A 64 MiB `WebAssembly.Memory` raised `external` by 64.0 MiB and
  `arrayBuffers` by 0, so Wasm memory is in both columns.
- T3 uses the contract formula. Both columns give the same verdict.
- `wasm-media-encoders` uses less memory for 60 s than for 15 s. This is
  repeatable (3 of 3 processes). The cause is not known. It does not change
  the verdict.
- The `@breezystack/lamejs` peak includes V8 heap that is not yet collected
  and the JIT work of a first call. This is the state of a cold Workflow
  step.

## Bundle (T4)

`wrangler deploy --dry-run`, wrangler 4.165.0.

| Entry | Total Upload KiB | gzip KiB | Delta KiB | Delta gzip KiB | Largest input |
| :-- | --: | --: | --: | --: | :-- |
| baseline (no encoder) | 4.81 | 1.84 | 0 | 0 | `src/fixture.ts` |
| `wasm-media-encoders` | 143.87 | 70.15 | 139.06 | 68.31 | `mp3.wasm` (132,999 B, its own module); JS `dist/es/index.mjs` adds 6,072 B |
| `@breezystack/lamejs` | 263.45 | 69.08 | 258.64 | 67.24 | `dist/lamejs.js` (263,871 B) |
| `lamejs` | 450.82 | 80.09 | 446.01 | 78.25 | `src/js/PsyModel.js` (76,846 B) |

The `wasm-media-encoders` ES entry (`index.mjs`, 783,133 B) inlines both
encoders as base64. esbuild tree-shakes it: only 6,072 B of it is in the
bundle, because the adapter calls `createEncoder` with the module and never
`createMp3Encoder`.

## Startup (T5)

- Global scope (read in `tools/mp3-spike/worker/app.ts` and
  `worker/index.ts`): only function definitions, the module import of
  `mp3.wasm`, and `makeWorker({...})`, which stores function references. Each
  encoder is created inside the request handler (`createEncoder` and `new
  Mp3Encoder` in `src/enc/*.ts`). Pass for all candidates that load.
- `startup_time_ms` from `wrangler deploy` ("Worker Startup Time"): baseline
  4 ms, `wasm-media-encoders` 2 ms. Delta -2 ms, limit 100 ms: pass. One
  deploy each, so the 2 ms difference is noise.

## Output (T6, T7)

ffprobe of the workerd files. Target sizes: `kbps × 1000 / 8 × seconds`.

| Candidate | kbps | Audio s | codec | sample_rate | channels | bit_rate | duration s | size B | Target B | Size delta |
| :-- | --: | --: | :-- | --: | --: | --: | --: | --: | --: | --: |
| `wasm-media-encoders` | 32 | 15 | mp3 | 24000 | 1 | 32000 | 15.048 | 60,192 | 60,000 | +0.32% |
| `wasm-media-encoders` | 48 | 15 | mp3 | 24000 | 1 | 48000 | 15.048 | 90,288 | 90,000 | +0.32% |
| `wasm-media-encoders` | 64 | 15 | mp3 | 24000 | 1 | 64000 | 15.048 | 120,384 | 120,000 | +0.32% |
| `wasm-media-encoders` | 32 | 60 | mp3 | 24000 | 1 | 32000 | 60.048 | 240,192 | 240,000 | +0.08% |
| `wasm-media-encoders` | 48 | 60 | mp3 | 24000 | 1 | 48000 | 60.048 | 360,288 | 360,000 | +0.08% |
| `wasm-media-encoders` | 64 | 60 | mp3 | 24000 | 1 | 64000 | 60.048 | 480,384 | 480,000 | +0.08% |
| `@breezystack/lamejs` | 32 | 15 | mp3 | **22050** | 1 | 32000 | 15.073 | 60,291 | 60,000 | +0.49% |
| `@breezystack/lamejs` | 48 | 15 | mp3 | 24000 | 1 | 48000 | 15.048 | 90,288 | 90,000 | +0.32% |
| `@breezystack/lamejs` | 64 | 15 | mp3 | 24000 | 1 | 64000 | 15.048 | 120,384 | 120,000 | +0.32% |
| `@breezystack/lamejs` | 32 | 60 | mp3 | **22050** | 1 | 32000 | 60.056 | 240,222 | 240,000 | +0.09% |
| `@breezystack/lamejs` | 48 | 60 | mp3 | 24000 | 1 | 48000 | 60.048 | 360,288 | 360,000 | +0.08% |
| `@breezystack/lamejs` | 64 | 60 | mp3 | 24000 | 1 | 64000 | 60.048 | 480,384 | 480,000 | +0.08% |

- `sameBytes` is `true` for all 12 entries that loaded: workerd and Node give
  the same file.
- The duration is 48 ms longer than the PCM (encoder delay and padding,
  within the 100 ms limit). For `@breezystack/lamejs` at 32 kbps it is 73 ms
  (15 s) and 56 ms (60 s) longer.
- `@breezystack/lamejs` sets no output sample rate, so LAME picks one. At 32
  kbps it picks 22050 Hz. The adapter does not work around this (no silent
  fixes).

## WebKit smoke (T8)

Playwright WebKit build 2388. A smoke check, not the device result. 14 of 14
tests pass.

| Profile | File | canPlayType | loadedmetadata duration s | play() | ended | decodeAudioData duration s | Result |
| :-- | :-- | :-- | --: | :-- | :-- | --: | :-- |
| iPhone 13 | `control-15s.wav` | maybe | 15.000 | resolved | yes | 15.000 | pass |
| iPhone 13 | `wasm-media-encoders-32k-15s.mp3` | maybe | 15.048 | resolved | yes | 15.048 | pass |
| iPhone 13 | `wasm-media-encoders-48k-15s.mp3` | maybe | 15.048 | resolved | yes | 15.048 | pass |
| iPhone 13 | `wasm-media-encoders-64k-15s.mp3` | maybe | 15.048 | resolved | yes | 15.048 | pass |
| iPhone 13 | `breezy-lamejs-32k-15s.mp3` | maybe | 15.073 | resolved | yes | 15.073 | pass |
| iPhone 13 | `breezy-lamejs-48k-15s.mp3` | maybe | 15.048 | resolved | yes | 15.048 | pass |
| iPhone 13 | `breezy-lamejs-64k-15s.mp3` | maybe | 15.048 | resolved | yes | 15.048 | pass |
| iPad (gen 7) | `control-15s.wav` | maybe | 15.000 | resolved | yes | 15.000 | pass |
| iPad (gen 7) | `wasm-media-encoders-32k-15s.mp3` | maybe | 15.048 | resolved | yes | 15.048 | pass |
| iPad (gen 7) | `wasm-media-encoders-48k-15s.mp3` | maybe | 15.048 | resolved | yes | 15.048 | pass |
| iPad (gen 7) | `wasm-media-encoders-64k-15s.mp3` | maybe | 15.048 | resolved | yes | 15.048 | pass |
| iPad (gen 7) | `breezy-lamejs-32k-15s.mp3` | maybe | 15.073 | resolved | yes | 15.073 | pass |
| iPad (gen 7) | `breezy-lamejs-48k-15s.mp3` | maybe | 15.048 | resolved | yes | 15.048 | pass |
| iPad (gen 7) | `breezy-lamejs-64k-15s.mp3` | maybe | 15.048 | resolved | yes | 15.048 | pass |

The WAV control passes every check, so the harness works.

## Device (T9, owner)

Open the 15 s files from `tools/mp3-spike/out/` on each device. Tap to play.

| Device | Model | OS | Plays from tap | Start not clipped | Duration right | Notes |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| iPhone, Safari | | | | | | |
| iPad, Safari | | | | | | |

Listening verdict (owner), `wasm-media-encoders`, on a real iPhone:

| Bitrate | Verdict | Notes |
| :-- | :-- | :-- |
| 32 kbps | | |
| 48 kbps | | |
| 64 kbps | | |

## Cloudflare deploy (D69-1)

Only `wasm-media-encoders`, the candidate that passes locally. The Worker
`mp3-spike` was on `workers.dev` only, with no route and no bindings. The
credentials came from the main checkout's `apps/storybook/.dev.vars` and were
not printed. Before the deploy, `GET
/accounts/<id>/workers/scripts/mp3-spike` returned 404 †.

| Step (UTC, 2026-11-20) | Command | Result |
| :-- | :-- | :-- |
| 01:56:11 | `wrangler deploy worker/bundle/baseline.ts --name mp3-spike` | Total Upload 4.81 KiB; Worker Startup Time 4 ms; version `b2d05843` |
| 01:56:14 | `wrangler deploy worker/bundle/wasm-media-encoders.ts --name mp3-spike` | Total Upload 143.87 KiB; Worker Startup Time 2 ms; version `552d8e3c` |
| 01:56:43 to 01:57:23 | `wrangler tail mp3-spike --format json`, 30 requests to `/encode` | 30 events, all `outcome` `ok`, each with `cpuTime` |
| 01:57:47 | `wrangler delete --name mp3-spike --force` | "Successfully deleted mp3-spike" |
| 01:57:54 | `GET /accounts/<id>/workers/scripts/mp3-spike`; `GET .../workers/scripts`; `wrangler deployments list --name mp3-spike`; the `workers.dev` URL | 404 †; not in the list of 36 scripts †; error code 10007 "This Worker does not exist on your account" (`out/deployments-after.log`); 404 † |

CPU time per request from the `cpuTime` field of the tail events, in ms.
`runs=0` generates the fixture only. `runs=1` generates the fixture and
encodes once. The deployed Worker cannot time the encode alone: its
`performance.now()` returned 0 for every run †, as the performance page says.

| kbps | Audio s | `runs=0` (n) | `runs=1` (n) | `runs=1` median minus `runs=0` median |
| --: | --: | :-- | :-- | --: |
| 32 | 15 | 322, 333, 384 (3) | 356, 543, 635, 683, 783 (5) | 302 |
| 48 | 15 | 229, 262, 304 (3) | 322, 336, 443, 531, 916 (5) | 181 |
| 64 | 15 | 163, 255, 389 (3) | 281, 326, 494, 499, 593 (5) | 239 |
| 48 | 60 | 1061, 1538, 1687 (3) | 1757, 2086, 2108 (3) | 548 |

- T2 on Cloudflare, with the whole request as an upper bound (fixture
  included): 15 s, highest 916 ms (limit 3,000 ms). 60 s, highest 2,108 ms,
  that is 35.1 ms per audio second (limit 200). Pass.
- The deployed `/encode` responses for 15 s gave the same byte counts and the
  same first 12 hex characters of the SHA-256 as the local workerd files, at
  all 3 bitrates †.
- The values spread widely: n is small, and each request can run on a
  different machine.

## 4G (T10)

One 15 s page on DevTools "Fast 4G": 1,012,500 B/s, 165 ms latency. Measured
byte counts. Transfer = bytes / 1,012,500 B/s (computed, not a network
measurement).

| Format | Bytes | Transfer ms | With latency ms | Share of 2 s (transfer) | 8-page book B | T10 (≤ 200 ms) |
| :-- | --: | --: | --: | --: | --: | :-- |
| WAV (today, `control-15s.wav`) | 720,044 | 711.2 | 876.2 | 35.6% | 5,760,352 | fail |
| MP3 32 kbps (`wasm-media-encoders`) | 60,192 | 59.4 | 224.4 | 3.0% | 481,536 | pass |
| MP3 48 kbps (`wasm-media-encoders`) | 90,288 | 89.2 | 254.2 | 4.5% | 722,304 | pass |
| MP3 64 kbps (`wasm-media-encoders`) | 120,384 | 118.9 | 283.9 | 5.9% | 963,072 | pass |

Both views (D69-3):

- **Narration inside the PLY-03.S4 2 s budget**: one page's narration uses
  the "Share of 2 s" column, plus one request of latency (the "With latency"
  column). WAV uses 876 ms of the 2 s. MP3 uses 224 to 284 ms.
- **Narration outside the budget** (decision 3): the separate rule is T10,
  transfer at most 200 ms. WAV fails. All three MP3 bitrates pass.

## Verdict per threshold

| ID | `wasm-media-encoders` | `@breezystack/lamejs` | `lamejs` | `shine.js` |
| :-- | :-- | :-- | :-- | :-- |
| T1 loads in workerd | pass | pass | **fail** (`ReferenceError: MPEGMode is not defined`) | not usable |
| T2 CPU (15 s p95 ≤ 3,000 ms; 60 s ≤ 200 ms per audio s) | pass (local: 15 s max p95 202 ms, 60 s max 9.1 ms/s; Cloudflare upper bound: 916 ms, 35.1 ms/s) | pass (15 s max p95 1,180 ms; 60 s max 120.0 ms/s) | not measured (T1) | not usable |
| T3 memory ≤ 32 MB | pass (16.2 MB) | **fail** (77.1 MB) | not measured (T1) | not usable |
| T4 bundle delta ≤ 1 MiB | pass (139.06 KiB) | pass (258.64 KiB) | pass (446.01 KiB) | not usable |
| T5 startup | pass (global scope; `startup_time_ms` delta -2 ms) | pass (global scope); `startup_time_ms` not measured (not deployed) | not measured (T1) | not usable |
| T6 output format | pass | **fail** (32 kbps: 22050 Hz) | not measured (T1) | not usable |
| T7 size within 2% | pass (+0.32%) | pass (+0.49%) | not measured (T1) | not usable |
| T8 WebKit smoke | pass (6 of 6) | pass (6 of 6) | not measured (T1) | not usable |
| T9 real iPhone and iPad | open (owner) | — | — | — |
| T10 4G ≤ 200 ms | pass (59 to 119 ms) | pass (60 to 119 ms) | not measured (T1) | not usable |
| **Candidate** | **pass** | **fail** (T3, T6) | **fail** (T1) | **not usable** |

Verdict rule (from the issue, stated before measurement): a candidate passes
when T1 to T8 and T10 pass. The spike passes when at least one candidate
passes and T9 passes. T9 is open, so the spike verdict is open.

## Not measured

| Item | Reason |
| :-- | :-- |
| Cloudflare CPU time and `startup_time_ms` of `@breezystack/lamejs` and `lamejs` | Only the candidate that passed locally was deployed |
| T9 device rows and listening verdict | Owner |
