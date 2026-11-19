# storybook-mvp - Requirements Document

Short-term MVP that turns a pasted news text into an interactive children's
storybook package. TypeScript on Cloudflare: Workflows orchestrate production,
a renderer-agnostic Storybook DSL describes pages, a character registry holds
reusable SVG/WebP assets, a Studio edits and regenerates single pages, and a
Player reads immutable releases.

Decision record: [ADR 0015](../../adr/0015-storybook-mvp-reset.md).

## Goal

Prove the product with real stories, not prove a production system. One
person starts one story at a time from the Studio. The output is a story that a
child can look at, listen to, and touch.

## Scope

| In scope | Out of scope (MVP) |
| :-- | :-- |
| Pasted news text, or a simple fetch of one URL | Fact-checking, source cross-checks |
| One story per click | Daily or scheduled production, cron |
| Story script, page scenes, narration audio | Word-level highlighting |
| Layered, animated, tappable pages | Full-page AI illustrations |
| Character registry with all 13 Producer characters | Content safety and copyright policy |
| Studio: edit, regenerate one page target, publish | User accounts and roles |
| Player: read a published release | Offline mode, PWA, video or EPUB export |

## Core Features

1. **Production run.** The Studio starts a run from a news text. A durable
   workflow makes a story script, one scene per page, and narration audio for
   each page. The result is a draft.
2. **Storybook DSL.** Each page is data: narration, background, layers
   (characters and props), animations, and tap interactions. The DSL does not
   depend on a renderer.
3. **Character registry.** All 13 Producer characters, their props, and their
   poses and expressions are rows in the database with versioned asset files.
   A character can be replaced by a new version without code changes.
4. **Studio.** Shows run progress and every page. The operator can change the
   narration, the layout template, the characters, their pose and expression,
   props, animations, and taps. The operator can regenerate one page scene or
   one page audio. The operator publishes a draft.
5. **Player.** Reads one immutable release. Shows pages with animation, plays
   narration, and responds to taps.

## User Stories

- As the operator, I want to paste a news text and get a draft storybook, so
  that I can test a story with children without manual drawing.
- As the operator, I want to change the text of one page and regenerate only
  that page's audio, so that I keep the parts that are already good.
- As the operator, I want to regenerate the scene of one page, so that I can
  fix one bad page without a new story.
- As the operator, I want to publish a draft as a release that never changes,
  so that what I checked is what a child sees.
- As a child, I want the characters to move and react when I tap them, so that
  the story feels alive.
- As a child, I want to hear each page read aloud, so that I can follow the
  story without reading.
- As the designer, I want to replace a character asset with a new version, so
  that new stories use it and old releases stay the same.

## Acceptance Criteria

- [ ] A pasted news text of 200 to 2,000 words gives a draft of 6 to 8 pages.
- [ ] Each draft page has narration text, one audio file, at least one
      character layer, at least one animation, and at least one tap
      interaction.
- [ ] Every layer in a draft references a character, pose, expression, or prop
      that exists in the registry version that the run froze at its start.
- [ ] When a page scene fails validation after one repair, the run keeps the
      error and the candidate, and marks the page `needs_review`. It does not
      drop a layer or swap a character on its own.
- [ ] A change to the narration of page 3 followed by "regenerate audio" makes a
      new audio revision for page 3 only. All other revisions stay the same.
- [ ] A retried workflow step does not create a second revision or a second
      model call for the same call ID.
- [ ] Publishing writes a release under a new R2 prefix and changes no earlier
      release. The Player of release 1 shows the same content after release 2
      is published.
- [ ] A published release contains copies of the character asset versions it
      uses.
- [ ] The Player works in current Safari on iPad and iPhone, and in current
      Chrome on Android.
- [ ] `/studio` and the Studio API are behind Cloudflare Access. The Player is
      public.

## Non-functional Requirements

- **Platform.** TypeScript only. Cloudflare Workers (Paid), Workflows, D1, R2,
  Static Assets, AI Gateway, Access.
- **Models.** All model calls go through one adapter with an OpenAI-compatible
  API. Production: AI Gateway, then OpenRouter. Development: a local proxy.
  TTS: Gemini 3.8 Flash TTS.
- **Workflow limits.** A step returns IDs or R2 keys only. A non-stream step
  result is at most 1 MiB (Cloudflare Workflows limits, checked 2026-11-19).
- **Idempotency.** Every model call has a call ID. A revision is written once
  per call ID. A heads pointer moves only if its current value is the expected
  one.
- **Performance.** On a mid-range phone, the frame time p95 on an animated page
  is 33 ms or less. A page's assets load in 2 s or less on a 4G connection.
- **Assets.** SVG is the target format for characters and props. A transparent
  WebP is allowed while an SVG version is not ready. The renderer supports
  both.
- **Privacy.** No child data is stored on a server.
- **IDs.** All system IDs are UUID version 7 (ADR 0007).
