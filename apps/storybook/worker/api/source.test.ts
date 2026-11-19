import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb, run, story } from "../db";
import { app } from "./app";
import { SourceRejectedSchema } from "./schemas";
import {
  FETCH_TIMEOUT_MS,
  MAX_BODY_BYTES,
  MAX_REDIRECTS,
  MAX_WORDS,
  MIN_WORDS,
  extractArticleText,
  fetchArticleText,
  limitWords,
} from "./source";

afterEach(() => {
  vi.restoreAllMocks();
});

const words = (n: number, prefix = "word") => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ");
const article = (text: string) => `<html><body><article><p>${text}</p></article></body></html>`;
const html = (body: string) => new Response(body, { status: 200, headers: { "content-type": "text/html" } });
const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } });
const urlOf = (input: unknown) => (input instanceof Request ? input.url : String(input));

describe("URL input", () => {
  it("URL input: redirect chain of 4 is refused", async () => {
    let n = 0;
    const fake = vi.fn(async () => redirect(`https://news.test/hop-${++n}`));
    const result = await fetchArticleText("https://news.test/hop-0", { fetch: fake as unknown as typeof fetch });
    expect(MAX_REDIRECTS).toBe(3);
    expect(result).toEqual({ ok: false, reason: "too_many_redirects" });
    expect(fake).toHaveBeenCalledTimes(4);
  });

  it("URL input: a chain of 3 redirects is followed", async () => {
    const statuses = [301, 307, 308];
    let n = 0;
    const fake = vi.fn(async () => {
      const hop = n++;
      return hop < 3 ? redirect(`/hop-${hop + 1}`, statuses[hop]) : html(article("The bear hears the news."));
    });
    const result = await fetchArticleText("https://news.test/hop-0", { fetch: fake as unknown as typeof fetch });
    expect(result).toMatchObject({ ok: true, text: "The bear hears the news.", finalUrl: "https://news.test/hop-3", cut: false });
    expect(fake).toHaveBeenCalledTimes(4);
    expect(fake.mock.calls.map((c: unknown[]) => urlOf(c[0]))).toEqual([
      "https://news.test/hop-0",
      "https://news.test/hop-1",
      "https://news.test/hop-2",
      "https://news.test/hop-3",
    ]);
  });

  it("URL input: a redirect to ftp is refused", async () => {
    const fake = vi.fn(async () => redirect("ftp://files.test/article.txt"));
    const result = await fetchArticleText("https://news.test/a", { fetch: fake as unknown as typeof fetch });
    expect(result).toEqual({ ok: false, reason: "url_scheme" });
    expect(fake).toHaveBeenCalledTimes(1);
    expect(fake.mock.calls.some((c: unknown[]) => urlOf(c[0]).startsWith("ftp:"))).toBe(false);
  });

  it("RUN-02.S5 URL input: a 3 MB body is cut at 2 MB", async () => {
    const chunk = new TextEncoder().encode(`<p>${"a ".repeat(49_998)}</p>`.padEnd(100_000, " ").slice(0, 100_000));
    expect(chunk.byteLength).toBe(100_000);
    let sent = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 3_000_000) return controller.close();
        sent += chunk.byteLength;
        controller.enqueue(chunk.slice());
      },
      cancel() {
        cancelled = true;
      },
    });
    const fake = vi.fn(async () => new Response(body, { status: 200, headers: { "content-type": "text/html" } }));
    const result = await fetchArticleText("https://news.test/big", { fetch: fake as unknown as typeof fetch });
    expect(MAX_BODY_BYTES).toBe(2_000_000);
    expect(result).toMatchObject({ ok: true, cut: true, bytesRead: 2_000_000 });
    expect(cancelled).toBe(true);
    expect(sent).toBeLessThan(3_000_000);
  });

  it("URL input: timeout after 10 s", async () => {
    const fake = vi.fn(() => new Promise<Response>(() => {}));
    const result = await fetchArticleText("https://news.test/slow", { fetch: fake as unknown as typeof fetch, timeoutMs: 50 });
    expect(result).toEqual({ ok: false, reason: "timeout" });
    expect(FETCH_TIMEOUT_MS).toBe(10_000);
  });

  it("RUN-02.S6 URL input: a short article returns 422", async () => {
    const create = vi.fn(async () => ({}));
    const e = { ...env, STORY_RUN: { create, get: env.STORY_RUN.get.bind(env.STORY_RUN) } as unknown as Env["STORY_RUN"] } as Env;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => html(article(words(150))));
    const db = getDb(env.DB);
    const before = { stories: await db.$count(story), runs: await db.$count(run) };
    const res = await app.request(
      "/api/studio/stories",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://news.test/short" }) },
      e,
    );
    expect(res.status).toBe(422);
    expect(SourceRejectedSchema.parse(await res.json())).toEqual({ error: "source_rejected", reason: "text_too_short", words: 150 });
    expect({ stories: await db.$count(story), runs: await db.$count(run) }).toEqual(before);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("extractArticleText", () => {
  it("extractArticleText: reads only p inside article or main, once each", async () => {
    const page = [
      "<html><head><title>Title text</title></head><body>",
      "<p>Outside before.</p>",
      "<header><p>Header text.</p></header>",
      "<main><article><p>First &amp; one.</p><p>Second   <b>bold</b>\n line &#39;quoted&#39; &#x41;&nbsp;B &lt;C&gt; &quot;D&quot; &#69;.</p></article>",
      "<p>Main only.</p></main>",
      "<article><p>Lone article.</p><div><p>Nested in div.</p></div><p>   </p></article>",
      "<footer><p>Footer.</p></footer>",
      "</body></html>",
    ].join("");
    const text = await extractArticleText(page);
    expect(text).toBe(
      ["First & one.", `Second bold line 'quoted' A B <C> "D" E.`, "Main only.", "Lone article.", "Nested in div."].join("\n\n"),
    );
  });
});

describe("limitWords", () => {
  it("limitWords: 2,500 words are cut to 2,000 and truncated is true", () => {
    const paragraphs = Array.from({ length: 5 }, (_, i) => words(500, `p${i}w`));
    const result = limitWords(paragraphs.join("\n\n"));
    expect(MIN_WORDS).toBe(200);
    expect(MAX_WORDS).toBe(2000);
    expect(result).toMatchObject({ ok: true, words: 2000, truncated: true });
    if (!result.ok) throw new Error("unreachable");
    expect(result.text.split(/\s+/).filter(Boolean)).toHaveLength(2000);
    expect(result.text).toBe(paragraphs.slice(0, 4).join("\n\n"));
  });
});
