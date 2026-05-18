# Source context

## PR #3443

PR #3443 proposed a phase-1 docs sidebar reorganization:

- First Steps
- Use Composio
- Build with Composio
- Sessions
- Auth
- Tools
- Triggers
- Platform
- Help
- Legacy

The PR already improved grouping and renamed Tools content, but automated reviews repeatedly noted that `---Legacy---` was only a separator and therefore could not collapse.

## Docs-organizer plan

The docs-organizer repo described the intended principles:

- Sessions-first: `composio.create(user_id)` is the core pattern.
- Progressive disclosure: simple paths first, advanced/custom paths later.
- Link Auth / Composio-managed auth is the default path.
- Use `1000+ apps`, not older `200+` or `500+` language.
- Direct execution and old static MCP setup are legacy.

## Video transcript themes

The screen-share rationale was:

- Current docs are scattered: auth, triggers, and toolkits are split across unrelated sections.
- CLI/plugin/MCP are “Use Composio”, not “Build with Composio”.
- Build docs should focus on sessions.
- Direct tool execution is now legacy and should not appear up front.
- Sections should work like Anthropic-style grouping: everything related to tools under Tools, everything related to context/sessions under Sessions, etc.

## Slack thread themes

Key feedback from the Slack thread:

- “Concept first docs” are bad for this dense product.
- Prefer “show me how to use” over abstract concept pages.
- Modal docs were cited as a better model for dense docs.
- “Use Composio” should not become a large docs area; narrow client/plugin pages should not dominate.
- Ask Claude/Codex to loop and optimize until the concepts are easy to understand.
