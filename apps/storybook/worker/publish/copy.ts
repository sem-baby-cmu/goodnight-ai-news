// Copies for publish. Each object is read whole with `arrayBuffer()` (assets
// and page audio are small) and written with its HTTP metadata.

// Copies one object. A missing source throws: publish must not skip a file.
export async function copyObject(bucket: R2Bucket, src: string, dest: string): Promise<void> {
  const obj = await bucket.get(src);
  if (!obj) throw new Error(`copy source missing: ${src}`);
  await bucket.put(dest, await obj.arrayBuffer(), { httpMetadata: obj.httpMetadata });
}

// Runs `fn` on every item, with at most `limit` calls in flight.
export async function inPool<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// At most 4 copies in flight (a Worker may hold 6 open connections).
export const COPY_CONCURRENCY = 4;
