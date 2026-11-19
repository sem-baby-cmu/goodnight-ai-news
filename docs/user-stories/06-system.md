# SYS System guarantees

Retries, revisions, access, privacy, and the model adapter. No requirement
story names these; they come from the acceptance criteria and the design
rules. Conventions: [README](README.md). The spec decides the expected
behaviour.

## SYS-01 A retried step does not repeat work

As the system, I want every model result stored one time under its call ID,
so that a retry is safe and does not pay for a second call. (Derived from
AC-6 and AC-7.)

Spec: requirements AC-6, AC-7, "Non-functional Requirements" · design "2. StoryRun Workflow", "3. Calls, revisions, and heads"

### SYS-01.S1 A stored result is not requested again
- Given a step that stopped after the `call_log` insert
- When the platform retries the step
- Then the model is called one time in total; the revision exists one time, and the head exists one time
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### SYS-01.S2 A retry completes a missed head move
- Given a step that stopped after the revision insert and before the head move
- When the platform retries the step
- Then the step finds the stored result, inserts no new revision, and moves the head; the head points at the revision
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### SYS-01.S3 Only one window repeats a model call
- Given a step that stopped after the model answered and before the result was stored
- When the platform retries the step
- Then the model is called a second time; no other stop point causes a second call
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### SYS-01.S4 Each call has its own ID and one result
- Given a step that calls the model
- When the call ID is made
- Then `callId = sha256(runId, stepName, pageId, purpose)`, where `purpose` is `first` or `repair`; a repair has its own call ID; each call ID stores at most one result
- Test: @storybook/app · apps/storybook/worker/db/ids.test.ts

### SYS-01.S5 A binary result is stored before its log row
- Given a model call that returns a binary
- When the step stores the result
- Then the binary goes to R2 at `calls/<callId>.<ext>` first, and then the `call_log` row is inserted with the R2 key
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### SYS-01.S6 New IDs are assigned before the result is stored
- Given a step that needs new IDs, for example `pageId`
- When the step stores the result and is retried later
- Then code assigns the IDs before the `call_log` insert, and the retry sees the same IDs
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### SYS-01.S7 A step returns IDs and keys only
- Given any workflow step
- When the step returns
- Then the result holds only IDs and R2 keys, and a non-stream result is at most 1 MiB
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

## SYS-02 Revisions never change, and a head moves only by compare-and-set

As the system, I want every output kept as a new revision, so that no work is
lost and the current state is always one consistent map. (Derived from the
rule "Revisions never change".)

Spec: requirements "Non-functional Requirements" · design "3. Calls, revisions, and heads", "D1 tables", "Error Handling"

### SYS-02.S1 A retried insert is a no-op
- Given a revision that exists for a `(call_id, kind, page_id)`
- When a retry inserts that revision again with `INSERT ... ON CONFLICT (call_id, kind, page_id) DO NOTHING`
- Then the unique key makes the insert a no-op; the existing row does not change, and the step reads the stored row and continues with it
- Test: @storybook/app · apps/storybook/worker/db/revisions.test.ts

### SYS-02.S2 A head moves only when `heads_version` matches
- Given a story with `heads_version = n`
- When a step or an operator edit moves a head
- Then the update sets the new `heads` and `heads_version = n + 1` only where `heads_version = n`; if no row changed, the loop reads again and tries again
- Test: @storybook/app · apps/storybook/worker/db/heads.test.ts

### SYS-02.S3 A step throws after 5 failed head moves
- Given a compare-and-set loop that changed no row in 5 tries
- When the loop ends
- Then the step throws, and the platform retries the step
- Test: @storybook/app · apps/storybook/worker/db/heads.test.ts

### SYS-02.S4 Every system ID is a UUID version 7
- Given a row that the system created
- When its ID is read
- Then the ID is a UUID version 7 in lower case
- Test: @storybook/app · apps/storybook/worker/db/ids.test.ts

## SYS-03 The Studio is behind Access, and the Player is public

As the operator, I want the Studio closed to other people, so that only I
start runs and publish. (Derived from AC-15.)

Spec: requirements AC-15 · design "Deployment", "Testing Strategy"

### SYS-03.S1 The Studio and its API ask for a login
- Given the deployed Worker, and a browser with no Access session
- When it opens `/studio`, `/studio/x`, and `/api/studio/x`
- Then each of the three asks for a login
- Test: manual · not run

### SYS-03.S2 The Player does not ask for a login
- Given the deployed Worker, and a browser with no Access session
- When it opens `/read/x`
- Then it does not ask for a login; `/read/*` and `/content/*` are public
- Test: manual · not run

## SYS-04 No child data, and no full text in logs

As a parent, I want no data about my child kept on a server, so that reading
a story has no privacy cost. (Derived from the privacy requirement.)

Spec: requirements "Non-functional Requirements" · design "Error Handling"

### SYS-04.S1 No child data is stored on a server
- Given a child who reads a release in the Player
- When the child reads, taps, and turns pages
- Then no child data is stored on a server
- Test: spec (to implement)

### SYS-04.S2 An error record names where it happened
- Given an error in a run
- When the error is recorded
- Then the record has `runId`, `storyId`, `pageId`, `step`, and the provider status
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

### SYS-04.S3 Logs do not hold a full text
- Given a run that reads a news text and gets model outputs
- When the run writes logs
- Then the logs do not contain the full news text or a full model output
- Test: @storybook/app · apps/storybook/worker/workflow/story-run.test.ts

## SYS-05 One model adapter, set by configuration

As the system, I want every model call to go through one adapter, so that
production and development differ only in configuration. (Derived from the
models requirement.)

Spec: requirements "Non-functional Requirements" · design "1. Model adapter", "Deployment"

### SYS-05.S1 Model IDs come from the environment
- Given the Worker configuration
- When the adapter makes a call
- Then the model ID comes from an environment variable and is not in code; production and development differ only in configuration
- Test: @storybook/models · src/client.test.ts

### SYS-05.S2 The adapter returns JSON that is not validated
- Given a `generateJson` call
- When the adapter returns
- Then the value is unvalidated JSON, and the caller validates it with zod
- Test: @storybook/models · src/client.test.ts

### SYS-05.S3 Speech comes back in a format that the browser plays
- Given a `synthesizeSpeech` call where the provider returns raw PCM
- When the adapter returns
- Then the adapter adds a WAV header, and the result is audio that the browser can play
- Test: @storybook/models · src/client.test.ts

### SYS-05.S4 Speech in development goes to Google AI Studio directly
- Given the development configuration
- When the adapter makes a `synthesizeSpeech` call
- Then the request goes to `https://generativelanguage.googleapis.com/v1beta`, and not through OpenRouter
- Test: @storybook/models · src/client.test.ts

### SYS-05.S5 Speech on Cloudflare goes through AI Gateway
- Given the Cloudflare configuration
- When the adapter makes a `synthesizeSpeech` call
- Then the request goes to `https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/google-ai-studio/v1beta`, and not through OpenRouter
- Test: @storybook/models · src/client.test.ts
