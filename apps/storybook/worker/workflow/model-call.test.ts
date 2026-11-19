import { ModelHttpError } from "@storybook/models";
import { describe, expect, it } from "vitest";
import { classifyProviderError, readStatusTag, withStatusTag } from "./model-call";
import { toErrorRecord } from "./steps/finish";

const withStatus = (status: number, message = "provider error") => Object.assign(new Error(message), { status });

describe("classifyProviderError", () => {
  it("classifyProviderError: 429 and 5xx retry, other 4xx do not", () => {
    for (const s of [429, 500, 502, 503, 0]) expect(classifyProviderError(withStatus(s)), String(s)).toBe("retry");
    expect(classifyProviderError(new Error("network"))).toBe("retry");
    expect(classifyProviderError(Object.assign(new Error("odd"), { status: "400" }))).toBe("retry");
    expect(classifyProviderError(withStatus(400, "bad request"))).toEqual({ status: 400, message: "bad request" });
    expect(classifyProviderError(withStatus(404, "not found"))).toEqual({ status: 404, message: "not found" });
    const long = classifyProviderError(withStatus(422, "x".repeat(500)));
    expect(long).toEqual({ status: 422, message: "x".repeat(200) });

    // ModelHttpError: `retryable` decides, whatever its status (R13, R26b).
    const http = (status: number, retryable: boolean, providerMessage?: string) =>
      new ModelHttpError(`Model request failed with HTTP ${status}`, {
        status,
        retryable,
        modelId: "m",
        ...(providerMessage === undefined ? {} : { providerMessage }),
      });
    expect(classifyProviderError(http(400, true))).toBe("retry");
    expect(classifyProviderError(http(503, false))).toEqual({ status: 503, message: "Model request failed with HTTP 503" });
    expect(classifyProviderError(http(400, false, "y".repeat(300)))).toEqual({ status: 400, message: "y".repeat(200) });
  });
});

describe("provider status tag (R60)", () => {
  it("readStatusTag parses only a leading three-digit tag", () => {
    expect(readStatusTag("[provider status 503] upstream down")).toEqual({ status: 503, message: "upstream down" });
    expect(readStatusTag("upstream down")).toEqual({ status: null, message: "upstream down" });
    const middle = "upstream [provider status 503] down";
    expect(readStatusTag(middle)).toEqual({ status: null, message: middle });
    expect(readStatusTag("[provider status 0] network")).toEqual({ status: null, message: "[provider status 0] network" });
    expect(readStatusTag("[provider status 5030] x")).toEqual({ status: null, message: "[provider status 5030] x" });
  });

  it("withStatusTag tags only an HTTP status", () => {
    expect((withStatusTag(withStatus(429, "slow down")) as Error).message).toBe("[provider status 429] slow down");
    const network = withStatus(0, "network");
    expect(withStatusTag(network)).toBe(network);
    const plain = new Error("bug");
    expect(withStatusTag(plain)).toBe(plain);
  });

  it("toErrorRecord reads the tag after a step boundary and keeps at most 300 characters", () => {
    const ids = { runId: "r", storyId: "s", pageId: "p", step: "audio:p" };
    // Only the message crosses a step boundary.
    const crossed = new Error((withStatusTag(withStatus(503, "y".repeat(400))) as Error).message);
    expect(toErrorRecord({ ...ids, err: crossed })).toEqual({ ...ids, providerStatus: 503, message: "y".repeat(300) });
    expect(toErrorRecord({ ...ids, err: withStatus(502, "bad gateway") })).toEqual({ ...ids, providerStatus: 502, message: "bad gateway" });
    expect(toErrorRecord({ ...ids, err: new Error("x [provider status 503] y") })).toEqual({
      ...ids,
      providerStatus: null,
      message: "x [provider status 503] y",
    });
  });
});

