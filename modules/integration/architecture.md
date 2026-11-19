# Lullabyte production architecture (proposed)

Status: **revision 2, 2026-11-08.** UUID v7 (D7) and Workers Paid (D1) are decided; the rest is proposed until the team reviews it. Owner: Integration
(Jinyu Liu). Replaces the earlier draft `integration/architecture.html`, in
which one cron-started run did every stage in one go.

Revision 2 follows a cross-family review (Codex, 2026-11-08). Revision 1 used
five queue consumers. The review showed that this needs an outbox, job leases,
a fan-in coordinator, and stale-job fencing to be correct. A Workflow per story
gives the same results with none of that code. Section 10 lists each finding.

## 1. Decisions in one table

| # | Decision | Why |
| :-- | :-- | :-- |
| D1 | Run on **Workers Paid**. Free is for a demo only. | Free gives 10 ms CPU per invocation and 50 external subrequests. One story needs more (section 7). |
| D2 | **Scout is its own job.** Cron starts it. It writes news items to D1 and stops. | Scout output is a buffer. Nothing downstream starts until an item is selected. Scout can run, fail, or re-run without touching any story. |
| D3 | **One Workflow instance per story.** Selecting a news item creates it, with the story ID as the instance ID. | Each step is retried and checkpointed by the platform. A crash resumes at the failed step, not at the start. No queues, no outbox, no leases. |
| D4 | **Every stage output is an artifact row in D1.** The Workflow passes artifact IDs between steps, not content. | Review, edit, and comparison work on D1 rows. Workflow state is only the cursor. D1 rows do not expire; Workflow state does (7 to 30 days on Paid). |
| D5 | **Human gates are `step.waitForEvent`** with an explicit timeout (14 days). | A waiting instance does not count toward the concurrency limit. The reviewer page sends the event. |
| D6 | The front end reads one **story package**: an immutable, versioned manifest in D1. Media is in R2. | The reader loads one object. A published story never changes under a reader. |
| D7 | All IDs are **UUID v7**, `story_id` included. Dates are attributes. Decided 2026-11-08. | Time-ordered and unique across stages. |
| D8 | No Queues and no KV in the first release. | The Workflow already gives retry and ordering. Status is a D1 column. |

## 2. Flow

```
 Cron (daily)
   |
   v
 [Scout job] -----> news_item rows (status = new)          <- buffer, reviewable
                          |
                    GATE A: select (reviewer page, or auto rule)
                          |  creates Workflow instance  id = story.id
                          v
 +------------------- StoryWorkflow (one per story) -------------------+
 |                                                                      |
 |  step: storyteller ---> artifact script vN                           |
 |  step: check script     (schema, FK grade, claims, tone)             |
 |  waitForEvent GATE B  -- approve | reject+notes | edit               |
 |        ^                    |                                       |
 |        +---- reject: loop ---+                                       |
 |                                                                      |
 |  step: producer-scenes   --> artifact scenes  (SVG, R2)              |
 |  step: producer-voice    --> artifact voice   (MP3 + timings, R2)    |
 |  step: playmate-gen      --> artifact play    (quiz, word card)      |
 |  step: packager          --> story_package vN (immutable)            |
 |  waitForEvent GATE C  -- approve | regenerate from <stage> + notes   |
 |        ^                    |                                       |
 |        +---- regenerate: loop back to <stage> ----------------------+
 |                                                                      |
 |  step: publish  --> story.published_package_id = package id          |
 +----------------------------------------------------------------------+
                          |
                          v
                 Reader (Static Assets + API)
```

Each stage is a module owned by its component (`scout`, `storyteller`,
`producer`, `playmate`). The Workflow only calls them in order and passes
artifact IDs. A module reads its inputs from D1 by ID and writes one new
artifact row. Modules never call each other.

Producer and Playmate-gen run one after the other in the first release. This
removes the fan-in. Running them in parallel is a later optimisation.

## 3. Data model (D1)

All `id` columns are UUID v7 strings.

```
news_item      id, run_id, source_url, source_title, full_text, claims (json),
               confidence, first_rating, status (new|selected|skipped),
               created_at

story          id, news_item_id, publish_date, status
               (drafting|in_review|approved|published|retired),
               published_package_id, created_at

artifact       id, story_id, stage (script|scenes|voice|play|package),
               version, generation_id, input_ids (json), input_hash,
               payload (json) or r2_prefix,
               author (model|human), model, prompt_version, cost_usd,
               checks (json), status (passed|failed|approved|rejected),
               notes, created_at
               UNIQUE (story_id, stage, version)
               UNIQUE (generation_id)

review         id, artifact_id, reviewer, action
               (approve|reject|edit|regenerate), notes, created_at

story_package  id, story_id, version, manifest (json), input_ids (json),
               created_at, approved_by, approved_at
```

### 3.1 Idempotency

