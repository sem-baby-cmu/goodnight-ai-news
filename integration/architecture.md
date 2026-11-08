# Lullabyte production architecture (proposed)

Status: **proposed 2026-11-08**, not ratified. Owner: Integration (Jinyu Liu).
This document replaces the earlier draft `integration/architecture.html`, in
which one cron-started Workflow ran every stage in one go.

## 1. Decisions in one table

| # | Decision | Why |
| :-- | :-- | :-- |
| D1 | Run on **Workers Paid**. Free is for a demo only. | Free gives 10 ms CPU per invocation and 50 external subrequests. One story needs more (see section 7). |
| D2 | Cron starts **Scout only**. | A cron run has no checkpoint. One failure would restart every stage, and no person can step in between stages. |
| D3 | Each stage is a separate **queue consumer**. Stages share no code and no memory. | A stage can be re-run, replaced, or paused without touching the others. |
| D4 | **D1 is the record. A queue message carries IDs only.** | Queue messages expire (24 h on Free, 14 days at most on Paid). A review can take longer than that. A D1 row does not expire. |
| D5 | Every stage output is a **versioned artifact** row. Rows are never overwritten. | Any version can be compared, approved, or restored. A human edit is a new version. |
| D6 | The front end reads one **story package**: an immutable, versioned manifest in D1. Media is in R2. | The reader loads one object. A published story never changes under a reader. |
| D7 | All IDs are **UUID v7**. Dates are attributes. | Time-ordered, unique across stages, no collisions between two stories on the same day. |
| D8 | No Workflows and no KV in the first release. | Queues + D1 already give retry and state. Workflows wait at most a limited time for a human event, which does not fit a review gate. Status is a D1 column, so KV adds nothing. |

## 2. Stage flow

```
 Cron (daily, 05:00 UTC)
   |
   v
 [Scout] ---------> news_item rows (status = new)
                           |
                     GATE A: select  (human, or auto rule)
                           |  q-script
                           v
 [Storyteller] ---> artifact: script vN
                           |
                     GATE B: auto checks, then human review
                           |  q-produce, q-play   (fan out)
              +------------+-------------+
              v                          v
        [Producer]                  [Playmate-gen]
        artifact: scenes, voice     artifact: quiz, word card
              +------------+-------------+
                           |  q-package (when both are passed)
                           v
 [Packager] ------> story_package vN (immutable)
                           |
                     GATE C: approve for children
                           v
                     published  -->  Reader (Static Assets + API)
```

Rules for every stage:

1. Read the input artifacts by ID from D1.
2. Write one new artifact row with `status = pending`.
3. Run the automatic checks. Set `status` to `passed` or `failed`.
4. If `passed` and the next gate is automatic, send the next message.
   Otherwise stop and wait for a person.

A stage never calls the next stage. It only writes a row and, when allowed,
sends a message that holds IDs.

## 3. Data model (D1)

All `id` columns are UUID v7 strings, made by the Worker that inserts the row.

```
news_item      id, run_id, source_url, source_title, full_text, claims (json),
               confidence, first_rating, status (new|selected|skipped),
               created_at

story          id, news_item_id, publish_date, status
               (drafting|in_review|approved|published|retired),
               published_package_id, created_at

artifact       id, story_id, stage (script|scenes|voice|play|package),
               version, input_ids (json: the artifact ids it was made from),
               input_hash, payload (json) or r2_prefix,
               author (model|human), model, prompt_version, cost_usd,
               checks (json), status (pending|passed|failed|approved|
               rejected|stale), notes, created_at
               UNIQUE (story_id, stage, version)
               UNIQUE (stage, input_hash)          -- makes retries idempotent

review         id, artifact_id, reviewer, action
               (approve|reject|edit|regenerate), notes, created_at

story_package  id, story_id, version, manifest (json), created_at,
               approved_by, approved_at
```

Limits that shape the model (verified in the Cloudflare docs, 2026-11-08):

- A D1 row is at most 2 MB. A script and a manifest fit. Audio and PNG do
  not, so they go to R2 and the row keeps the key.
- Queues deliver at least once. A retried message must not make a second
  artifact. The `UNIQUE (stage, input_hash)` constraint stops that: the stage
  inserts first and exits when the insert conflicts.

## 4. Story package

The package is what the front end loads. One row per version. It is never
edited; a change makes version N+1.

```json
{
  "package_id": "0193f1c2-...-v7",
  "story_id": "0193f1a0-...-v7",
  "version": 2,
  "publish_date": "2026-11-09",
  "title": "...",
  "sources": [{"title": "...", "url": "..."}],
  "parent_card": {"ai_concept": "...", "question_to_ask": "..."},
  "ages": {
    "5to7": {
      "pages": [
        {"page": 1, "slot": "cover", "tone": "calm", "text": "...",
         "scene": "media/<story_id>/v2/5to7/p01.svg",
         "audio": "media/<story_id>/v2/5to7/p01.mp3",
         "timings": "media/<story_id>/v2/5to7/p01.json"}
      ],
      "quiz": [{"question": "...", "choices": ["..."], "answer": 0}],
      "word_card": {"word": "...", "definition": "..."}
    },
    "8to10": {"pages": [], "quiz": [], "word_card": {}}
  },
  "inputs": {"script": "<artifact id>", "scenes": "<artifact id>",
             "voice": "<artifact id>", "play": "<artifact id>"}
}
```

