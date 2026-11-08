# ADR 0002: Run on Cloudflare, Workers Paid plan

- Status: Accepted
- Date: 2026-11-08
- Decided by: Jinyu Liu (Integration)
- Detail: [`integration/architecture.md`](../../integration/architecture.md) D1, sections 6 and 7

## Context

The prototypes are Python scripts on laptops. The product needs a daily run, a
reader on the web, storage for audio and images, and model calls with cost
logs. The team chose the Cloudflare platform. Cloudflare has a Free and a Paid
(USD 5 a month) Workers plan with different limits.

## Decision

Use Cloudflare Workers Paid, on the account `simon`. Free is for demos only.

## Reasons

Limits checked in the Cloudflare documentation on 2026-11-08:

| Limit | Free | Paid |
| :-- | :-- | :-- |
| CPU per invocation | 10 ms | 30 s default, up to 5 min; cron at 1 h or longer: 15 min |
| External subrequests | 50 | 10,000 default |
| Queue message retention | 24 h, fixed | 4 days default, up to 14 |
| Containers | not available | available |

- Waiting for a model is not CPU time, but parsing feeds, building 20 SVG
  pages, and checking JSON can pass 10 ms.
- One story makes more than 50 subrequests (model calls, D1, R2).

## Alternatives considered

| Option | Why not |
| :-- | :-- |
| Workers Free | 10 ms CPU and 50 subrequests are too small for one story. |
| Keep Python on a laptop or a VM | No daily run without a person; no hosted reader. |
| Python Workers (Pyodide) | Playwright, Pillow, and ffmpeg do not run there. Port to TypeScript instead (ADR 0010). |
| Another cloud (for example AWS Lambda) | The team chose Cloudflare; one vendor gives Workers, D1, R2, Workflows, and AI Gateway together. |

## Consequences

- Cost: USD 5 a month plus use.
- The vertical video was dropped by Producer on 2026-11-08, so no stage needs
  ffmpeg or Containers.