A Workflow step can run more than once (for example, it fails after the D1
write). Each intended generation has a `generation_id` = Workflow instance ID +
step name + loop round. A retry reuses the same ID, so
`INSERT ... ON CONFLICT (generation_id) DO NOTHING` followed by a read returns
the row that the first attempt wrote. A regeneration is a new round, so it
gets a new `generation_id` and a new version, even when its inputs are the
same. `input_hash` is kept for provenance only.

### 3.2 Limits that shape the model

- A D1 row is at most 2 MB. A script and a manifest fit. Audio and PNG go to
  R2, and the row keeps the key.
- A step result is at most 1 MiB, and an event payload is at most 1 MiB. Steps
  return IDs, so both stay small.

## 4. Story package

One row per version. Never edited; a change makes version N+1.

```json
{
  "package_id": "0193f1c2-...",
  "story_id": "0193f1a0-...",
  "version": 2,
  "publish_date": "2026-11-09",
  "title": "...",
  "sources": [{"title": "...", "url": "..."}],
  "parent_card": {"ai_concept": "...", "question_to_ask": "..."},
  "ages": {
    "5to7": {
      "pages": [
        {"page": 1, "slot": "cover", "tone": "calm", "text": "...",
         "scene": "media/<story_id>/<package_id>/5to7/p01.svg",
         "audio": "media/<story_id>/<package_id>/5to7/p01.mp3",
         "timings": "media/<story_id>/<package_id>/5to7/p01.json"}
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

The reader calls `GET /api/stories/today?age=5to7` and gets the published
package for that date. Media resolves through the same Worker from R2. R2
keys include the package ID, so a new version never overwrites media that a
published package points to.

## 5. Intervention and quality

### 5.1 Automatic checks

| Point | Check | On failure |
| :-- | :-- | :-- |
| Gate A | `first_rating` is green; `confidence` >= 4; source on the allow list | Auto rule skips the item. A reviewer can still pick it. |
| After storyteller | `validate.py` schema; FK grade per age within target; every claim has `in_source = true` and a quote; `tone` in the allowed list | Retry once with the failure reasons in the prompt. Then stop at Gate B with `status = failed` and the reasons shown. |
| After producer | every page has a scene; audio length within 10% of the text estimate; timing words match the text | Step retry (platform). Then Gate C shows the failure. |
| After playmate-gen | quiz answers appear in the script; no new facts | Retry once, then Gate C shows the failure. |
| Packager | every input artifact is approved or passed; every R2 key exists | Packager step fails; nothing is published. |

Every artifact records `model`, `prompt_version`, `cost_usd`, and `checks`,
so a quality drop can be traced to one prompt or model change.

### 5.2 Human actions

The reviewer page is a Worker route behind Cloudflare Access. It lists stories
whose Workflow waits at a gate and sends the event.

| Action | Where | Effect |
| :-- | :-- | :-- |
| approve | B, C | Mark the artifact or package approved. The Workflow continues. |
| reject + notes | B | The Workflow loops: a new storyteller round with the notes in the prompt. |
| edit | B | The page saves the edit as a new artifact version (`author = human`) and sends its ID. The Workflow continues from that version. |
| regenerate from stage + notes | C | The Workflow loops back to that stage. Every later stage runs again on the new inputs. |

Because one instance runs the steps of one story in order, an old step can not
finish after a newer round has started. A published package is never changed:
a regeneration after publish makes a new package version, and publish moves
the pointer.

### 5.3 Coupling between Storyteller and Producer

They share the schema only. Producer reads an approved script artifact by ID.
A new voice or scene style is "regenerate from producer-scenes" or
"regenerate from producer-voice"; the script stays.

## 6. Where each stage runs

| Stage | Runtime | Notes |
| :-- | :-- | :-- |
| Scout | Worker cron handler | RSS fetch; one model call per item through AI Gateway. |
| Storyteller | Workflow step | Model calls through AI Gateway. Waiting on a model is not CPU time. |
| Producer: scenes | Workflow step | SVG built in code from `slot`, `tone`, `setting`. The reader shows SVG directly. |
| Producer: voice | Workflow step | TTS and forced alignment through AI Gateway. MP3 and timings to R2. |
| Playmate-gen | Workflow step | Quiz and word card from the approved script. |
| Packager | Workflow step | No model call. Builds the manifest and checks R2 keys. |
| Reader, API, reviewer page | Worker with Static Assets | Reviewer routes behind Cloudflare Access. |

The vertical reel was dropped on 2026-11-08 (`producer/README.md`), so no
stage needs ffmpeg or Containers.

The prototypes are Python. Moving them to Workers is a port: Python Workers
run on Pyodide, and Playwright, Pillow, and ffmpeg do not run there. The plan
is TypeScript; each owner ports the logic of their own stage module.

### 6.1 Where agents run (bounded)

The pipeline above is a fixed sequence of steps. It is not an agent. An
agent (a model that picks its own next tool call) runs in two places only.
Decision and reasons: [ADR 0013](../docs/adr/0013-bounded-agents.md).

| Place | Agent task | Bounds | Output |
| :-- | :-- | :-- | :-- |
| Scout job | Search, fetch, and follow links to the original source; find two or more independent sources | Domain allowlist; step and cost limit per run | `news_item` rows with evidence links; reviewed at Gate A |
| Fact check (storytelling step 1, judge) | Find a quote that is not in the article text in the primary source | Read only; advisory | found / not found, with link; a person decides at Gate B |

Every tool call goes through AI Gateway and is logged. Code checks the agent
output against the schema before it is stored. Scout's evidence links are a
proposal to the Scout owner; the contract does not change until they agree.

## 7. Workers Free vs Workers Paid

Checked in the Cloudflare docs on 2026-11-08.

| Limit | Free | Paid |
| :-- | :-- | :-- |
| CPU per cron invocation | 10 ms | 15 min (interval of 1 h or more) |
| CPU per Workflow step invocation | 10 ms | 30 s default, up to 5 min (`limits.cpu_ms`) |
| Wall time per Workflow step | unlimited (I/O wait) | unlimited (I/O wait) |
| Steps per Workflow | 1,024 | 10,000 default |
| Concurrent running instances | 100 | 50,000 (waiting instances do not count) |
| Finished instance state kept | 3 days | 7 days default, up to 30 days |
| External subrequests per invocation | 50 | 10,000 default |
| D1 row size | 2 MB | 2 MB |

Waiting for a model is I/O, not CPU. Free breaks on CPU work (RSS parsing, SVG
building, JSON checks) and on the subrequest count.

## 8. Deployment

Resources (account `simon`, created 2026-11-08):

| Resource | Name | Binding |
| :-- | :-- | :-- |
| Worker | `goodnight-ai-news` (`app/`) | — |
| D1 | `goodnight-ai-news` | `DB` |
| R2 | `goodnight-ai-news-media` | `MEDIA` |

The Worker answers `GET /health` with the state of each binding:
`https://goodnight-ai-news.ioenv.workers.dev/health`.

