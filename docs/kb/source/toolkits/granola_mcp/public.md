---
type: "reference"
title: "Granola MCP"
description: "Public behavior and schema guidance for the official Granola MCP server."
category: "toolkits-and-providers"
visibility: "public"
timestamp: "2026-07-14T00:00:00Z"
tags:
  - "granola"
  - "mcp"
  - "schemas"
---
# Granola MCP

## Composio mirrors Granola's official MCP server

The Granola MCP toolkit uses Granola's official MCP server. Tool names, descriptions, input definitions, and response metadata are limited to what that upstream server exposes.

- If Granola supplies only a tool name and description, that is the metadata Composio can expose.
- If Granola does not declare a response/output schema, Composio cannot invent one, so an empty output schema is not by itself evidence of a stale Composio catalog.
- If a customer reports a mismatch, ask for the exact tool name and missing field. Compare it with the current official Granola MCP server behavior before attributing it to the Composio catalog.
- Escalate when the official server currently exposes a tool or schema field but the same item is absent from Composio.
