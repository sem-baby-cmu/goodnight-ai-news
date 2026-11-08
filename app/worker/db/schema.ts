// D1 schema. The tables are integration/architecture.md section 3.
// Every `id` is a UUID v7 string, made in code when a row is inserted.
// After a change here, run `npm run db:generate` to write a new migration.

import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { v7 as uuidv7 } from "uuid";

const id = () => text("id").primaryKey().$defaultFn(() => uuidv7());
const createdAt = () =>
  text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

export const newsItem = sqliteTable("news_item", {
  id: id(),
  runId: text("run_id").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceTitle: text("source_title").notNull(),
  fullText: text("full_text"),
  claims: text("claims", { mode: "json" }),
  confidence: real("confidence"),
  firstRating: text("first_rating"),
  status: text("status", { enum: ["new", "selected", "skipped"] }).notNull().default("new"),
  createdAt: createdAt(),
});

export const story = sqliteTable("story", {
  id: id(),
  newsItemId: text("news_item_id")
    .notNull()
    .references(() => newsItem.id),
  publishDate: text("publish_date"),
  status: text("status", {
    enum: ["drafting", "in_review", "approved", "published", "retired"],
  })
    .notNull()
    .default("drafting"),
  // Points at story_package. Not a foreign key: story_package also points
  // back at story, and the two rows are written at different times.
  publishedPackageId: text("published_package_id"),
  createdAt: createdAt(),
});

export const artifact = sqliteTable(
  "artifact",
  {
    id: id(),
    storyId: text("story_id")
      .notNull()
      .references(() => story.id),
    stage: text("stage", { enum: ["script", "scenes", "voice", "play", "package"] }).notNull(),
    version: integer("version").notNull(),
    generationId: text("generation_id").notNull(),
    inputIds: text("input_ids", { mode: "json" }),
    inputHash: text("input_hash"),
    // One of the two holds the output: small JSON in the row, or an R2 key prefix.
    payload: text("payload", { mode: "json" }),
    r2Prefix: text("r2_prefix"),
    author: text("author", { enum: ["model", "human"] }).notNull(),
    model: text("model"),
    promptVersion: text("prompt_version"),
    costUsd: real("cost_usd"),
    checks: text("checks", { mode: "json" }),
    status: text("status", { enum: ["passed", "failed", "approved", "rejected"] }).notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("artifact_story_stage_version").on(t.storyId, t.stage, t.version),
    unique("artifact_generation_id").on(t.generationId),
  ],
);

export const review = sqliteTable("review", {
  id: id(),
  artifactId: text("artifact_id")
    .notNull()
    .references(() => artifact.id),
  reviewer: text("reviewer").notNull(),
  action: text("action", { enum: ["approve", "reject", "edit", "regenerate"] }).notNull(),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const storyPackage = sqliteTable("story_package", {
  id: id(),
  storyId: text("story_id")
    .notNull()
    .references(() => story.id),
  version: integer("version").notNull(),
  manifest: text("manifest", { mode: "json" }).notNull(),
  inputIds: text("input_ids", { mode: "json" }),
  createdAt: createdAt(),
  approvedBy: text("approved_by"),
  approvedAt: text("approved_at"),
});
