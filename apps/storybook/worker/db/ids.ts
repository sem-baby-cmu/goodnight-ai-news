import { v7 } from "uuid";
import type { HeadKey, RevisionKind } from "./schema";

// A new system ID: lower-case UUID version 7 (ADR 0007).
export function newId(): string {
  return v7();
}

// callId = lower-case hex SHA-256 of JSON.stringify([runId, step, pageId, purpose])
// (design "3. Calls, revisions, and heads"). `pageId` is "" for story-level steps.
export async function makeCallId(
  runId: string,
  step: string,
  pageId: string,
  purpose: "first" | "repair",
): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify([runId, step, pageId, purpose]));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

// The heads map key of a revision kind. Page kinds need `pageId`.
export function headKey(kind: RevisionKind, pageId?: string): HeadKey {
  if (kind === "source" || kind === "outline") return kind;
  if (!pageId) throw new Error(`head key "${kind}" needs a pageId`);
  return `${kind}:${pageId}`;
}