Because the Worker exists now, the CI token can be scoped to this one Worker
(Editor) plus D1 Edit. Creating another Worker needs a wider token once.

GitHub Actions deploys on every push to `main`:

1. `npm ci`, typecheck, tests.
2. `wrangler d1 migrations apply DB --remote`.
3. `wrangler deploy` (Worker, Workflow, cron, Static Assets).

Repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Model
provider keys are Worker secrets (`wrangler secret put`), not GitHub secrets.

The API token is an account-owned custom token, scoped to one account.
Permissions by deploy operation:

| Operation | Permission | Status |
| :-- | :-- | :-- |
| `wrangler deploy` with D1, R2, Workflow bindings | Account > Workers Scripts: Edit | Verified: binding to a resource needs no extra permission to deploy. |
| `wrangler d1 migrations apply --remote` | Account > D1: Edit | Verified. |
| Create R2 buckets from CI | Account > Workers R2 Storage: Edit | Drop it if buckets are created by hand. |
| Add, change, or remove a Route or Custom Domain | Zone > Workers Routes: Edit, on that zone | Verified. Not needed for `workers.dev`. |
| Account lookup by Wrangler | Account > Account Settings: Read | Unverified. Add it only if a deploy fails without it. |

## 9. Open decisions

| # | Question | Who |
| :-- | :-- | :-- |
| O1 | Move each prototype to UUID v7 IDs. The schema now enforces UUID v7 for `story_id` (decided 2026-11-08). Producer still names its input by date. | each owner |
| O2 | Gate A: human pick every day, or auto pick with a human override? | Scout, Integration |
| O3 | Who reviews at Gate B and Gate C, and how fast? This sets the publish deadline and the gate timeout. | team |
| O4 | What happens at gate timeout: retire the story, or notify and wait again? | Integration |

## 10. Review record (Codex, 2026-11-08)

| # | Finding on revision 1 | Result |
| :-- | :-- | :-- |
| 1 | Unique insert on retry strands a half-done stage | Fixed: Workflow step retry plus `generation_id` (3.1). |
| 2 | Packager fan-in had no coordinator | Fixed: Producer and Playmate-gen run in order (section 2). |
| 3 | D1 commit and queue send can split | Fixed: no queues; the Workflow is the dispatcher. |
| 4 | `UNIQUE (stage, input_hash)` forbids regeneration | Fixed: uniqueness on `generation_id`; `input_hash` is provenance. |
| 5 | Stale marking races with running jobs | Fixed: one instance runs one story in order (5.2). |
| 6 | Rejecting Workflows used a false limit | Accepted. Verified in the docs: `waitForEvent` timeout is configurable; retention applies to finished instances. |
| 7 | Queue CPU is per invocation, not per message | Moot: no queues. Section 7 now says per invocation. |
| 8 | Dropped messages after retries | Moot: no queues. |
| 9 | UUID v7 breaks the current contract | Fixed: the schema now enforces UUID v7; O1 tracks each component's move. |
| 10 | Routes permission is not only for Custom Domains | Fixed in section 8. |
| 11 | Account Settings Read is unverified | Marked unverified in section 8. |
| 12 | Too much orchestration before the handoffs are proven | Accepted: one Worker, one Workflow. |
