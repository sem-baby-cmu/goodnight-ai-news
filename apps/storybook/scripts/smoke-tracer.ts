// RED stub for the tracer smoke script (#25): the types are final, runSmoke is not implemented yet.

export interface SmokeDeps {
  fetch(
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string; redirect?: "manual" },
  ): Promise<Pick<Response, "status" | "headers" | "json" | "text" | "arrayBuffer">>;
  sleep(ms: number): Promise<void>;
  now(): number;
  log(line: string): void;
}

export interface SmokeOptions {
  base: string; // e.g. https://lullabyte.ioenv.com (no trailing slash)
  auth: { clientId: string; clientSecret: string };
  run: boolean; // false = preflight only
  text?: string; // required when run is true
  timeoutMs: number; // run polling limit
  pollMs: number;
}

export interface SmokeResult {
  ok: boolean;
  failedStep: string | null;
  storyId?: string;
  runId?: string;
  runStatus?: string;
  releaseId?: string;
}

export async function runSmoke(_opts: SmokeOptions, _deps: SmokeDeps): Promise<SmokeResult> {
  return { ok: false, failedStep: "not_implemented" };
}
