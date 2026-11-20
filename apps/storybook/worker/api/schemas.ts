import { AssetManifestSchema, LayerSchema, PageSceneSchema } from "@storybook/dsl";
import { z } from "zod";

// Request and response schemas of the Studio API (#19, "Exact changes" 2).
// #23 and #24 import them and use `z.infer` for their types (R18).

export const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const uuid = z.string().regex(UUID_V7);
const iso = z.string().datetime();

const RUN_STATUS = z.enum(["queued", "running", "draft_ready", "needs_review", "failed"]);
const TARGET = z.enum(["page_text", "scene", "audio"]);
const REASON = z.enum(["missing", "needs_review", "stale"]);

// ---- Requests ----

export const CreateStoryRequestSchema = z.union([
  z.object({ text: z.string().min(1).max(200_000) }).strict(),
  z.object({ url: z.string().url().max(2048) }).strict(),
]);

// `text` is checked by `PageTextSchema` after the `basedOn` check, so an old
// `basedOn` gives 409 whatever the text is (review of PR #52).
export const PutTextRequestSchema = z.object({ text: z.string(), basedOn: uuid }).strict();

export const PutSceneRequestSchema = z.object({ scene: z.unknown(), basedOn: uuid.nullable() }).strict();

export const StillFitsRequestSchema = z.object({ basedOn: uuid, textBasedOn: uuid }).strict();

export const StartRunRequestSchema = z
  .object({
    scope: z.union([
      z.object({ kind: z.literal("page"), pageId: uuid, target: z.enum(["scene", "audio"]) }).strict(),
      z.object({ kind: z.literal("full") }).strict(),
    ]),
  })
  .strict();

// `PageSceneSchema` with an optional `instanceId` (R41). The ID is any
// string here: an ID that is not a layer of the `basedOn` revision, a
// malformed one included, is refused as `unknown_instance` (EDT-03.S20).
export const OperatorLayerSchema = LayerSchema.extend({ instanceId: z.string().optional() });
export const OperatorSceneSchema = PageSceneSchema.extend({ layers: z.array(OperatorLayerSchema).min(1) });

// POST /api/studio/stories/:id/withdrawal (ADR 0017 decision 20).
export const WithdrawalRequestSchema = z.object({ releaseId: uuid }).strict();

// ---- Responses ----

export const ErrorSchema = z.object({ error: z.string() }).passthrough();

export const RevisionViewSchema = z.object({
  id: uuid,
  kind: z.enum(["source", "outline", "page_text", "scene", "audio"]),
  pageId: z.string(),
  status: z.enum(["ok", "needs_review", "superseded"]),
  origin: z.enum(["ai", "human"]),
  content: z.unknown(),
  error: z.unknown().nullable(),
  basis: z.record(z.string(), uuid),
  assetVersions: z.record(z.string(), z.number().int()).nullable(),
  createdAt: iso,
  fileUrl: z.string().nullable(),
});

export const PageProblemSchema = z.object({ target: TARGET, reason: REASON });

export const BlockingItemSchema = z.object({
  pageId: uuid.nullable(),
  page: z.number().int().nullable(),
  target: z.enum(["outline", "page_text", "scene", "audio"]),
  reason: REASON,
  message: z.string(),
});

export const CreateStoryResponseSchema = z.object({ storyId: uuid, runId: uuid, words: z.number().int(), truncated: z.boolean() });

export const SourceRejectedSchema = z.object({
  error: z.literal("source_rejected"),
  reason: z.enum(["url_scheme", "too_many_redirects", "fetch_failed", "timeout", "text_too_short"]),
  words: z.number().int().optional(),
});

// `storyId` is set by `POST /stories`; `POST /runs` answers with `runId` only.
export const WorkflowUnavailableSchema = z.object({ error: z.literal("workflow_unavailable"), storyId: uuid.optional(), runId: uuid });

