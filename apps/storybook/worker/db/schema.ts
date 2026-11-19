import type { AssetManifest, Issue, RegistrySnapshot } from "@storybook/dsl";
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// D1 tables (design "Data Models > D1 tables"). Enums are TypeScript-only:
// every write goes through the typed functions in this folder.
// Timestamps are ISO 8601 UTC strings, set by code.

export type RevisionKind = "source" | "outline" | "page_text" | "scene" | "audio";
export type RevisionStatus = "ok" | "needs_review" | "superseded";
export type HeadKey = "source" | "outline" | `page_text:${string}` | `scene:${string}` | `audio:${string}`;
// Head key -> revision ID.
export type Heads = Partial<Record<HeadKey, string>>;
// Head key -> the head that a step or an edit expects before it moves the
// key; null means "no head yet" (implementation decision R58).
export type ExpectedHeads = Partial<Record<HeadKey, string | null>>;
export type RunScope = { kind: "full" } | { kind: "page"; pageId: string; target: "scene" | "audio" };
export type RunStatus = "queued" | "running" | "draft_ready" | "needs_review" | "failed";
export type SourceContent = { text: string; url: string | null; words: number; truncated: boolean };
export type ErrorRecord = {
  runId: string;
  storyId: string;
  pageId: string | null;
  step: string;
  providerStatus: number | null;
  message: string;
  issues?: Issue[];
};
export type RunError = { errors: ErrorRecord[] };

const ASSET_KINDS = ["character", "prop", "scenery", "sfx"] as const;
const RENDERERS = ["svg-rig", "svg", "webp", "audio"] as const;
const RUN_STATUSES = ["queued", "running", "draft_ready", "needs_review", "failed"] as const satisfies readonly RunStatus[];
const REVISION_KINDS = ["source", "outline", "page_text", "scene", "audio"] as const satisfies readonly RevisionKind[];
const REVISION_STATUSES = ["ok", "needs_review", "superseded"] as const satisfies readonly RevisionStatus[];

const createdAt = () => text("created_at").notNull();

export const asset = sqliteTable(
  "asset",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    kind: text("kind", { enum: ASSET_KINDS }).notNull(),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("asset_key_uq").on(t.key)],
);

export const assetVersion = sqliteTable(
  "asset_version",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id")
      .notNull()
      .references(() => asset.id),
    version: integer("version").notNull(),
    renderer: text("renderer", { enum: RENDERERS }).notNull(),
    manifest: text("manifest", { mode: "json" }).$type<AssetManifest>().notNull(),
    // `assets/<key>/v<version>/`, with a trailing slash.
    r2Prefix: text("r2_prefix").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("asset_version_uq").on(t.assetId, t.version),
    // One active version per asset.
    uniqueIndex("asset_version_active_uq")
      .on(t.assetId)
      .where(sql`active = 1`),
  ],
);

export const story = sqliteTable("story", {
  id: text("id").primaryKey(),
  // Null until the script step.
  title: text("title"),
  status: text("status", { enum: ["draft", "published"] }).notNull(),
  heads: text("heads", { mode: "json" }).$type<Heads>().notNull(),
  headsVersion: integer("heads_version").notNull().default(0),
  // No foreign key: it would make a cycle with `release`.
  publishedReleaseId: text("published_release_id"),
  createdAt: createdAt(),
});

export const run = sqliteTable(
  "run",
  {
    id: text("id").primaryKey(),
    storyId: text("story_id")
      .notNull()
      .references(() => story.id),
    scope: text("scope", { mode: "json" }).$type<RunScope>().notNull(),
    status: text("status", { enum: RUN_STATUSES }).notNull(),
    // Null until the `freeze` step.
    basis: text("basis", { mode: "json" }).$type<Heads>(),
    registry: text("registry", { mode: "json" }).$type<RegistrySnapshot>(),
    workflowInstanceId: text("workflow_instance_id"),
    error: text("error", { mode: "json" }).$type<RunError>(),
    createdAt: createdAt(),
    finishedAt: text("finished_at"),
  },
  (t) => [index("run_story_idx").on(t.storyId)],
);

export const callLog = sqliteTable(
  "call_log",
  {
    callId: text("call_id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => run.id),
    step: text("step").notNull(),
    pageId: text("page_id").notNull().default(""),
    purpose: text("purpose", { enum: ["first", "repair"] }).notNull(),
    result: text("result", { mode: "json" }).$type<unknown>(),
    r2Key: text("r2_key"),
    // Read at the first attempt; a retry reuses it.
    basis: text("basis", { mode: "json" }).$type<Heads>().notNull(),
    // The heads of the target keys when the basis was read; a retry reuses it.
    expectedHeads: text("expected_heads", { mode: "json" }).$type<ExpectedHeads>().notNull(),
    model: text("model").notNull(),
    usage: text("usage", { mode: "json" }).$type<unknown>(),
    createdAt: createdAt(),
  },
  (t) => [index("call_log_run_idx").on(t.runId, t.step)],
);

export const revision = sqliteTable(
  "revision",
  {
    id: text("id").primaryKey(),
    storyId: text("story_id")
      .notNull()
      .references(() => story.id),
    kind: text("kind", { enum: REVISION_KINDS }).notNull(),
    pageId: text("page_id").notNull().default(""),
    content: text("content", { mode: "json" }).$type<unknown>(),
    r2Key: text("r2_key"),
    basis: text("basis", { mode: "json" }).$type<Heads>().notNull(),
    // Scene only: asset key -> registry version.
    assetVersions: text("asset_versions", { mode: "json" }).$type<Record<string, number>>(),
    origin: text("origin", { enum: ["ai", "human"] }).notNull(),
    // Null for a human revision.
    callId: text("call_id").references(() => callLog.callId),
    status: text("status", { enum: REVISION_STATUSES }).notNull(),
    error: text("error", { mode: "json" }).$type<unknown>(),
    createdAt: createdAt(),
  },
  (t) => [
    // Plain unique index: SQLite treats every NULL as distinct, so human
    // revisions (call_id null) never conflict. No partial WHERE.
    uniqueIndex("revision_call_uq").on(t.callId, t.kind, t.pageId),
    index("revision_story_idx").on(t.storyId, t.kind, t.pageId),
  ],
);

export const release = sqliteTable(
  "release",
  {
    id: text("id").primaryKey(),
    storyId: text("story_id")
      .notNull()
      .references(() => story.id),
    number: integer("number").notNull(),
    manifestKey: text("manifest_key").notNull(),
    snapshot: text("snapshot", { mode: "json" }).$type<{ heads: Heads; headsVersion: number }>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("release_story_number_uq").on(t.storyId, t.number)],
);

export type StoryRow = typeof story.$inferSelect;
export type RunRow = typeof run.$inferSelect;
export type CallRow = typeof callLog.$inferSelect;
export type NewCallRow = typeof callLog.$inferInsert;
export type RevisionRow = typeof revision.$inferSelect;
type RevisionInsert = typeof revision.$inferInsert;
// `insertRevisions` sets `id` and `createdAt` when the caller leaves them out.
export type NewRevision = Omit<RevisionInsert, "id" | "createdAt"> & Partial<Pick<RevisionInsert, "id" | "createdAt">>;
