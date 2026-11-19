import { afterEach, describe, expect, it, vi } from "vitest";
import { loadModelConfig } from "../src/config";
import { baseEnv } from "../src/test-helpers";
import { probeGateway, probeTts } from "./probe";

const config = loadModelConfig(baseEnv);

function answerWith(body: string, status = 200) {
  vi.stubGlobal("fetch", async () => new Response(body, { status }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("probe", () => {
  it("reports the real status and bodyNotJson for a 2xx gateway body that is not JSON", async () => {
    answerWith("<html>gateway</html>");
    expect(await probeGateway(config)).toEqual({ status: 200, bodyNotJson: true });
  });

  it("reports the real status and bodyNotJson for a 2xx TTS body that is not JSON", async () => {
    answerWith("not json", 201);
    expect(await probeTts(config)).toEqual({ status: 201, bodyNotJson: true });
  });

  it("still reports status 0 when the request itself fails", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    expect(await probeGateway(config)).toEqual({ status: 0, error: "TypeError" });
  });
});
