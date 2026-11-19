import { ModelHttpError } from "@storybook/models";
import { describe, expect, it } from "vitest";
import { classifyProviderError } from "./model-call";

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
