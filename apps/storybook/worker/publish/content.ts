import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { release } from "../db/schema";
import { IMMUTABLE, notFound, serveR2Object } from "./serve";

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// The rest of the path after `/content/releases/<releaseId>/`, decoded, or
// null when it is empty or could leave the release prefix.
function releasePath(pathname: string, releaseId: string): string | null {
  const head = `/content/releases/${releaseId}/`;
  if (!pathname.startsWith(head)) return null;
  let rest: string;
  try {
    rest = decodeURIComponent(pathname.slice(head.length));
  } catch {
    return null;
  }
  if (rest === "" || rest.includes("\\")) return null;
  if (rest.split("/").some((s) => s === "." || s === "..")) return null;
  return rest;
}

// GET /content/releases/:releaseId/* — public. Serves a file of a release
// only when the release row exists, so the prefix of a failed publish is
// never served.
export async function handleContent(c: Context<{ Bindings: Env }>): Promise<Response> {
  const releaseId = c.req.param("releaseId") ?? "";
  if (!UUID_V7.test(releaseId)) return notFound();
  const rest = releasePath(new URL(c.req.url).pathname, releaseId);
  if (rest === null) return notFound();
  const [row] = await getDb(c.env.DB).select({ id: release.id }).from(release).where(eq(release.id, releaseId));
  if (!row) return notFound();
  return serveR2Object(c.env.BUCKET, `releases/${releaseId}/${rest}`, c.req.raw, IMMUTABLE);
}
