// A release never changes, so its files are cached for a year.
export const IMMUTABLE = "public, max-age=31536000, immutable";

export function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

// Serves one R2 object. A `Range` request gets 206 with `Content-Range`, so
// `<audio>` can seek. A 404 is never cached.
export async function serveR2Object(bucket: R2Bucket, key: string, request: Request, cacheControl: string): Promise<Response> {
  const ranged = request.headers.has("Range");
  let obj: R2ObjectBody | null;
  try {
    obj = await bucket.get(key, { range: request.headers });
  } catch {
    const head = await bucket.head(key);
    if (!head) return notFound();
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${head.size}`, "Cache-Control": "no-store" } });
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
    headers.set("Content-Range", `bytes ${start}-${start + length - 1}/${obj.size}`);
    headers.set("Content-Length", String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  return new Response(obj.body, { status: 200, headers });
}
