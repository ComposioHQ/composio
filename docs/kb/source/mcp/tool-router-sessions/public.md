---
type: "guide"
title: "Tool Router Sessions"
description: "Public setup guidance for creating and using Tool Router sessions."
category: "auth-config"
visibility: "public"
timestamp: "2026-07-16T00:00:00Z"
tags:
  - "mcp"
  - "tool-router"
  - "sessions"
---
# Tool Router Sessions

## Create Tool Router sessions through the SDK or API

There is no normal dashboard toggle required to enable Tool Router. Create a session through the SDK or the REST API.

- [Quickstart](https://docs.composio.dev/docs/quickstart)
- [Configuring sessions](https://docs.composio.dev/docs/configuring-sessions)
- [Create a Tool Router session API](https://docs.composio.dev/reference/api-reference/tool-router/postToolRouterSession)

If the customer has an actual 403 or an error saying Tool Router is not enabled for the account, do not keep repeating the setup steps. Ask for the exact error body and the request or code snippet, then route the case to a human for account-level checking.

## Session lifetime and deletion

Tool Router sessions are long-lived records and do not currently have a time-based expiration. This is separate from temporary workbench files, live sandbox retention, and short response-cache lifetimes.

Reuse an existing TypeScript session with `composio.use(sessionId)`. Delete a session either from the instance or by ID:

```ts
await session.delete();
await composio.sessions.delete(sessionId);
```

Deletion takes effect immediately. A deleted, missing, or inaccessible session returns 404 when retrieved; deleting a session does not delete its users, auth configs, or connected accounts.

## Select among multiple accounts with an alias or account ID

When a toolkit has multiple connected accounts, assign clear aliases such as `work`, `personal`, or `primary`, then pass the alias as the execution `account`. Without an alias, use the generated account ID returned by connection discovery.

Do not rely on fuzzy phrases such as “office email” unless a matching alias exists. If explicit account selection is disabled and no `account` is supplied, the session can fall back to its first/default account.

## The session user must match the connected-account user

An account can be active in the dashboard but unavailable to Tool Router when the session uses a different `user_id`. Private accounts resolve for their owning user; explicitly shared or pinned accounts follow the session configuration.

Create the session and connection with the same stable user ID. If a particular account must be used, pass its allowed connected-account override in the session configuration.

## Connected-account selection is live unless pinned

When `connectedAccounts` is omitted, Tool Router resolves currently active accounts for the session user at execution time, including accounts connected after session creation. When `connectedAccounts` is supplied, it is an exact toolkit override and Tool Router does not fall back to another active account for that toolkit.

Adding another account later does not change an explicit pin. Update or recreate the session when the pinned account should change; omit the override when you want live account discovery.

## Toolkit allowlists are enforced before connection lookup

When a session has a non-empty `toolkits.enabled` list, every other toolkit is blocked. A `toolkits.disabled` list does the inverse: listed toolkits are blocked while the rest remain eligible. This restriction is checked before auth configs and connected accounts.

If Tool Router reports `[Session Restriction] Toolkit '<name>' is not allowed`, update or recreate the session's toolkit configuration first. Only then debug whether that toolkit has an auth config and connection.

## A fresh task context is a new session runtime, not model memory

Every `create()` call returns a new session ID. A session scopes the user,
toolkit and tool access, auth and account selection, and session runtime
resources such as sandbox files. It is not the model's conversation memory.

Reuse a stored session with `composio.use(sessionId)` when a conversation or
workflow should retain the same session configuration and runtime context.
Create a new session for a different user or materially different setup. A new
session for the same user can still resolve that user's eligible connected
accounts, but it does not inherit the old session's sandbox state.

## Auth links create project- and user-scoped connected accounts

`session.authorize()` and `COMPOSIO_MANAGE_CONNECTIONS` create a Connect Link
for the session user and selected auth config. After authentication, the
connected account belongs to that project/user rather than only to the session
that produced the link. Later unpinned sessions for the same stable user can
resolve it; an explicit connected-account pin remains unchanged until the
session is updated or recreated.

## Toolkit filters do not preload every matching tool

By default, a session exposes meta tools that discover and load app tools at
runtime. Enabling a toolkit limits what the session can discover and execute;
it does not put every tool from that toolkit into the initial schema set.

Use an explicit `preload.tools` list when the agent must receive known tools
directly. Use the direct-tools preset or `preload.tools = "all"` only with a
narrow positive filter; broad preload sets are capped and increase agent
context.

## SDK custom tools and Custom MCP toolkits have different runtimes

An SDK-defined custom tool runs inside the customer's application process. Its
function body is not uploaded into Composio and is not automatically callable
from a remote session MCP URL or Remote Workbench.

To expose customer-owned functionality remotely, host it as an MCP server and
register it as a Custom MCP toolkit. The resulting remote tools remain subject
to the session's toolkit and connection restrictions.

## Enhanced Control requires client support for MCP elicitation

For You's Enhanced Control approval flow relies on MCP elicitation. It works
only with clients that advertise and implement that capability. If a client
does not support elicitation, use a supported client, set an applicable
**Always Allow** policy, or disable Enhanced Control under **For You → Settings
→ General** and reconnect the client.

## Pin the intended auth config when a toolkit has multiple auth schemes

Tool Router first uses the auth config explicitly mapped in the session. When
the toolkit supports multiple schemes, map the intended `ac_...` ID rather than
depending on automatic selection. The selected config must belong to the same
project and be enabled for Tool Router. An explicit connected-account override
is an exact toolkit selection and does not fall back to another active account.
