# storybook-mvp - Requirements Document

Short-term MVP that turns a pasted news text into an interactive children's
storybook package. TypeScript on Cloudflare: Workflows orchestrate production,
a renderer-agnostic Storybook DSL describes pages, a character registry holds
reusable SVG/WebP assets, a Studio edits and regenerates single pages, and a
Player reads immutable releases.

Decision record: [ADR 0015](../../adr/0015-storybook-mvp-reset.md), amended
by [ADR 0016](../../adr/0016-backdrops-page-turn.md),
[ADR 0017](../../adr/0017-shelf-home-player-states.md), and
[ADR 0018](../../adr/0018-json-generation-via-ai-gateway-compat.md).

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
| Studio: edit, regenerate one page target, publish, take a book off the shelf | User accounts and roles |
| Player: a shelf of the published books; read a published release | Offline mode, PWA, video or EPUB export |

## Core Features

1. **Production run.** The Studio starts a run from a news text. A durable
   workflow makes a story script, one scene per page, and narration audio for
   each page. The result is a draft.
2. **Storybook DSL.** Each page is data: narration, a backdrop (a painted
   full-frame background from the registry) with its sky palette, layers
   (characters and props), animations, and tap interactions (ADR 0016). The
   DSL does not depend on a renderer.
3. **Character registry.** All 13 Producer characters, their props, and their
   poses and expressions are rows in the database with versioned asset files.
   A character can be replaced by a new version without code changes.
   Backdrops are registry assets in the same way.
4. **Studio.** Shows run progress and every page. The operator can change the
   narration, the layout template, the backdrop, the characters, their pose
   and expression, props, animations, and taps. The operator can regenerate one page scene or
   one page audio. The operator publishes a draft. The operator can take a
   published story off the shelf (ADR 0017, decision 20).
5. **Player.** Reads one immutable release. Shows pages with animation, plays
   narration, and responds to taps. The narration is below the picture, a
   page turns like paper, and the last page turns to an end page (ADR 0016).
6. **Shelf.** The home of the Player is a shelf. It shows one book for each
   published story that was not taken off the shelf: the latest release,
   with its title and a cover. The
   cover is the picture of page 1. A child picks a book, and a Home control
   on every screen of a book goes back to the shelf (ADR 0017).

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
- As a child, I want to pick a book from a shelf, so that I can choose my
  story without help.
- As the operator, I want to take a book off the shelf, so that a child can
  no longer open a story that should not be read.

## Acceptance Criteria

- [ ] A pasted news text of 200 to 2,000 words gives a draft of 6 to 8 pages.
- [ ] Each draft page has narration text, one audio file, at least one
      character layer, at least one animation, and at least one tap
      interaction.
- [ ] Every layer in a draft references a character, pose, expression, or prop
      that exists in the registry. A layer in an AI draft uses the registry
      version that the run froze at its start. A layer in an operator's edit
      or a "still fits" copy uses the active version at the time of the
      request (Q3).
- [ ] When a page scene fails validation after one repair, the run keeps the
      error and the candidate, and marks the page `needs_review`. It does not
      drop a layer or swap a character on its own.
- [ ] A change to the narration of page 3 followed by "regenerate audio" makes a
      new audio revision for page 3 only. All other revisions stay the same.
- [ ] Each model call ID stores at most one result. A retried step reuses a
      stored result and does not call the model again. The model is called a
      second time only if the step stopped after the model answered and before
      the result was stored.
- [ ] A step that stopped after it wrote a revision and before it moved the
      head completes the head move when it is retried.
- [ ] A result that was generated from a page text that the operator has
      since changed does not replace the operator's work. It is kept as
      `superseded`.
- [ ] Publishing is blocked unless every page has a page text, a scene, and an
      audio, none of them is `needs_review`, and none is stale. The operator
      can mark a stale scene as "still fits", which makes it current.
- [ ] Publishing writes a release under a new R2 prefix and changes no earlier
      release. The Player of release 1 shows the same content after release 2
      is published. A take-off (below) changes no release either; it only
      stops the serving of it.
- [ ] A published release contains copies of the asset versions it uses,
      including the backdrop of each page.
- [ ] Every page scene names a backdrop that has a variant for the page's sky
      palette.
- [ ] In the Player, the narration is below the stage in portrait and in
      landscape, and a page turn shows a page-turn transition (a cross-fade
      with reduced motion). The narration of the new page starts in the tap
      handler. "Next" on the last page turns to an end page with "Read
      again".
