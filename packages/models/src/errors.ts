import type { Usage } from "./client";

// A provider answered with a non-2xx status, or the request did not complete.
// `retryable` is the classification only: the adapter never retries (#18 does).
// Network failures and timeouts have `status: 0`. `message` never holds
// provider text; `providerMessage` holds at most 300 characters of it, with
// every configured key replaced by "[redacted]".
export class ModelHttpError extends Error {
  status: number;
  retryable: boolean;
  providerMessage?: string;

  constructor(message: string, info: { status: number; retryable: boolean; providerMessage?: string }) {
    super(message);
    this.name = "ModelHttpError";
    this.status = info.status;
    this.retryable = info.retryable;
    if (info.providerMessage !== undefined) this.providerMessage = info.providerMessage;
  }
}

// The provider answered 2xx, but the output cannot be used. The raw output is
// kept in `raw`, never in `message`, so logs never hold a model output.
export class ModelOutputError extends Error {
  raw?: string;
  modelId: string;
  usage: Usage | null;

  constructor(message: string, info: { modelId: string; usage: Usage | null; raw?: string }) {
    super(message);
    this.name = "ModelOutputError";
    this.modelId = info.modelId;
    this.usage = info.usage;
    if (info.raw !== undefined) this.raw = info.raw;
  }
}

// The audio is neither WAV nor 16-bit PCM with a known sample rate.
export class UnsupportedAudioFormatError extends Error {
  modelId: string;
  usage: Usage | null;

  constructor(message: string, info: { modelId: string; usage: Usage | null }) {
    super(message);
    this.name = "UnsupportedAudioFormatError";
    this.modelId = info.modelId;
    this.usage = info.usage;
  }
}
