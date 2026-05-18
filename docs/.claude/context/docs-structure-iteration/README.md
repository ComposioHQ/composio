# Docs structure iteration context

This folder records the context and difficulty map from the Claude/Codex review loops used to iterate the Composio docs structure in PR #3446.

## Why this exists

The review was not just a mechanical sidebar reshuffle. The difficult part was reconciling four inputs that pulled in different directions:

1. PR #3443 wanted a phase-1 structure-only reorganization.
2. The docs-organizer plan wanted sessions-first, progressive disclosure, and legacy collapse.
3. The screen-share video wanted grouped sections by user problem: sessions, auth, tools, triggers, platform, legacy.
4. Slack feedback pushed harder: concept-first docs are bad; make docs more “show me how to use”; do not over-promote narrow client/plugin pages; make Claude/Codex loop until the concepts are easy to infer.

## Files

- `source-context.md` — distilled source context from PR, Slack, video transcript, and docs-organizer.
- `iteration-1-difficulties.md` — what Claude and Codex found hard/confusing in the first review loop.
- `iteration-2-difficulties.md` — what Claude and Codex found hard/confusing after the first implementation pass.
- `iteration-3-difficulties.md` — what the third pass plus additional human feedback found hard/confusing.
- `decisions-and-resolutions.md` — which difficulties were fixed, intentionally deferred, or still worth rechecking.
- `review-checklist.md` — checklist for future Claude/Codex passes.
- `raw/` — raw subagent outputs for auditability.

## Current north star

For new agent builds, the docs should make an AI or human infer this path without guessing:

1. Start with a session: `composio.create(user_id)`.
2. Hand session tools to the agent: `session.tools()` or use `session.mcp.url` for MCP clients.
3. Let meta tools search, get schemas, manage auth, execute, and use workbench when large outputs need processing.
4. Use Auth, Tools, Triggers, and Providers as task-specific follow-up sections.
5. Treat direct execution and older static MCP setup as legacy/maintenance paths, not peer recommendations.
