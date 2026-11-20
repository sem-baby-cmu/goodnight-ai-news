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
export type RunScope = z.infer<typeof StartRunRequestSchema>["scope"];
type StartRunResponse = z.infer<typeof StartRunResponseSchema>;

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; body: unknown };

// Same-origin fetch. Never throws: an HTTP error status and a network error
// are results too (status 0 for no answer).
async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      ...(method === "POST" ? { headers: { "content-type": "application/json" } } : {}),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    return { ok: false, status: 0, body: null };
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
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
};

// The `error` field of an error body, if it has one.
export function errorOf(body: unknown): string | undefined {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") return body.error;
  return undefined;
}
