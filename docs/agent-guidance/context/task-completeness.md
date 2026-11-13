# Core task completeness

DEVREL-38 tracks whether an agent can finish a task from its canonical section without reconstructing setup from unrelated pages. Each selected section needs prerequisites, the exact command or API, an observable result, and the next decision. Put the current path first and label legacy alternatives.

## Prioritized tasks

Read this table in priority order. The first pass covers session setup and public skill use; the remaining rows are follow-up audit targets, not claims that those pages are complete.

| Priority | Task and canonical page | First-pass scope |
| --- | --- | --- |
| 1 | Install an SDK, create a session, and retrieve tools: `content/docs/how-composio-works.mdx` | Add runtime and credential prerequisites, install instructions, complete client initialization, expected output, and the choice between a framework and a manual tool loop. Preserve existing reuse and execution guidance. |
| 2 | Install and use the public skill: `content/docs/using-composio-skill.mdx` | Add installation prerequisites, the expected installation result, and routes to current API details. |
| 3 | Run a first agent: `content/docs/quickstart.mdx` | Audit file names, launch commands, credential loading, Connect Link continuation, and proof of an app result for each framework. |
| 4 | Connect an account: `content/docs/authentication/index.mdx` and `content/docs/authentication/manually-authenticating.mdx` | Audit managed auth prerequisites, Connect Link completion, connection states, and the next tool call. |
| 5 | Restrict tools and choose accounts: `content/docs/configuring-sessions.mdx` | Audit defaults, exact configuration, observable scope, and when to update or create a session. |
| 6 | Expose session tools over MCP: `content/docs/sessions-via-mcp.mdx` | Audit client prerequisites, endpoint and headers, verification, and SDK versus MCP decisions. |

## Keep skills procedural

The shipped customer skill lives in `skills/composio/`; contributor skills live in `.agents/skills/`. Audit both the selected `SKILL.md` and its bundled references. A router that links to a bundled copy of API details can still become stale.

Keep product routing, inspection steps, identity and credential handling, and verification procedure in skills. Link to live documentation for signatures, option shapes, tool inventories, package versions, and feature limits. Link to the installed SDK's reference when a task targets that version. Do not copy those facts into a second reference file.

The shipped skill's bundled Platform, For You, and troubleshooting references now route API shapes, commands, credentials, feature limits, and provider-specific details to canonical documentation. They retain task selection, inspection, credential handling, and verification procedures. Contributor skills under `.agents/skills/` remain outside this pass.

## Benchmark handoff

The [semantic parity suite](semantic-parity.md) measures preservation of documented facts. The existing `eval:agent` suite checks answer signals. Neither establishes end-to-end task completion or a before-and-after improvement. The task-completion benchmark belongs to DEVREL-37; its agreed runner and baseline are needed before reporting an improvement here.

Use the same prompts, model, tools, credentials, and account state against the base revision and revised documentation. Start each attempt with fresh agent context. For the first two priorities, ask the agent to:

1. Install the SDK for each language, create a session for a supplied application user ID, and retrieve tools. Require a session ID and tool definitions. Do not score session creation as successful app execution.
2. Install the public skill in a fixture project and use it to identify the current session integration path. Require the installed skill location and consulted canonical reference. Check that it preserves the existing framework and user identity.

Record the docs revision, prompt, language, result, missing step, and any manual intervention for every attempt. Report completed tasks over attempted tasks for each revision, with failures retained. No task-completion benchmark was run in this pass; source review and static checks must not be reported as completion-rate evidence.
