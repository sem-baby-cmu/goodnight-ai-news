# ADR 0018: JSON generation goes through the AI Gateway `/compat` endpoint

- Status: Accepted
- Date: 2026-11-21
- Decided by: Jinyu Liu (owner). On 2026-11-21 the owner chose that the spec
  follows the deployed configuration.
- Amends: [ADR 0015](0015-storybook-mvp-reset.md), decision "One model
  adapter": the production route of JSON generation. ADR 0015 is not
  superseded.
- Spec: [`design.md`](../specs/storybook-mvp/design.md) "Components",
  "Deployment", "1. Model adapter";
  [`requirements.md`](../specs/storybook-mvp/requirements.md)
  "Non-functional Requirements"

## Context

ADR 0015 says that in production, JSON generation goes through AI Gateway to
OpenRouter. PR #97 (commit `2790c83`, 2026-11-19, #25) set these values in
`apps/storybook/wrangler.jsonc`:

| Variable | Value |
| :-- | :-- |
| `OPENAI_BASE_URL` | `https://gateway.ai.cloudflare.com/v1/<account>/storybook-mvp/compat` |
| `MODEL_SCRIPT` | `google-ai-studio/gemini-4-neon` |
| `MODEL_SCENE` | `openai/gpt-6.1-sol` |

With these values, the script and scene calls go through the gateway to
Google AI Studio and to OpenAI. They do not go to OpenRouter. PR #97 did not
record this as a decision. So the spec and the configuration disagreed from
2026-11-19 to this record.

## Decision

1. In production, `generateJson` posts to the OpenAI-compatible endpoint of
   AI Gateway:
   `https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/compat/chat/completions`.
2. The model ID names the provider, in the form `<provider>/<model>`, for
   example `google-ai-studio/gemini-4-neon` and `openai/gpt-6.1-sol`. The IDs
   come from `MODEL_SCRIPT` and `MODEL_SCENE`.
3. JSON generation does not go through OpenRouter.
4. TTS does not change (owner decision Q7): AI Gateway, provider
   `google-ai-studio`, API `v1beta`.
5. Development does not change: the same adapter calls a local proxy.
6. The adapter code does not change. Configuration alone selects the route.

## Reasons

- Production has run this way since 2026-11-19. This record removes the
  disagreement and changes nothing in production.
- One gateway serves both providers. The model ID names the provider, so a
  change of provider is a change of one variable.

## Alternatives considered

- **The configuration follows ADR 0015.** Set `OPENAI_BASE_URL` to
  `<gateway>/openrouter` and use OpenRouter model IDs
  (`google/gemini-4-neon`, `openai/gpt-6.1-sol`). Rejected: it changes
  production behaviour and needs an OpenRouter key in the gateway.
- **The Cloudflare REST API** (`/ai/v1/chat/completions` on
  `api.cloudflare.com`). Not chosen now. See "Consequences".

## Consequences

- The Cloudflare documentation marks `/compat/chat/completions` as
  deprecated for single-model calls, and says that it continues to work for
  existing integrations (AI Gateway docs, "Unified API (OpenAI compat)",
  last updated 2026-11-04). A move to the REST API is a separate decision.
  It needs its own record.
- The cost estimates in
  [`results/s2.md`](../specs/storybook-mvp/results/s2.md) use OpenRouter list
  prices. Direct provider prices can be different. They are not measured
  again here.
- Not checked: which key the gateway uses for each provider (a key stored in
  the gateway, or Unified Billing). This is gateway configuration, not
  repository content. The adapter sends
  `Authorization: Bearer <OPENAI_API_KEY>` and, when it is set,
  `cf-aig-authorization: Bearer <AI_GATEWAY_TOKEN>`.
- The test `SYS-05.S5` in `packages/models/src/client.test.ts` uses a base
  URL that ends in `/openrouter` as a fixture. The test checks the TTS URL
  only, so the fixture stays.
