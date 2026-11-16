# Apps and toolkits

## Decision

Use **Composio Built** for toolkits Composio maintains against product APIs, **Provider MCP** for catalog toolkits backed by a product's hosted MCP server, and **Custom MCP** for remote servers registered for a project or one user.

An **App** groups related catalog toolkits for comparison. Each toolkit retains its own slug, tools, authentication methods, auth configs, and connected accounts. App grouping does not enable sibling toolkits in a session or transfer a connection between them.

## Grouping and selection

- The dashboard groups by the backend-owned `app` value. Missing values and Custom MCP toolkits remain singletons.
- Use `toolkit_type` to distinguish Composio Built from Provider MCP in dashboard code. Do not infer type or grouping from `_mcp`, `_graph`, or `_graphql` suffixes.
- A shared provider does not establish that toolkits serve the same job. Different products, acting identities, or deployment targets can remain separate.
- Do not recommend the first toolkit in a group. Honor an explicitly named slug; otherwise compare required tools, triggers, authentication, and existing connections.
- Composio managed auth availability is independent of toolkit type.

## Documentation scope

The three guides cover App grouping, Provider MCP behavior, and choosing a toolkit. Session configuration, the glossary, agent instructions, LLM guardrails, and the Composio skill use the same terminology. Session MCP transport remains separate from Provider MCP toolkits.

The replacement for PR #4336 carries the content onto the current `next` branch. It preserves the newer Custom MCP scope and session configuration docs and moves the agent guidance into `docs/agent/instructions/context.ts`.

The September staging screenshots are omitted because they contain personal workspace details, old counts, and grouping examples that no longer match the backend-owned contract. Fresh demo-workspace screenshots can be added separately.

## Verification boundary

Review against the current docs and SDK contracts and the dashboard grouping implementation. Build, link, snippet, lint, and test results belong in the PR description. A local check does not establish production rollout or provider availability, and old test results from PR #4336 do not validate this replacement.
