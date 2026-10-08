---
type: "reference"
title: "Monday"
description: "Public support knowledge for Monday."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "monday"
---
# Monday


## Monday requires the OAuth app to be installed in the workspace before user connections

Monday is unusual among popular toolkits because the OAuth app must be installed in the Monday workspace before users initiate individual OAuth connections. An admin can install the app once for the workspace, then users can connect normally. For Composio's managed Monday app, use the official installation control or link exposed by the current connection flow. Do not construct or share a raw OAuth URL with a hard-coded client ID.

## Add the Composio redirect URL to the Monday OAuth app

For a custom Monday OAuth app, add the Composio redirect URL/callback URL to the Monday app settings. After the OAuth flow completes, the access token is populated by Composio automatically.

## `MONDAY_UPDATE_ITEM` body must be passed as a properly escaped string

`MONDAY_UPDATE_ITEM` expects the body in a format Monday's API accepts. If the customer passes JSON-like text or strings containing quotes/special characters, escape those characters and send a suitable string rather than unsupported raw structured content.

## Tool Router may prefer `MONDAY_MCP` over `MONDAY` when both are available

If both `MONDAY` and `MONDAY_MCP` are enabled, Tool Router may choose `MONDAY_MCP` for search/execution. If the customer specifically needs the regular Monday toolkit, disable `monday_mcp` in the session or narrow toolkit availability so `COMPOSIO_SEARCH_TOOLS` returns the intended tools.

## Monday scopes come from the OAuth app and do not need separate Composio-side setup in the common flow

For Monday, the scopes configured on the Monday OAuth app are picked up during authorization. In the common flow, there is no separate Composio-side scope configuration required unless the customer is intentionally requesting a subset.

## Monday trigger management is not handled by the agent at runtime

Trigger setup and management should be handled outside the agent runtime, for example through the CLI/API/dashboard flow. The agent should consume trigger payloads, not create or manage trigger instances as part of normal tool execution.
