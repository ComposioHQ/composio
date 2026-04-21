---
name: docs-navigation
description: Search the Composio docs site, open reference pages, and retrieve tool schemas from the browser surface.
---

# Docs Navigation

Use this skill when you need to work with the Composio documentation site as an interactive tool surface.

## Entry points

- Search API: `https://docs.composio.dev/api/search`
- Tool schema endpoint: `https://docs.composio.dev/api/tools/{TOOL_SLUG}`
- Markdown docs index: `https://docs.composio.dev/llms.txt`

## Guidance

- Search docs first when you know the concept but not the exact page path.
- Use `/api/tools/{TOOL_SLUG}` when you need only input and output schemas for a specific tool.
- Prefer `.md` endpoints and `llms.txt` when you need plain text documentation for agent consumption.
