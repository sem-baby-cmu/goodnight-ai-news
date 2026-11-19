// A release never changes, so its files are cached for a year.
export const IMMUTABLE = "public, max-age=31536000, immutable";

export function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

function unsatisfiable(size: number): Response {
  return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, "Cache-Control": "no-store" } });
}

// The first byte of a `bytes=<start>-` range, or 0 for a suffix range.
function requestedStart(request: Request): number {
  const match = /^bytes=(\d+)-/.exec(request.headers.get("Range") ?? "");
  return match ? Number(match[1]) : 0;
}

// R2 reports an unsatisfiable range with error code 10039.
function isRangeError(err: unknown): boolean {
  const message = String((err as { message?: unknown } | null)?.message ?? "");
  return message.includes("10039") || /range.*not satisfiable/i.test(message);
}

// Serves one R2 object. A `Range` request gets 206 with `Content-Range`, so
// `<audio>` can seek. A 404 is never cached.
export async function serveR2Object(bucket: R2Bucket, key: string, request: Request, cacheControl: string): Promise<Response> {
  const ranged = request.headers.has("Range");
  let obj: R2ObjectBody | null;
  try {
    obj = await bucket.get(key, { range: request.headers });
  } catch (err) {
    if (!ranged || !isRangeError(err)) throw err;
    const head = await bucket.head(key);
    return head ? unsatisfiable(head.size) : notFound();
  }
  if (!obj) return notFound();

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("Cache-Control", cacheControl);
  headers.set("Accept-Ranges", "bytes");

  const range = obj.range;
  if (ranged && range) {
    // Check the value, not the key: a runtime can return `suffix: undefined`.
    const suffix = "suffix" in range ? range.suffix : undefined;
    const start = suffix !== undefined ? obj.size - suffix : "offset" in range ? (range.offset ?? 0) : 0;
    const length = suffix !== undefined ? suffix : ("length" in range ? range.length : undefined) ?? obj.size - start;
    // The local runtime ignores a range that starts past the end and returns
    // the whole object, so the requested start is checked too.
    if (length <= 0 || start >= obj.size || requestedStart(request) >= obj.size) return unsatisfiable(obj.size);
    headers.set("Content-Range", `bytes ${start}-${start + length - 1}/${obj.size}`);
    headers.set("Content-Length", String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  return new Response(obj.body, { status: 200, headers });
}
