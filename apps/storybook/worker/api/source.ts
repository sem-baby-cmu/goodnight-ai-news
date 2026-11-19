// URL and text input (design "6. API", "URL input" and "Text input").

export const MAX_REDIRECTS = 3;
export const MAX_BODY_BYTES = 2_000_000;
export const FETCH_TIMEOUT_MS = 10_000;
export const MIN_WORDS = 200;
export const MAX_WORDS = 2000;

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const SCHEMES = new Set(["http:", "https:"]);
const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; storybook-mvp/1.0)", accept: "text/html" };

export type FetchResult =
  | { ok: true; text: string; finalUrl: string; bytesRead: number; cut: boolean }
  | { ok: false; reason: "url_scheme" | "too_many_redirects" | "fetch_failed" | "timeout" };

const isTimeout = (err: unknown) => {
  const name = (err as { name?: unknown } | null)?.name;
  return name === "AbortError" || name === "TimeoutError";
};

// Rejects when `signal` aborts, so a fetch or a read that ignores the signal
// still ends at the timeout.
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

// Waits for a cancel, but never past the deadline: a cancel that never
// settles ends at the timeout. A cancel error is ignored.
async function settle(cancel: Promise<void> | undefined, signal: AbortSignal): Promise<void> {
  if (!cancel) return;
  await abortable(cancel.catch(() => {}), signal);
}

// Reads at most MAX_BODY_BYTES of the body.
async function readCapped(res: Response, signal: AbortSignal): Promise<{ bytes: Uint8Array; cut: boolean }> {
  const out = new Uint8Array(MAX_BODY_BYTES);
  let size = 0;
  if (!res.body) return { bytes: out.subarray(0, 0), cut: false };
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) return { bytes: out.subarray(0, size), cut: false };
      const room = MAX_BODY_BYTES - size;
      out.set(value.subarray(0, room), size);
      size += Math.min(room, value.byteLength);
      if (value.byteLength >= room && (value.byteLength > room || size === MAX_BODY_BYTES)) {
        await settle(reader.cancel(), signal);
        return { bytes: out.subarray(0, size), cut: true };
      }
    }
  } catch (err) {
    // Not awaited: the error is the answer, and a cancel may never settle.
    reader.cancel().catch(() => {});
    throw err;
  }
}

// Fetches a news page: http and https only, at most MAX_REDIRECTS redirects
// (each target checked), one timeout for the whole chain and the body.
export async function fetchArticleText(url: string, opts?: { fetch?: typeof fetch; timeoutMs?: number }): Promise<FetchResult> {
  const doFetch = opts?.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    return { ok: false, reason: "url_scheme" };
  }
  if (!SCHEMES.has(current.protocol)) return { ok: false, reason: "url_scheme" };
  const signal = AbortSignal.timeout(opts?.timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    let hops = 0;
    for (;;) {
      const res = await abortable(doFetch(current.toString(), { redirect: "manual", signal, headers: HEADERS }), signal);
      const location = res.headers.get("location");
      if (REDIRECTS.has(res.status) && location !== null) {
        await settle(res.body?.cancel(), signal);
        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          return { ok: false, reason: "fetch_failed" };
        }
        if (!SCHEMES.has(next.protocol)) return { ok: false, reason: "url_scheme" };
        hops++;
        if (hops > MAX_REDIRECTS) return { ok: false, reason: "too_many_redirects" };
        current = next;
        continue;
      }
      if (res.status < 200 || res.status > 299) {
        await settle(res.body?.cancel(), signal);
        return { ok: false, reason: "fetch_failed" };
      }
      const { bytes, cut } = await readCapped(res, signal);
      const html = decodeHtml(bytes, res.headers.get("content-type"));
      const text = await extractArticleText(html);
      return { ok: true, text, finalUrl: current.toString(), bytesRead: bytes.byteLength, cut };
    }
  } catch (err) {
    if (isTimeout(err) || signal.aborted) return { ok: false, reason: "timeout" };
    return { ok: false, reason: "fetch_failed" };
  }
}

const charsetOf = (value: string | null | undefined) => /charset\s*=\s*["']?([^"';\s>]+)/i.exec(value ?? "")?.[1] ?? null;

// The charset from the Content-Type header, else from a meta tag in the
// first 1024 bytes, else UTF-8. An unknown label falls back to UTF-8
// (`TextDecoder` throws RangeError on it). Decoding is never fatal.
export function decodeHtml(bytes: Uint8Array, contentType: string | null): string {
  let label = charsetOf(contentType);
  if (!label) {
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
    const meta = /<meta\b[^>]*>/gi;
    for (let m = meta.exec(head); m && !label; m = meta.exec(head)) label = charsetOf(m[0]);
  }
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(label ?? "utf-8");
  } catch {
    decoder = new TextDecoder("utf-8");
  }
  return decoder.decode(bytes);
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|nbsp);/g, (whole, name: string) => {
    if (name in NAMED) return NAMED[name]!;
    const code = name.startsWith("#x") ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

// The text of the `p` elements inside `article` or `main`, each once.
// Rejected: a selector `article p, main p`; a `p` inside `main > article`
// would match twice.
export async function extractArticleText(html: string): Promise<string> {
  let depth = 0;
  const paragraphs: string[] = [];
  const rewriter = new HTMLRewriter()
    .on("article, main", {
      element(el) {
        depth++;
        el.onEndTag(() => {
          depth--;
        });
      },
    })
    .on("p", {
      element() {
        if (depth > 0) paragraphs.push("");
      },
      text(chunk) {
        if (depth > 0 && paragraphs.length > 0) paragraphs[paragraphs.length - 1] += chunk.text;
      },
    });
  await rewriter.transform(new Response(html)).arrayBuffer();
  return paragraphs
    .map((p) => decodeEntities(p).replace(/\s+/g, " ").trim())
    .filter((p) => p !== "")
    .join("\n\n");
}

export type LimitResult = { ok: true; text: string; words: number; truncated: boolean } | { ok: false; reason: "text_too_short"; words: number };

// The word rule for pasted and fetched text. A cut keeps the white space,
// so paragraph breaks stay.
export function limitWords(text: string): LimitResult {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < MIN_WORDS) return { ok: false, reason: "text_too_short", words };
  if (words <= MAX_WORDS) return { ok: true, text, words, truncated: false };
  let seen = 0;
  let end = 0;
  for (const match of text.matchAll(/\S+/g)) {
    seen++;
    end = match.index + match[0].length;
    if (seen === MAX_WORDS) break;
  }
  return { ok: true, text: text.slice(0, end), words: MAX_WORDS, truncated: true };
}
