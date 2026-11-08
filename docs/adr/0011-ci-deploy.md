# ADR 0011: GitHub Actions deploys main with an account-owned token

- Status: Accepted
- Date: 2026-11-08
- Decided by: Jinyu Liu (Integration)
- Detail: [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml), [`integration/architecture.md`](../../integration/architecture.md) section 8

## Context

The Worker should deploy on every merge to `main` without a person running
`wrangler` on a laptop.

## Decision

- Every pull request and push runs typecheck and build.
- A push to `main` applies D1 migrations, deploys, and checks `/health`.
- The Cloudflare token is an **account-owned** custom token for account
  `simon`. It lives in the GitHub `production` environment, which only `main`
  can use.

## Reasons

- Cloudflare recommends account-owned tokens for Wrangler and CI. The token
  does not depend on one person's user account.
- The environment rule stops other branches and fork pull requests from
  reading the token.

## Alternatives considered

| Option | Why not |
| :-- | :-- |
| User API token | Tied to one person; only needed for Cloudflare Workers Builds, which we do not use. |
| Cloudflare Workers Builds (dashboard Git integration) | Needs a user token; checks and migrations live outside the repo. |
| Repository-level secrets | Any workflow on any branch can read them. |
| Deploy by hand | Not repeatable; easy to skip migrations. |

## Consequences

- The token can be scoped to the one Worker (Editor) plus D1 Edit, because
  the Worker already exists.
