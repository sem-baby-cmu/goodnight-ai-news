# Architecture decision records

One file per decision. Format and rules: [ADR 0001](0001-record-architecture-decisions.md).

| ADR | Decision | Status |
| :-- | :-- | :-- |
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-cloudflare-workers-paid.md) | Run on Cloudflare, Workers Paid plan | Accepted |
| [0003](0003-scout-runs-alone.md) | Cron starts Scout only; Scout output is a buffer in D1 | Proposed |
| [0004](0004-one-workflow-per-story.md) | One Cloudflare Workflow instance per story | Proposed |
| [0005](0005-artifacts-in-d1.md) | Every stage output is a versioned artifact row in D1 | Proposed |
| [0006](0006-immutable-story-package.md) | The front end reads one immutable story package | Proposed |
| [0007](0007-uuid-v7-ids.md) | All IDs are UUID version 7 | Accepted |
| [0008](0008-one-worker-front-end-and-api.md) | One Worker serves the front end and the API | Accepted |
| [0009](0009-front-end-stack.md) | React 19, shadcn (Base UI), Tailwind v4, TanStack Router | Accepted |
| [0010](0010-back-end-stack.md) | TypeScript, Hono, D1, Drizzle | Accepted |
| [0011](0011-ci-deploy.md) | GitHub Actions deploys main with an account-owned token | Accepted |
| [0012](0012-models-choose-code-draws.md) | A model chooses from closed lists; code draws and checks | Proposed ([#2](https://github.com/sem-baby-cmu/goodnight-ai-news/issues/2)) |
| [0013](0013-bounded-agents.md) | Fixed steps in the main pipeline; bounded agents in two places | Accepted |
| [0014](0014-three-js-background-only.md) | three.js for the background only; Pip stays SVG | Accepted for `app/` ([#3](https://github.com/sem-baby-cmu/goodnight-ai-news/issues/3)) |

"Proposed" means the Integration owner accepts it and the team has not agreed
yet. To add a decision, copy the sections of an existing ADR: Status, Context,
Decision, Reasons, Alternatives considered, Consequences.