The reader calls `GET /api/stories/today?age=5to7`. The API returns the
published package for that date. Media paths resolve through the same Worker
from R2.

## 5. Intervention and quality

### 5.1 Automatic checks per gate

| Gate | Check | On failure |
| :-- | :-- | :-- |
| A select | `first_rating` is green; `confidence` >= 4; source is on the allow list | Skip the item. Scout tries the next one. |
| B script | `validate.py` schema; FK grade per age within target; every claim has `in_source = true` and a quote; `tone` in the allowed list | Retry once with the failure reasons added to the prompt. Second failure goes to the human queue. |
| Producer | every page has a scene; audio length within 10% of text length; timing words match the text | Retry the failing pages only. |
| Playmate-gen | quiz answers appear in the script; no new facts | Retry once, then human queue. |
| C package | all inputs `approved` or `passed`; every R2 key exists | Block publish. |

Every artifact records `model`, `prompt_version`, `cost_usd`, and `checks`.
This makes a quality drop traceable to one prompt or model change.

### 5.2 Human actions

A reviewer page (a Worker route behind Cloudflare Access) lists artifacts that
wait for a person. Four actions:

| Action | Effect |
| :-- | :-- |
| approve | `status = approved`. Send the next message. |
| reject + notes | `status = rejected`. The notes go into the next prompt when the stage re-runs. |
| edit | Save the edited payload as version N+1, `author = human`, `status = approved`. |
| regenerate from stage X | Make a new version of X. Mark every downstream artifact built from the old version `stale`. Re-run downstream from the new version. |

### 5.3 Coupling between Storyteller and Producer

They share the schema only. Producer reads an approved script artifact by ID.
A new voice or a new scene style re-runs Producer alone; the script stays.
Producer and Playmate-gen read the same script in parallel and never wait for
each other. Packager waits for both.

## 6. Where each stage runs

| Stage | Runtime | Notes |
| :-- | :-- | :-- |
| Scout | Worker, cron + queue | RSS fetch, one model call per item through AI Gateway. |
| Storyteller | Worker, queue consumer | Model calls through AI Gateway. Waiting on a model does not count as CPU. |
| Producer: scenes | Worker, queue consumer | SVG is built in code from `slot`, `tone`, `setting`. The reader shows SVG directly. |
| Producer: feed PNG | Browser Run | Only the 6 carousel cards need a raster image. |
| Producer: voice | Worker, queue consumer | TTS and forced alignment through AI Gateway. MP3 and timings to R2. |
| Playmate-gen | Worker, queue consumer | Quiz and word card from the approved script. |
| Packager | Worker, queue consumer | No model call. Builds the manifest and checks R2 keys. |
| Reader + API + reviewer page | Worker with Static Assets | Reviewer routes behind Cloudflare Access. |

The vertical reel was dropped on 2026-11-08 (`producer/README.md`), so no
stage needs ffmpeg or Containers.

The current prototypes are Python. Moving them to Workers is a port, not a
copy: Python Workers run on Pyodide, and Playwright, Pillow, and ffmpeg do not
run there. The plan is TypeScript Workers; each owner ports the logic of their
own stage.

## 7. Workers Free vs Workers Paid

Verified in the Cloudflare limits pages on 2026-11-08.

| Limit | Free | Paid |
| :-- | :-- | :-- |
| CPU per cron run | 10 ms | 15 min (interval of 1 h or more) |
| CPU per queue message | 10 ms | 30 s default, up to 5 min |
| Wall time per cron run or queue batch | 15 min | 15 min |
| External subrequests per invocation | 50 | 10,000 default |
| Queue message retention | 24 h, fixed | 4 days default, up to 14 days |
| Browser Run | 10 min per day | 10 h per month included |
| D1 row size | 2 MB | 2 MB |

Waiting for a model response is I/O and does not count as CPU. The Free
limits break on the CPU work (RSS parsing, SVG building, JSON checks) and on
the subrequest count, not on model time.

## 8. Deployment

GitHub Actions deploys on every push to `main`:

1. `npm ci`, typecheck, tests.
2. `wrangler d1 migrations apply DB --remote`.
3. `wrangler deploy`.

Repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Model
provider keys are Worker secrets (`wrangler secret put`), not GitHub secrets.

The API token is an account-owned custom token, scoped to one account:

| Permission | Level | Needed for |
| :-- | :-- | :-- |
| Account > Workers Scripts | Edit | `wrangler deploy` (bindings to D1, R2, Queues need no extra permission to deploy) |
| Account > D1 | Edit | `wrangler d1 migrations apply --remote` |
| Account > Queues | Edit | creating queues and attaching consumers |
| Account > Workers R2 Storage | Edit | creating buckets from CI (drop it if buckets are made by hand) |
| Account > Account Settings | Read | Wrangler account lookup |
| Zone > Workers Routes | Edit | only if the Worker uses a custom domain |

## 9. Open decisions

| # | Question | Who |
| :-- | :-- | :-- |
| O1 | Ratify UUID v7. `story.schema.json` `story_id` pattern `^[a-z0-9_]+$` rejects the hyphens of a UUID. Producer keys input by date today. | all owners |
| O2 | Gate A: human pick every day, or auto pick with a human override? | Scout, Integration |
| O3 | One Worker with five stage modules, or one Worker per stage? One Worker is simpler to deploy; per-stage Workers match folder ownership. | Integration |
| O4 | Who reviews at Gate B and Gate C, and how fast? This sets the publish deadline. | team |
