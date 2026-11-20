import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { OUT, smokeFiles } from "./files";

// Each check of exact change 7. A failed check is recorded with its reason,
// then the test fails. Each test writes its record to its own file at once, so
// a failed test (which restarts the worker) loses no record. The teardown
// merges the records into results.json.
const EXPECTED_S = 15.0;
const TOLERANCE_S = 0.1;

type Check = { pass: boolean; value?: unknown; error?: string };

async function serve(page: Page, name: string, type: string): Promise<void> {
  const body = readFileSync(`${OUT}${name}`);
  await page.route("http://spike.test/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/") {
      await route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>spike</title>" });
      return;
    }
    const headers: Record<string, string> = { "accept-ranges": "bytes", "access-control-allow-origin": "*" };
    // WebKit media loads ask for byte ranges.
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers()["range"] ?? "");
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      await route.fulfill({
        status: 206,
        contentType: type,
        headers: { ...headers, "content-range": `bytes ${start}-${end}/${body.length}` },
        body: body.subarray(start, end + 1),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: type, headers, body });
  });
}

async function check(fn: () => Promise<unknown>, ok: (v: unknown) => boolean): Promise<Check> {
  try {
    const value = await fn();
    return { pass: ok(value), value };
  } catch (e) {
    return { pass: false, error: String(e).split("\n")[0]!.slice(0, 200) };
  }
}

const within = (v: unknown) => typeof v === "number" && Math.abs(v - EXPECTED_S) <= TOLERANCE_S;

for (const f of smokeFiles()) {
  test(`${f.name}`, async ({ page }, info) => {
    await serve(page, f.name, f.type);
    // Same origin as the files: open the page on spike.test, then set it.
    await page.goto("http://spike.test/");
    await page.setContent('<audio id="a" preload="auto"></audio><button id="b">play</button>');
    const src = `http://spike.test/${f.name}`;

    const checks: Record<string, Check> = {};
    checks.canPlayType = await check(
      () => page.evaluate((t) => (document.getElementById("a") as HTMLAudioElement).canPlayType(t), f.type),
      (v) => v !== "",
    );
    checks.loadedmetadata = await check(
      () =>
        page.evaluate(
          (s) =>
            new Promise<number>((resolve, reject) => {
              const a = document.getElementById("a") as HTMLAudioElement;
              const t = setTimeout(() => reject(new Error("no loadedmetadata in 5 s")), 5000);
              a.addEventListener("loadedmetadata", () => {
                clearTimeout(t);
                resolve(a.duration);
              });
              a.addEventListener("error", () => reject(new Error(`media error ${a.error?.code}`)));
              a.src = s;
            }),
          src,
        ),
      (v) => typeof v === "number",
    );
    checks.duration = { pass: within(checks.loadedmetadata.value), value: checks.loadedmetadata.value };

    // The tap handler calls play(), as the Player does.
    await page.evaluate(() => {
      const w = window as unknown as { playResult: Promise<string>; ended: Promise<void> };
      const a = document.getElementById("a") as HTMLAudioElement;
      w.ended = new Promise((resolve) => a.addEventListener("ended", () => resolve()));
      document.getElementById("b")!.addEventListener("click", () => {
        w.playResult = a.play().then(
          () => "resolved",
          (e: Error) => `rejected: ${e.name}`,
        );
      });
    });
    await page.click("#b");
    checks.play = await check(
      () => page.evaluate(() => (window as unknown as { playResult: Promise<string> }).playResult),
      (v) => v === "resolved",
    );
    checks.ended = await check(
      () =>
        page.evaluate(() =>
          Promise.race([
            (window as unknown as { ended: Promise<void> }).ended.then(() => "ended"),
            new Promise((_, reject) => setTimeout(() => reject(new Error("no ended in 20 s")), 20_000)),
          ]),
        ),
      (v) => v === "ended",
    );
    checks.decodeAudioData = await check(
      () =>
        page.evaluate(async (s) => {
          const buf = await (await fetch(s)).arrayBuffer();
          const ctx = new AudioContext();
          const audio = await ctx.decodeAudioData(buf);
          await ctx.close();
          return audio.duration;
        }, src),
      within,
    );

    const pass = Object.values(checks).every((c) => c.pass);
    const record = { profile: info.project.name, file: f.name, enc: f.enc, kbps: f.kbps ?? null, pass, checks };
    const slug = `${info.project.name}-${f.name}`.replace(/[^\w.]+/g, "-");
    writeFileSync(`${OUT}smoke-${slug}.json`, `${JSON.stringify(record, null, 2)}\n`);
    expect(checks, JSON.stringify(checks)).toEqual(
      Object.fromEntries(Object.keys(checks).map((k) => [k, expect.objectContaining({ pass: true })])),
    );
  });
}
