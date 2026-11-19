import type { PageScene } from "@storybook/dsl";
import { describe, expect, it } from "vitest";
import type { Heads, RevisionStatus } from "./schema";
import { assetKeysOfScene, isStale, pageStates } from "./staleness";

type Rev = { id: string; status: RevisionStatus; basis: Heads };

function revs(list: Rev[]): ReadonlyMap<string, Rev> {
  return new Map(list.map((r) => [r.id, r]));
}

describe("staleness", () => {
  it("isStale compares every basis entry with the heads", () => {
    expect(isStale({}, { source: "s" })).toBe(false);
    expect(isStale({ source: "s" }, { source: "s" })).toBe(false);
    expect(isStale({ source: "s" }, { source: "t" })).toBe(true);
    expect(isStale({ outline: "o" }, {})).toBe(true);
  });

  it("EDT-01.S3 pageStates: missing, needs_review, stale, ok, and precedence", () => {
    const [ok, review, stale, missing, all] = ["p-ok", "p-review", "p-stale", "p-missing", "p-all"];
    const heads: Heads = {
      [`page_text:${ok}`]: "t-ok",
      [`scene:${ok}`]: "s-ok",
      [`audio:${ok}`]: "a-ok",
      [`page_text:${review}`]: "t-review",
      [`scene:${review}`]: "s-review",
      [`audio:${review}`]: "a-review",
      // The page text head is T2; scene and audio were made from T1.
      [`page_text:${stale}`]: "T2",
      [`scene:${stale}`]: "s-stale",
      [`audio:${stale}`]: "a-stale",
      // No page_text head; the scene needs review; the audio is stale.
      [`scene:${all}`]: "s-all",
      [`audio:${all}`]: "a-all",
    };
    const revisions = revs([
      { id: "t-ok", status: "ok", basis: {} },
      { id: "s-ok", status: "ok", basis: { [`page_text:${ok}`]: "t-ok" } },
      { id: "a-ok", status: "ok", basis: { [`page_text:${ok}`]: "t-ok" } },
      { id: "t-review", status: "ok", basis: {} },
      { id: "s-review", status: "needs_review", basis: { [`page_text:${review}`]: "t-review" } },
      { id: "a-review", status: "ok", basis: { [`page_text:${review}`]: "t-review" } },
      { id: "T2", status: "ok", basis: {} },
      { id: "s-stale", status: "ok", basis: { [`page_text:${stale}`]: "T1" } },
      { id: "a-stale", status: "ok", basis: { [`page_text:${stale}`]: "T1" } },
      { id: "s-all", status: "needs_review", basis: {} },
      { id: "a-all", status: "ok", basis: { [`page_text:${all}`]: "T1" } },
    ]);

    const states = pageStates({ pageIds: [ok, review, stale, missing, all], heads, revisions });
    expect(states).toEqual([
      { pageId: ok, number: 1, state: "ok", problems: [] },
      { pageId: review, number: 2, state: "needs_review", problems: [{ target: "scene", reason: "needs_review" }] },
      {
        pageId: stale,
        number: 3,
        state: "stale",
        problems: [
          { target: "scene", reason: "stale" },
          { target: "audio", reason: "stale" },
        ],
      },
      {
        pageId: missing,
        number: 4,
        state: "missing",
        problems: [
          { target: "page_text", reason: "missing" },
          { target: "scene", reason: "missing" },
          { target: "audio", reason: "missing" },
        ],
      },
      {
        pageId: all,
        number: 5,
        state: "missing",
        problems: [
          { target: "page_text", reason: "missing" },
          { target: "scene", reason: "needs_review" },
          { target: "audio", reason: "stale" },
        ],
      },
    ]);
  });

  it("pageStates throws on a head revision that is missing or superseded", () => {
    const heads: Heads = { "page_text:p": "t" };
    expect(() => pageStates({ pageIds: ["p"], heads, revisions: revs([]) })).toThrow("head revision missing or superseded");
    expect(() =>
      pageStates({ pageIds: ["p"], heads, revisions: revs([{ id: "t", status: "superseded", basis: {} }]) }),
    ).toThrow("head revision missing or superseded");
  });

  it("assetKeysOfScene lists every layer ref and every play_sfx sound once, sorted", () => {
    const scene = {
      templateId: "t",
      sky: "day",
      layers: [
        { instanceId: "a", kind: "character", ref: "pip", slot: "left" },
        { instanceId: "b", kind: "prop", ref: "ball", slot: "ground-1" },
        { instanceId: "c", kind: "character", ref: "pip", slot: "right" },
      ],
      animations: [{ target: "a", primitive: "pop", params: { scale: 1.1 }, trigger: "enter" }],
      interactions: [
        { on: { tap: "a" }, do: [{ action: "play_sfx", sfx: "boing" }, { action: "play_sfx", sfx: "ahh" }] },
        { on: { tap: "b" }, do: [{ action: "play_sfx", sfx: "boing" }] },
      ],
    } as PageScene;
    expect(assetKeysOfScene(scene)).toEqual(["ahh", "ball", "boing", "pip"]);
  });
});
