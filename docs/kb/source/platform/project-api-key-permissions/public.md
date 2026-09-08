---
type: "troubleshooting"
title: "Project API Key Permissions"
description: "Public guidance for scoped Project API key permissions."
category: "authentication"
visibility: "public"
timestamp: "2026-07-16T00:00:00Z"
tags:
  - "api-keys"
  - "permissions"
  - "sessions"
  - "tool-router"
---
# Project API Key Permissions

## Proxy Execute requires an explicitly allowed Project API key

Create a scoped Project API key in the Dashboard and enable **Proxy Execute**
during key creation before calling the v3.1 Proxy Execute API. If a request is
denied, verify the key's scope before debugging the provider connection. Use a
fresh request ID from the correctly scoped key when escalation is still needed.

## Tool Router session creation requires Sessions write access

For scoped Project API keys, creating a session through `composio.sessions.create(...)` or `POST /api/v3.1/tool_router/session` requires the Sessions permission with write or read/write access.

A key can successfully call `GET /api/v3.1/toolkits` with Toolkits read access and still be unable to create a session. The SDK can surface a scoped-permission denial as a generic 401 `Invalid API key`.

Create a new Project API key with Sessions set to Read and write, or use an appropriate full-access Project API key, then retry session creation.

## Tool execution requires Tool execution write access

For a scoped Project API key, `composio.tools.execute()` and the tool-execute API require Tool execution set to Write or Read and write. A key without that permission can surface a generic 401 `Invalid API key` even when the key exists and is active.

Create a correctly scoped Project API key or use an appropriate full-access Project API key, then retry. A future API improvement may return a clearer permission error, but support should diagnose the current behavior from the key's permissions.
