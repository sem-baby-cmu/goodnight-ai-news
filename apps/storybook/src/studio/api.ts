import type { z } from "zod";
import type {
  CreateStoryResponseSchema,
  PublishBlockedSchema,
  RegistryResponseSchema,
  ReleaseCreatedSchema,
  RunResponseSchema,
  StartRunRequestSchema,
  StartRunResponseSchema,
  StoryDetailResponseSchema,
  StoryListResponseSchema,
  WithdrawalResponseSchema,
} from "../../worker/api/schemas";

// The Studio API client (#23, Exact changes 5). The response types come from
// the Worker schemas, as types only (implementation decision R18).

export type CreateStoryResponse = z.infer<typeof CreateStoryResponseSchema>;
export type StoryListResponse = z.infer<typeof StoryListResponseSchema>;
export type StoryDetailResponse = z.infer<typeof StoryDetailResponseSchema>;
export type RunResponse = z.infer<typeof RunResponseSchema>;
export type RegistryResponse = z.infer<typeof RegistryResponseSchema>;
export type ReleaseCreated = z.infer<typeof ReleaseCreatedSchema>;
export type PublishBlocked = z.infer<typeof PublishBlockedSchema>;
export type WithdrawalResponse = z.infer<typeof WithdrawalResponseSchema>;
export type RunScope = z.infer<typeof StartRunRequestSchema>["scope"];
type StartRunResponse = z.infer<typeof StartRunResponseSchema>;

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; body: unknown };

// No full answer (the status and the whole body) in this time: the request
// ends as no answer. design.md "Error Handling" (#119).
const REQUEST_TIMEOUT_MS = 20_000;

// Same-origin fetch. Never throws: an HTTP error status, a network error, and
// no answer in REQUEST_TIMEOUT_MS are results too (status 0 for no answer).
// Only a GET is aborted at the deadline: it writes nothing. A request with
// another method keeps its connection, so the Worker is not cut off in the
// middle of a write (#119); its late answer is ignored.
async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<ApiResult<T>> {
  const controller = method === "GET" ? new AbortController() : undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<ApiResult<T>>((resolve) => {
    timer = setTimeout(() => {
      // Resolve first: a body read that the abort breaks must not win.
      resolve({ ok: false, status: 0, body: null });
      controller?.abort();
    }, REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([send<T>(method, path, body, controller?.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

// One request and its body. Never throws. A 2xx whose body cannot be read is no
// answer (status 0), not ok with no data; another status keeps `body: null`.
async function send<T>(
  method: "GET" | "POST",
  path: string,
  body: unknown,
  signal: AbortSignal | undefined,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      ...(method === "POST" ? { headers: { "content-type": "application/json" } } : {}),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch {
    return { ok: false, status: 0, body: null };
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    if (res.ok) return { ok: false, status: 0, body: null };
    parsed = null;
  }
  return res.ok ? { ok: true, data: parsed as T } : { ok: false, status: res.status, body: parsed };
}

const story = (id: string) => `/api/studio/stories/${encodeURIComponent(id)}`;

export const studioApi = {
  createStory: (b: { text: string } | { url: string }) => call<CreateStoryResponse>("POST", "/api/studio/stories", b),
  listStories: () => call<StoryListResponse>("GET", "/api/studio/stories"),
  getStory: (id: string) => call<StoryDetailResponse>("GET", story(id)),
  getRun: (id: string) => call<RunResponse>("GET", `/api/studio/runs/${encodeURIComponent(id)}`),
  startRun: (storyId: string, scope: RunScope) => call<StartRunResponse>("POST", `${story(storyId)}/runs`, { scope }),
  publish: (storyId: string) => call<ReleaseCreated>("POST", `${story(storyId)}/releases`),
  getRegistry: () => call<RegistryResponse>("GET", "/api/studio/registry"),
  withdraw: (storyId: string, releaseId: string) => call<WithdrawalResponse>("POST", `${story(storyId)}/withdrawal`, { releaseId }),
};

// The `error` field of an error body, if it has one.
export function errorOf(body: unknown): string | undefined {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") return body.error;
  return undefined;
}
