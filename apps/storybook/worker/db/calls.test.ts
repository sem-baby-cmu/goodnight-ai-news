import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { newStory } from "../test/fixtures";
import { getCall, putCall } from "./calls";
import { getDb } from "./client";
import { newId } from "./ids";

describe("calls", () => {
  it("putCall: second put with the same callId returns the first row", async () => {
    const db = getDb(env.DB);
    const { runId } = await newStory(db);
    const callId = newId();
    const base = { callId, runId, step: "script", pageId: "", purpose: "first" as const, model: "m", createdAt: new Date().toISOString() };
    const first = await putCall(db, { ...base, result: { answer: 1 }, basis: { source: "a" } });
    const second = await putCall(db, { ...base, result: { answer: 2 }, basis: { source: "b" } });
    expect(first.result).toEqual({ answer: 1 });
    expect(second.result).toEqual({ answer: 1 });
    expect(second.basis).toEqual({ source: "a" });
    expect(await getCall(db, callId)).toEqual(first);
  });

  it("getCall: unknown callId returns null", async () => {
    expect(await getCall(getDb(env.DB), newId())).toBeNull();
  });
});
