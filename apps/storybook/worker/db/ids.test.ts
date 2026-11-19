import { describe, expect, it } from "vitest";
import { headKey, makeCallId, newId } from "./ids";

const RUN = "01900000-0000-7000-8000-000000000001";
const PAGE = "01900000-0000-7000-8000-000000000002";

describe("ids", () => {
  it("SYS-02.S4 newId returns a lower-case UUID v7", () => {
    const ids = Array.from({ length: 1000 }, () => newId());
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    expect(new Set(ids).size).toBe(1000);
  });

  it("SYS-01.S4 makeCallId: deterministic and different for first and repair", async () => {
    // Expected values: sha256 of JSON.stringify([runId, step, pageId, purpose]), computed with Node crypto.
    const first = await makeCallId(RUN, "scene", PAGE, "first");
    const repair = await makeCallId(RUN, "scene", PAGE, "repair");
    expect(first).toBe("20b9c743731d985723714026c3eb75ad7d8cd627a1bfcfb7d9c4b7500a69892a");
    expect(repair).toBe("b7156add3835ae42325f00187e7901dca790de3fd357ea2a040a89510790ebde");
    expect(await makeCallId(RUN, "scene", PAGE, "first")).toBe(first);
    expect(first).not.toBe(repair);
  });

  it("headKey builds story-level and page keys", () => {
    expect(headKey("source")).toBe("source");
    expect(headKey("outline")).toBe("outline");
    expect(headKey("page_text", PAGE)).toBe(`page_text:${PAGE}`);
    expect(headKey("scene", PAGE)).toBe(`scene:${PAGE}`);
    expect(headKey("audio", PAGE)).toBe(`audio:${PAGE}`);
    expect(() => headKey("scene")).toThrow();
  });
});