export const StoryListResponseSchema = z.object({
  stories: z.array(
    z.object({
      id: uuid,
      title: z.string().nullable(),
      status: z.enum(["draft", "published"]),
      createdAt: iso,
      publishedReleaseId: uuid.nullable(),
      onShelf: z.boolean(),
      // The number of the pointer's release; null for no pointer or a broken one.
      publishedReleaseNumber: z.number().int().nullable(),
      // The status of the latest run, as `latestRun` of GET /stories/:id (#71).
      latestRunStatus: RUN_STATUS.nullable(),
      // The number of pages in each page state (design "Staleness").
      pageCounts: z.object({
        ok: z.number().int(),
        stale: z.number().int(),
        needs_review: z.number().int(),
        missing: z.number().int(),
      }),
      // The time of the last change (design "6. API").
      updatedAt: iso,
    }),
  ),
});

export const StoryDetailResponseSchema = z.object({
  story: z.object({
    id: uuid,
    title: z.string().nullable(),
    status: z.enum(["draft", "published"]),
    headsVersion: z.number().int(),
    publishedReleaseId: uuid.nullable(),
    onShelf: z.boolean(),
    createdAt: iso,
  }),
  heads: z.record(z.string(), uuid),
  source: RevisionViewSchema,
  pages: z.array(
    z.object({
      pageId: uuid,
      number: z.number().int(),
      beat: z.string(),
      state: z.enum(["ok", "stale", "missing", "needs_review"]),
      problems: z.array(PageProblemSchema),
      text: RevisionViewSchema.nullable(),
      scene: RevisionViewSchema.nullable(),
      audio: RevisionViewSchema.nullable(),
    }),
  ),
  releases: z.array(z.object({ id: uuid, number: z.number().int(), createdAt: iso, withdrawn: z.boolean() })),
  latestRun: z.object({ id: uuid, status: RUN_STATUS, scope: z.unknown(), error: z.unknown().nullable() }).nullable(),
});

export const RunResponseSchema = z.object({
  run: z.object({
    id: uuid,
    storyId: uuid,
    scope: z.unknown(),
    status: RUN_STATUS,
    error: z.unknown().nullable(),
    createdAt: iso,
    finishedAt: iso.nullable(),
    workflowStatus: z.string().nullable(),
  }),
  steps: z.array(z.object({ step: z.string(), state: z.enum(["pending", "done", "failed"]) })),
});

export const RevisionResponseSchema = z.object({ revision: RevisionViewSchema });

export const HeadMovedSchema = z.object({ error: z.literal("head_moved"), current: RevisionViewSchema.nullable() });

export const StartRunResponseSchema = z.object({ runId: uuid });

// A page run while a run of the story is queued or running (amendment R61).
export const RunActiveSchema = z.object({ error: z.literal("run_active"), runId: uuid });

// The head compare-and-set loop gave up; the operator can retry (amendment R58).
export const BusySchema = z.object({ error: z.literal("busy") });

export const ReleaseCreatedSchema = z.object({
  releaseId: uuid,
  number: z.number().int(),
  manifestUrl: z.string(),
  playerUrl: z.string(),
});

export const WithdrawalResponseSchema = z.object({ storyId: uuid, releaseId: uuid, withdrawnThrough: z.number().int() });

// The pointer names another release than the one in the request.
export const ReleaseMovedSchema = z.object({ error: z.literal("release_moved"), current: uuid });

// The story has no published release.
export const NotPublishedSchema = z.object({ error: z.literal("not_published") });

export const PublishBlockedSchema = z.object({ error: z.literal("publish_blocked"), blocking: z.array(BlockingItemSchema) });

export const RegistryResponseSchema = z.object({
  assets: z.array(
    z.object({
      key: z.string(),
      kind: z.enum(["character", "prop", "scenery", "backdrop", "sfx"]),
      name: z.string(),
      version: z.number().int(),
      renderer: z.enum(["svg-rig", "svg", "webp", "audio"]),
      manifest: AssetManifestSchema,
      base: z.string(),
    }),
  ),
  templates: z.array(z.unknown()),
});

// GET /api/shelf (ADR 0017). The Player (#77) imports it.
export const ShelfResponseSchema = z
  .object({ books: z.array(z.object({ releaseId: uuid, title: z.string(), publishedAt: iso }).strict()) })
  .strict();

export type RevisionView = z.infer<typeof RevisionViewSchema>;
export type RunStep = z.infer<typeof RunResponseSchema>["steps"][number];
export type ShelfResponse = z.infer<typeof ShelfResponseSchema>;
