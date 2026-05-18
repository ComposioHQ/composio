# Composio docs structure iteration context

## User request
Use PR https://github.com/ComposioHQ/composio/pull/3443/changes, docs-organizer repo https://github.com/ComposioHQ/docs-organizer, local video transcript from `/Users/cryogenicplanet/Downloads/Screen sharing - 2026-05-18 11_50_53 PM.mp4`, and Slack thread https://composioworkspace.slack.com/archives/C08S8D1EW3Z/p1779023649813129 as context. Spawn both Codex and Claude subagents to read docs, understand whether the docs explain core concepts properly, and iterate on structure.

## Current worktree
`/Users/cryogenicplanet/.pi/worktrees/composio/docs-structure-iteration-7afef2b6`

This branch has been reset to PR #3443 head (`pro-186-phase-1-reorganize-docs-structure`) so review should evaluate that structure plus propose improvements.

## Slack thread (via Composio CLI)
Root: docs organizer app and repo were shared for feedback. Color coding: green existing doc, yellow doc needs modification, blue new doc needed.

Key feedback:
- “personally i really hate this style of docs”
- “concept first docs imo are really bad”
- “you want much more show me how to use”
- Favorite docs for dense product: Modal guide (`https://modal.com/docs/guide`)
- High-level watching the video: new things added to docs are very messy
- “you probably do not want use composio to have much docs why does claude code plugin even have a doc”
- Vercel app is not very useful for feedback; a notion/excalidraw would be easier
- Ask Claude/Codex to loop and optimize docs to make sure they perfectly understand the concepts.

## Video transcript (Whisper)
The video rationale:
- Current docs are all over the place. Providers are in one place, but CLI and plugin belong under “Use Composio”, not “Build with Composio”.
- Auth guides are scattered; trigger docs are scattered; toolkit docs are scattered.
- Direct tool execution is now legacy and should not show up up front because it points people to old patterns.
- Docs should focus much more on sessions. “We want to move towards sessions.”
- First PR reorganizes current docs first, then more content can be added once everyone aligns.
- Use Composio = MCP, CLI, plugin. Build with Composio = SDK, sessions, providers.
- Sessions section = users/sessions, configuring sessions, native tools vs MCP.
- Auth section = everything auth.
- Tools section = everything tools; rename meta tools into “How agents use tools”.
- Triggers section = everything triggers.
- Platform = platform-level concerns.
- Migration + Legacy = clear old patterns. Single toolkit MCP should be clearly legacy.
- Anthropic docs are an example: long/flat lists are acceptable if concepts are grouped by user problem; anything related to tools is in Tools, context in Context Management, etc.

## Docs organizer principles
- Sessions-first: `composio.create(user_id)` is THE pattern.
- Progressive disclosure: simple at top, advanced at bottom.
- Link Auth / Composio Managed is recommended default.
- 1000+ apps, not 200+.
- v3.1 APIs, not v3.
- First Steps: Quickstart, get API key.
- Use Composio: MCP, CLI, Plugin.
- Build with Composio: How it Works, Providers.
- Sessions: core pattern.
- Auth: simple → advanced.
- Tools: overview, meta tools, Tool Router, Workbench, Search.
- Triggers independent from sessions.
- Platform production concerns.
- Help migration/glossary/FAQ.
- Legacy deprecated patterns, collapsed.

## PR #3443 reviewer context
Existing automated reviews repeatedly flagged:
- `---Legacy---` is just a separator and cannot collapse. To actually collapse deprecated content, move legacy pages into `docs/content/docs/legacy/` with `meta.json` and `defaultOpen:false`, replace parent entries with `"legacy"`, and update inbound links.
- Stale comments in `docs/app/(home)/docs/layout.tsx` still say “Get Started” after rename to “First Steps”.
- Top nav double-highlight concerns were fixed by making Use Composio `active: 'url'`; note it only lights on `/docs/composio-connect`, not sibling CLI/plugin pages.
- Page title `MCP` should bridge first paragraph with product name “Composio Connect”.

## Current focus for subagents
Evaluate whether the current PR structure and top-level docs explain the core concepts well enough for AI agents/humans:
- Should the docs be less concept-first and more “show me how to use”?
- Is “Use Composio” overloaded or too prominent?
- Are sessions, auth, tools/tool router/meta tools, triggers, platform, and legacy grouped correctly?
- What minimal content/structure changes should be made now versus deferred?
