---
name: mcp-setup
description: Understand how to obtain and install a Composio MCP endpoint for a user or session-specific integration.
---

# MCP Setup

Use this skill when you need to connect an MCP-compatible client to Composio.

## Entry points

- MCP Server Card: `https://docs.composio.dev/.well-known/mcp/server-card.json`
- Session configuration docs: `https://docs.composio.dev/docs/configuring-sessions`
- Connect flow: `https://dashboard.composio.dev/~/org/connect`

## Guidance

- Treat MCP endpoints as user-specific or session-specific resources.
- Use the server card for capability discovery, but follow the install URL to obtain a concrete endpoint before attempting a connection.
- Prefer the documented `backend.composio.dev` session-based MCP URL pattern over deprecated `mcp.composio.dev` endpoints.
