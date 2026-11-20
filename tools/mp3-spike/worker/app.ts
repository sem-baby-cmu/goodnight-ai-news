import { speechLikePcm } from "../src/fixture";
import { RATE } from "../src/candidates";
import type { Encode } from "../src/enc/common";

// The spike Worker (issue #69, exact change 4). No set-up in the global scope:
// each request creates its encoder inside the handler.
//   GET /encode?enc=<id>&kbps=<n>&sec=<n>&runs=<n>  -> timings as JSON
//   GET /mp3?enc=<id>&kbps=<n>&sec=<n>              -> the file, audio/mpeg

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function makeWorker(encoders: Record<string, Encode>) {
  return {
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);
      const q = url.searchParams;
      const enc = q.get("enc") ?? "";
      const kbps = Number(q.get("kbps"));
      const sec = Number(q.get("sec"));
      const runs = Number(q.get("runs") ?? "1");
      if (url.pathname !== "/encode" && url.pathname !== "/mp3") return json({ error: "not found" }, 404);
      const encode = encoders[enc];
      if (!encode) return json({ error: `unknown encoder: ${enc}` }, 404);
      if (!(kbps > 0) || !(sec > 0) || !(runs >= 0)) return json({ error: "bad parameters" }, 400);

      const pcm = speechLikePcm(sec, RATE);
      try {
        if (url.pathname === "/mp3") {
          const bytes = await encode(pcm, RATE, kbps);
          return new Response(bytes, { headers: { "content-type": "audio/mpeg" } });
        }
        const runsMs: number[] = [];
        let bytes: Uint8Array<ArrayBuffer> = new Uint8Array(0);
        for (let r = 0; r < runs; r++) {
          const t0 = performance.now();
          bytes = await encode(pcm, RATE, kbps);
          runsMs.push(performance.now() - t0);
        }
        return json({ enc, kbps, sec, runsMs, bytes: bytes.length, sha256: await sha256(bytes) });
      } catch (e) {
        return json({ enc, kbps, sec, error: String(e).slice(0, 200) }, 500);
      }
    },
  };
}
