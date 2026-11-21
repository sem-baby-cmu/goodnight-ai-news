# ADR 0015: Reset to a TypeScript storybook compiler MVP on Cloudflare

- Status: Accepted
- Date: 2026-11-19
- Revised: 2026-11-19. The Durable Workflow row now names both end states of a
  run, as the design does since revision 2. The decision (no `waitForEvent`)
  does not change (#34).
- Revised: 2026-11-19. Owner decision Q7: TTS does not go through OpenRouter.
  The "One model adapter" rule and the open TTS question in "Consequences"
  are corrected (#32).
- Amended: 2026-11-21 by [ADR 0018](0018-json-generation-via-ai-gateway-compat.md).
  In production, JSON generation goes through the AI Gateway `/compat`
  endpoint to the provider that the model ID names, not to OpenRouter.
- Decided by: Jinyu Liu (owner of all technical decisions for the MVP)
- Detail: [`docs/specs/storybook-mvp/`](../specs/storybook-mvp/requirements.md)
- Supersedes: ADR 0003, 0004, 0005, 0006, 0012, 0014

## Context

- The work so far is a set of separate Python prototypes. They do not run on
  Cloudflare and do not share one architecture.
- Producer tested full-page AI illustrations. The style is good. The problem is
  that a flat image cannot be animated, and its characters cannot react to a
  tap.
- Producer has painted character boards for 13 characters and 5 prop boards.
  The boards are RGB PNG sheets with no alpha channel (1086 × 1448 for the
  robot board). They have paper texture, contact shadows, and limbs that cover
  other limbs.
- The near-term goal is a short MVP that proves the product: news text in, an
  interactive storybook out.

## Decision

Rewrite the product from zero in TypeScript on Cloudflare. Keep only the
Producer character design and visual style. Build five parts:

| Part | Decision |
| :-- | :-- |
| Durable Workflow | One Cloudflare Workflow instance per production run. Scope is the full story or one page target (scene or audio). Steps: freeze inputs, script, page scenes, layout, narration, assemble. Steps pass IDs and R2 keys only. No `waitForEvent`: a run ends at `draft_ready` or `needs_review`. |
| Storybook DSL | zod schemas, independent of the renderer. A page has narration, a background, layers, animations from a closed list, and tap interactions from a closed list. Each layer has its own `instanceId`. |
| Asset pipeline and registry | All 13 characters and their props are rows in D1, with versioned files in R2. Each character declares its renderer (`svg-rig`, `svg`, or `webp`), legal pose and expression pairs, anchor, foot line, and whether it can flip. Pip starts as a rigged SVG (parts for blink, wave, expressions). The other characters start as transparent WebP cut-outs and move to SVG one at a time. |
| Studio | React app behind Cloudflare Access. Run progress, page editor, save as a new revision, regenerate one page target, publish. |
| Player | React app. Renders a release with DOM, inline SVG or WebP, and the Web Animations API. Narration text is HTML. |

Rules that hold from the first version:

- **Models choose, code places.** The model picks a layout template and puts
  registry IDs into its slots. Code computes positions, layers, and the text
  safe zone, and checks for overlap. The JSON schema for the model is built at
  run time from the frozen registry version.
- **Failure goes to a person.** After one repair, a page that still fails is
  marked `needs_review` with its error and candidate. The run never drops a
  layer or swaps a character on its own.
- **Immutable revisions.** Each stage output is a new, append-only revision
  row. The story row holds a `heads` map of current revisions and a
  `heads_version`. The map changes only by compare-and-set. Each model call ID
  stores its result once in `call_log`, so a retried step does not call the
  model again for a stored result. (Changed in design revision 2 after the
  cross-family design review.)
- **Staleness by basis.** Each revision records the revision IDs it was made
  from. A revision is stale when one of them is no longer the current head.
  There is no general dependency graph.
- **Immutable releases.** Publish takes one snapshot of the heads, writes a new
  R2 prefix with the manifest, page JSON, audio, and copies of the asset
  versions in use, and then updates the release pointer.
- **One model adapter.** OpenAI-compatible API for JSON generation.
  Production goes through AI Gateway to OpenRouter. Development uses a local
  proxy. TTS is Gemini 3.8 Flash TTS. It does not go through OpenRouter: in
  development the adapter calls Google AI Studio directly, and on Cloudflare
  it goes through AI Gateway (`google-ai-studio`).
  Amended by ADR 0018: production JSON generation uses the AI Gateway
  `/compat` endpoint, not OpenRouter.

## Reasons

- A layered scene keeps the liked style and makes characters move and react,
  which a flat image cannot do.
- Reusing fixed character assets makes every page on-model by construction,
  and no image is generated at run time.
- Two outside reviews (Codex, Gemini, 2026-11-19) both found that tracing all
  boards into SVG is the wrong first step: tracing loses the texture or makes
  very large paths, and it cannot restore covered limbs. SVG stays the target,
  but only for characters that have been cleaned up by hand.
- DOM with SVG suits the flat paper-cut style (the owner's research report says
  the same). It gives hit testing, accessibility, and editor handles for free.
  Each page has few layers, so a GPU renderer is not needed.
- The workflow and revision rules make retries safe, which the Workflows
  documentation requires.

## Alternatives considered

| Option | Why not |
| :-- | :-- |
| Keep the earlier ADR set and port the Python prototypes | The prototypes do not share one design, and the code-drawn scenes do not match the Producer style. |
| Full-page AI images per page | Cannot be animated or tapped. |
| Layered raster with PixiJS, SAM 2, and Depth Anything (research report's MVP) | Builds on runtime image generation, and segmentation and depth models need GPU services outside Workers. |
| Trace all 13 boards into SVG now | Loses texture or makes very large files; covered limbs cannot be restored; the hand clean-up does not fit the MVP time. |
| Rive characters | Strong state machines, but export without a splash needs a paid plan, and rigging is manual. Kept as a later renderer option in the DSL. |
| Wait for a human review inside the workflow (`waitForEvent`) | Keeps a run open for days. A short publish API is simpler. |
| General dependency graph for staleness | More than the MVP needs. A hash compare per page covers the edit cases. |

## Consequences

- The earlier ADRs 0003, 0004, 0005, 0006, 0012, and 0014 are superseded.
- ADRs 0002, 0007, 0008, 0009, 0010, 0011, and 0013 still apply.
- The team's Python prototypes stay in the repository as history. New code
  does not depend on them.
- Spike S1 (asset feasibility) runs first. If the rigged SVG for Pip fails its
  pass criteria, Pip also starts as WebP. The DSL and renderer do not change.
- Closed (owner decision Q7, 2026-11-19): TTS does not go through
  OpenRouter. In development, the adapter calls Google AI Studio directly
  (`https://generativelanguage.googleapis.com/v1beta`). On Cloudflare, it goes
  through AI Gateway
  (`https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/google-ai-studio/v1beta`).
  TB0 (#25) still records the audio content type that the gateway returns.
