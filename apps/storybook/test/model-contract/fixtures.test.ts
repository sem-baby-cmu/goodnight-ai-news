import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureFiles, fixtureProblems, missingFixtureFiles, writeFixtures } from "../../scripts/s2/fixtures";
import { formatRate, summarize, verdict } from "../../scripts/s2/summary";
import { type Deps, checkInputs, rowQueries, runOne, sha256 } from "../../scripts/s2-run";
import { OTHER_RUN_CALL, PAGE, badScene, fakeRun, okScene } from "./fake-run";

const ROOT = path.join(import.meta.dirname, "s2");
const slugs = (JSON.parse(readFileSync(path.join(ROOT, "inputs.json"), "utf8")) as Array<{ slug: string }>).map((i) => i.slug);
it("RUN-06.S2 recorded S2 outputs stay valid against the current schemas", () => {
  for (const slug of slugs) expect([slug, fixtureProblems(path.join(ROOT, slug))]).toEqual([slug, []]);
});

function written(rows = fakeRun()): string {
  const dir = mkdtempSync(path.join(tmpdir(), "s2-fixture-"));
  writeFixtures(dir, fixtureFiles(rows));
  return dir;
}

function edit(dir: string, file: string, change: (value: Record<string, unknown>) => void): void {
  const p = path.join(dir, file);
  const value = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  change(value);
  writeFixtures(dir, { [file]: value });
}

describe("S2 fixture writer", () => {
  it("lays out one run as the S2 folder, numbered by outline position", () => {
    const files = fixtureFiles(fakeRun());
    expect(Object.keys(files).sort()).toEqual(
      [
        "registry.json",
        "run.json",
        "calls/script.first.json",
        "calls/page-1.scene.first.json",
        "calls/page-2.scene.first.json",
        "calls/page-2.scene.repair.json",
        "calls/page-3.scene.first.json",
        "calls/page-3.scene.repair.json",
        "calls/page-4.scene.first.json",
        "calls/page-6.scene.first.json",
        "revisions/outline.json",
        ...[1, 2, 3, 4, 5, 6].map((n) => `revisions/page-${n}.text.json`),
        ...[1, 2, 3, 4, 6].map((n) => `revisions/page-${n}.scene.json`),
      ].sort(),
    );
    expect(files["run.json"]).toEqual({
      runId: fakeRun().runId,
      storyId: fakeRun().storyId,
      status: "needs_review",
      createdAt: "2026-11-20T10:00:00.000Z",
      finishedAt: "2026-11-20T10:04:30.000Z",
      models: { audio: ["tts-model"], scene: ["scene-model"], script: ["script-model"] },
    });
    expect(files["calls/page-2.scene.repair.json"]).toEqual({
      result: { answer: okScene() },
      usage: { inputTokens: 300, outputTokens: 120 },
    });
    expect(files["revisions/page-3.scene.json"]).toEqual({
      id: fakeRun().revisions.find((r) => r.kind === "scene" && r.page_id === PAGE[2])!.id,
      status: "needs_review",
      error: { issues: [{ path: "layers.1.slot", code: "unknown_slot", message: "x" }] },
      content: badScene(),
    });
  });

  it("refuses rows that do not describe one run", () => {
    const twoScenes = fakeRun();
    twoScenes.revisions.push({ ...twoScenes.revisions.find((r) => r.kind === "scene")!, id: "01900000-0000-7000-8000-0000000004ff" });
    expect(() => fixtureFiles(twoScenes)).toThrow(/two scene revisions for page 1/);

    const foreign = fakeRun();
    foreign.revisions.find((r) => r.kind === "scene")!.call_id = OTHER_RUN_CALL;
    expect(() => fixtureFiles(foreign)).toThrow(/not a call of this run/);
  });
});

describe("S2 fixture checks", () => {
  it("pass a valid recorded run", () => {
    expect(fixtureProblems(written())).toEqual([]);
  });

  it("report an ok scene that no longer validates", () => {
    const dir = written();
    edit(dir, "revisions/page-1.scene.json", (v) => {
      v.content = badScene();
    });
    expect(fixtureProblems(dir)).toEqual([expect.stringMatching(/^revisions\/page-1\.scene\.json: /)]);
  });

  it("report a needs_review scene that now validates", () => {
    const dir = written();
    edit(dir, "revisions/page-3.scene.json", (v) => {
      v.content = okScene();
    });
    expect(fixtureProblems(dir)).toEqual([expect.stringMatching(/^revisions\/page-3\.scene\.json: needs_review but no issue/)]);
  });

  it("report an outline or a page text that the schemas reject", () => {
    const dir = written();
    edit(dir, "revisions/outline.json", (v) => {
      (v.content as { ageBand: string }).ageBand = "11-12";
    });
    edit(dir, "revisions/page-2.text.json", (v) => {
      v.content = { text: "" };
    });
    expect(fixtureProblems(dir)).toEqual([
      expect.stringMatching(/^revisions\/outline\.json: /),
      expect.stringMatching(/^revisions\/page-2\.text\.json: /),
    ]);
  });

  it("name each missing file of a folder", () => {
    const dir = written();
    expect(missingFixtureFiles(dir)).toEqual(["revisions/page-5.scene.json"]);
    expect(missingFixtureFiles(path.join(dir, "absent"))).toEqual(["registry.json", "run.json", "calls/script.first.json", "revisions/outline.json"]);
  });
});

