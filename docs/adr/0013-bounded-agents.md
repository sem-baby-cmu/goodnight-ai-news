# ADR 0013: Fixed steps in the main pipeline; bounded agents in two places

- Status: Accepted
- Date: 2026-11-08
- Decided by: Jinyu Liu (Integration)
- Detail: [`integration/architecture.md`](../../integration/architecture.md) section 6.1

## Context

The project question asks whether an agentic AI system can turn AI news into
stories. An agent decides its own next step and tool calls. The main pipeline
must be predictable for a product for children ages 5 to 10.

## Decision

The main pipeline stays a fixed sequence of steps: model calls, code checks,
and human gates (ADR 0004, ADR 0012). It does not become an agent.

Bounded agents are used in two places only:

| Place | What the agent does | Bounds |
| :-- | :-- | :-- |
| Scout: research and cross-check | Searches, fetches pages, follows links to the original source; looks for two or more independent sources before it sets a confidence | Domain allowlist; limit on steps and cost; output is a `news_item` with evidence links, written to D1 and reviewed at Gate A |
| Fact check (storytelling step 1 and the judge) | When a quote is not found in the article text, looks for the sentence in the primary source (paper, official blog) | Read only; answers only "found / not found, with link"; advisory; a person decides at Gate B |

## Reasons

- Every step must be predictable, auditable, and re-runnable alone, with a
  cost ceiling. The readers are children ages 5 to 10.
- An agent that chooses its own next step conflicts with the rule "a model
  chooses from closed lists; code draws and checks" (ADR 0012).
- Research and source checking need an unknown number of tool calls. That is
  where an agent adds value, and its output still passes a gate.

## Alternatives considered

| Option | Why not |
| :-- | :-- |
| Whole pipeline as one agent (or many cooperating agents) | Not predictable; hard to audit and re-run one step; cost has no ceiling; conflicts with ADR 0012. |
| No agents at all | Scout cannot follow a story to its primary source; fact checks stop at the article text. |
| Agents also write the story text or pictures | Creative output must stay in closed lists and code checks. |

## Consequences

- The Scout part changes Scout's output (evidence links). That is a proposal
  to the Scout owner and needs their agreement before a contract change.
- Open: run the loop as plain code inside a step, or with the Cloudflare
  Agents SDK. Not checked yet.
- Measure: share of claims with two or more sources, steps and cost per run.
