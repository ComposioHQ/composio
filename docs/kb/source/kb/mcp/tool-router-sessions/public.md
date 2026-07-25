---
type: guide
title: Tool Router Sessions
description: Customer-safe setup guidance for creating and using Tool Router sessions.
category: mcp/tool-router-sessions
visibility: public
timestamp: 2026-07-16T00:00:00Z
tags:
  - mcp
  - tool-router
  - sessions
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

Reuse an existing TypeScript session with `toolRouter.use(sessionId)`. Delete a session either from the instance or by ID:

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