describe("S2 summary", () => {
  it("counts passes only from scene revisions of this run's scene calls", () => {
    expect(summarize(fakeRun())).toEqual({
      runId: fakeRun().runId,
      status: "needs_review",
      scriptOk: true,
      pages: 6,
      okFirstTry: 2,
      okAfterRepair: 1,
      needsReview: 2,
      failed: 1,
      superseded: 0,
      audioOk: 1,
      wallMs: 270_000,
      inputTokens: 2400,
      outputTokens: 1040,
      repairs: 2,
      issueCodes: { unknown_slot: 1, provider_error: 1 },
    });
  });

  it("gives a run without an outline 0 pages and fails the verdict on the script", () => {
    const noOutline = fakeRun();
    noOutline.run.status = "failed";
    noOutline.calls = noOutline.calls.filter((c) => c.step === "script");
    noOutline.revisions = [];
    const s = summarize(noOutline);
    expect([s.scriptOk, s.pages, s.failed]).toEqual([false, 0, 0]);
    expect(verdict([summarize(fakeRun()), s])).toEqual({ passes: 3, pages: 6, firstTry: 2, verdict: "fail (script)" });
  });

  it("passes the verdict only at 0.90 or more", () => {
    const row = (pass: number, pages: number) => ({ ...summarize(fakeRun()), pages, okFirstTry: pass, okAfterRepair: 0 });
    expect(verdict([row(7, 7), row(6, 7), row(6, 7)]).verdict).toBe("pass");
    expect(verdict([row(6, 7), row(6, 7), row(6, 7)]).verdict).toBe("fail");
    expect(verdict([row(6, 6), row(6, 7), row(6, 7)]).verdict).toBe("pass"); // 18/20 = 0.90 exactly
    expect(formatRate(19, 21)).toBe("19/21 = 0.905");
    expect(formatRate(18, 21)).toBe("18/21 = 0.857");
  });
});

describe("S2 driver", () => {
  const input = { slug: "s2-1", url: "https://example.org/a", retrievedAt: "2026-11-19T00:00:00.000Z", words: 5, sha256: sha256("One two three four five.\n") };

  function deps(over: Partial<Deps> = {}) {
    let clock = 0;
    const statuses = ["queued", "running", "draft_ready"];
    const seen = { posts: [] as string[], sleeps: [] as number[], sql: [] as string[], log: [] as string[] };
    const rows = fakeRun();
    const d: Deps = {
      readText: () => "One two three four five.\n",
      post: async (text) => {
        seen.posts.push(text);
        return { status: 202, body: { storyId: rows.storyId, runId: rows.runId } };
      },
      getRun: async () => ({ status: 200, body: { run: { status: statuses.shift() ?? "draft_ready" } } }),
      query: async (sql) => {
        seen.sql.push(sql);
        if (sql.includes("FROM call_log c WHERE")) return rows.calls;
        if (sql.includes("FROM revision r")) return rows.revisions;
        return [rows.run];
      },
      sleep: async (ms) => {
        seen.sleeps.push(ms);
        clock += ms;
      },
      now: () => clock,
      log: (line) => seen.log.push(line),
      ...over,
    };
    return { d, seen };
  }

  it("stops on a SHA-256 mismatch before any request", () => {
    expect(() => checkInputs([{ ...input, sha256: "0".repeat(64) }], () => "changed text")).toThrow(/s2-1: SHA-256 mismatch/);
    expect(() => checkInputs([input], () => "One two three four five.\n")).not.toThrow();
  });

  it("posts each text once, polls every 5 s to a terminal status, and reads the stored rows", async () => {
    const { d, seen } = deps();
    const out = await runOne(input, d);
    expect(seen.posts).toEqual(["One two three four five.\n"]);
    expect(seen.sleeps).toEqual([5000, 5000, 5000]);
    expect(out.outcome).toBe("draft_ready");
    expect(out.rows).toEqual(fakeRun());
    expect(seen.sql).toEqual(rowQueries(fakeRun().runId));
    const logged = seen.log.join("\n");
    expect(logged.split(fakeRun().runId).length - 1).toBe(1);
    expect(logged).not.toContain("One two three");
  });

  it("records a timeout after 30 minutes and still reads the rows", async () => {
    const { d } = deps({ getRun: async () => ({ status: 200, body: { run: { status: "running" } } }) });
    const out = await runOne(input, d);
    expect(out.outcome).toBe("timeout");
    expect(out.rows.calls).toHaveLength(fakeRun().calls.length);
  });

  it("refuses an answer that is not 202 or an ID that is not a UUID before any SQL", async () => {
    const bad = deps({ post: async () => ({ status: 202, body: { storyId: "x", runId: "x' OR '1'='1" } }) });
    await expect(runOne(input, bad.d)).rejects.toThrow(/runId is not a UUID/);
    expect(bad.seen.sql).toEqual([]);
    const refused = deps({ post: async () => ({ status: 422, body: { error: "source_rejected" } }) });
    await expect(runOne(input, refused.d)).rejects.toThrow(/s2-1: POST \/api\/studio\/stories answered 422/);
  });
});
