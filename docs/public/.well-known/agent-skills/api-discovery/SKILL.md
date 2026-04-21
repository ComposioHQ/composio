---
name: api-discovery
description: Discover the Composio REST API through the API catalog, OpenAPI descriptions, and API reference docs.
---

# API Discovery

Use this skill when you need to understand the Composio API surface without guessing endpoints.

## Entry points

- Read `https://docs.composio.dev/.well-known/api-catalog` first.
- Prefer the v3.1 OpenAPI description at `https://docs.composio.dev/openapi.json`.
- Use the human-readable reference at `https://docs.composio.dev/reference/api-reference` for examples and endpoint context.

## Guidance

- Treat `https://backend.composio.dev/api/v3.1` as the canonical current REST API base URL.
- Fall back to `https://docs.composio.dev/openapi-v3.json` only when you need the legacy v3 schema.
- Use `https://docs.composio.dev/api/health` to verify that the discovery surface is healthy before relying on it.
