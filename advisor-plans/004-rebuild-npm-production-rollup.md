# Plan 004: Rebuild the npm production rollup on a coherent AI SDK train

> **Executor instructions**: Follow each step and run every verification. Stop
> on any condition listed below; do not improvise. When complete, update this
> plan's row in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 03291bfaa..HEAD -- pnpm-workspace.yaml pnpm-lock.yaml ts/e2e-tests/runtimes/cloudflare/cf-workers-tool-router-ai/package.json ts/e2e-tests/runtimes/node/claude-agent-sdk/package.json ts/examples/anthropic/package.json ts/examples/langchain/package.json ts/examples/mcp/package.json ts/examples/openai/package.json ts/examples/tool-router/package.json ts/examples/vercel/package.json ts/packages/experimental/package.json ts/packages/providers/anthropic/package.json ts/packages/providers/claude-agent-sdk/package.json ts/packages/providers/openai-agents/package.json`
> Re-audit any changed manifest before selecting versions.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: maintenance
- **Planned at**: commit `03291bfaa`, 2026-08-03
- **Source PRs**: [GitHub #4002](https://github.com/ComposioHQ/composio/pull/4002) ([Glen review](https://app.tryglen.com/review/ComposioHQ/composio/4002)); [GitHub #4006](https://github.com/ComposioHQ/composio/pull/4006) ([Glen review](https://app.tryglen.com/review/ComposioHQ/composio/4006))

## Why this matters

The grouped production update fails example typechecking because
`@ai-sdk/mcp` and `@ai-sdk/openai` resolve newer internal provider types than
the catalog's `ai` release. Updating unrelated packages in the same failing
commit hides their status. The replacement keeps one coherent AI SDK 7 train,
retains deliberate AI SDK 6 compatibility coverage, and validates the other
package families in small commits.

## Current state

PR #4002 proposed these 12 updates; re-query versions because the targets are
already stale:

| Package                          | PR target    |
| -------------------------------- | ------------ |
| `@anthropic-ai/claude-agent-sdk` | 0.3.220      |
| `@ai-sdk/mcp`                    | 2.0.18       |
| `@anthropic-ai/sdk`              | 0.115.0      |
| `langchain`                      | 1.5.4        |
| `@openai/agents`                 | 0.14.0       |
| `@langchain/anthropic`           | 1.5.2        |
| `typebox`                        | 1.3.8        |
| `@ai-sdk/openai`                 | 4.0.22       |
| `@cloudflare/workers-types`      | 5.20260728.1 |
| `@mastra/core`                   | 1.53.0       |
| `@modelcontextprotocol/sdk`      | 1.30.0       |
| `hono`                           | 4.12.32      |

At the failed head, `@ai-sdk/mcp@2.0.18` and
`@ai-sdk/openai@4.0.22` use provider 4.0.4/provider-utils 5.0.14 while
`ai@7.0.37` uses 4.0.3/5.0.12. The resulting error is at
`ts/examples/vercel/src/tool-router-ai.ts:73` when assigning MCP tools to
`ToolSet`.

The six explicit `ai: ^6.0.219` entries in the Mastra Zod 3/4 runtimes,
Anthropic/Mastra examples, and Anthropic/Mastra provider dev dependencies are
intentional compatibility coverage. Keep them. The normal catalog is the AI
SDK 7 lane and must advance with `@ai-sdk/mcp` and `@ai-sdk/openai`.

`typebox` is a runtime dependency of published `@composio/experimental`, so it
requires a patch Changeset.

## Commands

| Purpose         | Command                                                                                                                          | Expected result                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Resolve         | `mise exec -- pnpm install --lockfile-only`                                                                                      | exit 0                                                     |
| Reproducibility | `CI=true mise exec -- pnpm install --frozen-lockfile`                                                                            | exit 0                                                     |
| AI graph        | `mise exec -- pnpm --filter vercel-example list ai @ai-sdk/mcp @ai-sdk/openai @ai-sdk/provider @ai-sdk/provider-utils --depth 4` | AI SDK 7 consumer graph uses compatible provider internals |
| Peer policy     | `mise exec -- pnpm check:peer-deps`                                                                                              | exit 0                                                     |
| Changesets      | `mise exec -- pnpm validate:changesets`                                                                                          | exit 0                                                     |
| Focused example | `mise exec -- pnpm --filter vercel-example typecheck`                                                                            | exit 0; no `ToolSet` error                                 |
| AI v6 fixture   | `mise exec -- pnpm --filter @e2e-tests/node-vercel-ai-sdk-v6 test:e2e:node`                                                      | all pass                                                   |
| AI v7 fixture   | `mise exec -- pnpm --filter @e2e-tests/node-vercel-ai-sdk-v7 test:e2e:node`                                                      | all pass                                                   |
| All examples    | `mise exec -- pnpm typecheck:examples && mise exec -- pnpm test:examples`                                                        | all pass                                                   |
| Packages        | `mise exec -- pnpm build:packages && mise exec -- pnpm typecheck`                                                                | all pass                                                   |
| Tests           | `mise exec -- pnpm test`                                                                                                         | all pass                                                   |
| Runtime E2E     | `mise exec -- pnpm test:e2e:node && mise exec -- pnpm test:e2e:cloudflare && mise exec -- pnpm test:e2e:cli`                     | all pass in credentialed CI                                |
| Audit           | `mise exec -- pnpm audit --prod --audit-level=high`                                                                              | no high/critical production advisory introduced            |

## Scope

**In scope**:

- `pnpm-workspace.yaml` and `pnpm-lock.yaml` through pnpm.
- The 12 manifest files listed in the drift check.
- One new `.changeset/*.md` for the `typebox` runtime update.

**Out of scope**:

- The six explicit AI SDK 6 compatibility pins named above.
- `ts/e2e-tests/runtimes/node/vercel-ai-sdk-v6/**` and its AI SDK 7 sibling.
- OpenAI Node v7; that public migration is Plan 005.
- Transitive overrides, source casts, or edits that suppress incompatible
  `ToolSet` types.

## Git workflow

- Branch from the latest `origin/next`.
- Use conventional commits in this order:
  1. `chore(deps): align AI SDK dependencies`
  2. `chore(deps): refresh agent framework dependencies`
  3. `chore(deps): refresh runtime support dependencies`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Select one eligible AI SDK 7 train

Query versions, publication dates, and dependency metadata for `ai`,
`@ai-sdk/mcp`, and `@ai-sdk/openai`. Choose releases older than 72 hours whose
exact `@ai-sdk/provider` and `@ai-sdk/provider-utils` requirements are mutually
compatible. Add `@ai-sdk/mcp` to the root catalog and replace its repeated
first-party manifest ranges with `catalog:`. Advance the existing `ai` and
`@ai-sdk/openai` catalog entries together.

Generate the lockfile and run the AI graph, focused example, all-example
typecheck, Vercel v6 fixture, and Vercel v7 fixture before continuing.

**Verify compatibility pins remain**:

```bash
rg -n '"ai": "\^6\.0\.219"' \
  ts/e2e-tests/runtimes/node/mastra-tool-router-zod-v{3,4}/package.json \
  ts/examples/{anthropic,mastra}/package.json \
  ts/packages/providers/{anthropic,mastra}/package.json
```

Expected: six matches.

### Step 2: Update framework integrations in small commits

Update the Anthropic, Claude Agent SDK, LangChain, OpenAI Agents, Mastra, and
MCP SDK packages to current policy-eligible versions within the majors named by
#4002. After each framework family, regenerate the lockfile and run its package
tests/build plus affected example typechecks. Do not batch a failing family
with the next one.

### Step 3: Update TypeBox and support packages

Update `typebox`, Cloudflare workers types, and Hono. Add a patch Changeset for
`@composio/experimental` describing the TypeBox runtime dependency refresh.
Generate the lockfile and run experimental package tests/build plus Cloudflare
E2E.

### Step 4: Run the complete regression gates

Run every command in the Commands table on a clean frozen install. In CI,
require the Claude Agent, Cloudflare Tool Router, Mastra Zod 3/4, Node, Deno,
and CLI scratch jobs that GitHub selects for the changed paths.

## Test plan

Do not add tests if compatible dependency selection makes existing example and
runtime gates pass. Add a regression test only if a real first-party public
contract must change; stop first and report that scope expansion.

## Done criteria

- [ ] All 12 named production packages use current, policy-eligible targets.
- [ ] The AI SDK 7 catalog resolves compatible provider internals.
- [ ] All six intentional AI SDK 6 manifest pins remain.
- [ ] A valid patch Changeset covers `@composio/experimental`.
- [ ] Frozen install, peer checks, examples, builds, types, tests, E2E, and audit pass.
- [ ] No source cast, transitive override, or unrelated dependency update was added.

## STOP conditions

- No 72-hour-eligible AI SDK 7 release train has compatible internal packages.
- Fixing the `ToolSet` error requires a cast or first-party public API change.
- A framework update requires a new major not named by the source PR.
- The Mastra AI SDK 6 lane changes or its Zod 3/4 runtime checks fail.
- The TypeBox runtime update cannot pass without changing experimental behavior.