- [ ] The Player works in current Safari on iPad and iPhone, and in current
      Chrome on Android.
- [ ] `/studio` and the Studio API are behind Cloudflare Access. The Player,
      with the shelf at `/`, and `GET /api/shelf` are public.
- [ ] `GET /api/shelf` is read-only. It lists one book for each story that
      has a release: the `releaseId` of its latest release, its `title`,
      and its publish time, and no other field. A story with no release is
      not in the list, and a story that was taken off the shelf is not in
      it. The newest story is first, and a new release of a
      story does not move its book. A story whose pointer names no
      release of that story is not in the list either, and the route
      logs it. The route never reads draft data.
- [ ] The shelf at `/` shows each book with its title and a cover. The cover
      is the page 1 scene of the release as a still picture. A tap on a
      book opens `/read/:releaseId`. With more books than fit, "previous"
      and "next" change the books, and nothing scrolls. An empty shelf and
      a shelf that cannot be loaded show a quiet line and no fault sign.
- [ ] Every Player screen of a book has exactly one Home control, and it
      shows the shelf. When a release does not exist, or a file that
      "Start" waits for cannot be loaded or drawn, the Player shows a
      resting state with a Home control, and no fault sign. "Start" does
      not wait for audio.
- [ ] In the Player, a layer that reacts to a tap has a hit area of 64 x 64
      CSS px or more. The hit area is cut at the stage edge and is never
      moved, so a small layer at the edge has less. A drawn layer wins
      over the added margin of another layer.
- [ ] The operator can take a published story off the shelf. After that,
      `GET /api/shelf` does not list the story, and the content route
      answers 404 for every release of the story up to the published one,
      so a link to such a release shows the resting state. No release file
      and no `release` row changes. There is no undo: a new release puts
      the story back on the shelf, and the earlier releases stay off.
- [ ] A path that matches no Player route shows the shelf.
- [ ] Every viewport has a layout. Where the fixed parts of a screen cannot
      fit the viewport, the Player shows a picture sign and one line (the
      Small screen state), with the Home control on a book route, and the
      screen comes back when the viewport is large enough.
- [ ] Every sentence of a page text that the script model writes has at most
      12 words, and the page texts of a story hold at most 2 real-world names
      (design "2. StoryRun Workflow", "Script rules"). A script that breaks a
      limit after one repair makes the run fail. Code does not change the
      text.

## Non-functional Requirements

- **Platform.** TypeScript only. Cloudflare Workers (Paid), Workflows, D1, R2,
  Static Assets, AI Gateway, Access.
- **Models.** All model calls go through one adapter. Text models use an
  OpenAI-compatible API. Production: the AI Gateway endpoint `/compat`, with
  the provider in the model ID (ADR 0018). Development: a local proxy. TTS:
  Gemini 3.8 Flash TTS. Production: AI Gateway (`google-ai-studio`).
  Development: Google AI Studio directly. No model call goes through
  OpenRouter.
- **Workflow limits.** A step returns IDs or R2 keys only. A non-stream step
  result is at most 1 MiB (Cloudflare Workflows limits, checked 2026-11-19).
- **Idempotency.** Every model call has a call ID that includes its purpose
  (first try or repair). A stored result is never requested again. A head
  moves only by compare-and-set against the revision the step was based on.
- **Performance.** On a mid-range phone, the frame time p95 on an animated page
  is 33 ms or less. A page's assets load in 2 s or less on a 4G connection.
  The first shelf page shows its covers in 2 s or less on the same
  connection. This shelf load check is a gate: it is measured before the
  shelf goes public, in the Wide layout with 6 drawn covers, and on a
  real phone in portrait and in landscape. If it fails, the shelf does not
  go public, the asset pipeline makes a cover file of 800 x 400 px for
  each painted backdrop variant, and the check runs again (ADR 0017,
  decision 17). The cover files are not built before a failed check.
- **Assets.** SVG is the target format for characters and props. A transparent
  WebP is allowed while an SVG version is not ready. The renderer supports
  both. A painted backdrop is a WebP of 2400 x 1200 px; the code-made backdrop
  is SVG (ADR 0016).
- **Privacy.** No child data is stored on a server.
- **IDs.** All system IDs are UUID version 7 (ADR 0007).
