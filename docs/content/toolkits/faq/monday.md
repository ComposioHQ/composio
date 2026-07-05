## Why is Monday.com OAuth2 not working for my users?

Monday.com requires a workspace admin to install the OAuth2 app before any user in that workspace can authorize their account. If the app is not installed, users will see an authorization error when trying to connect.

## How do I install the Composio OAuth2 app for Monday.com?

A workspace admin needs to visit the following URL and approve the app installation:

`https://auth.monday.com/oauth2/authorize?client_id=96b038435fc029e045f9ba800e66fefa&response_type=install`

Once the admin has installed the app, users in that workspace can authorize their accounts using OAuth2 as usual.

## Do I need to install the app for each user?

No. The admin only needs to install the app once per workspace. After that, any user in the workspace can connect their Monday.com account through Composio's OAuth2 flow.

## How do I set up custom OAuth credentials for Monday.com?

For a step-by-step guide on creating and configuring your own Monday.com OAuth credentials with Composio, see [How to create OAuth2 credentials for Monday](https://composio.dev/auth/monday).

## How do I configure scopes for Monday.com?

Monday.com doesn't accept scopes in the auth config the way Google does. Scopes are configured on the OAuth app itself. If you're using the default OAuth app, the required scopes are already configured. If creating your own app, add the scopes you need:

```bash
me:read
boards:read
boards:write
docs:read
docs:write
workspaces:read
workspaces:write
users:read
users:write
account:read
notifications:write
updates:read
updates:write
assets:read
tags:read
teams:read
teams:write
webhooks:write
webhooks:read
```

---

## What does Monday require before users can connect?

Monday is unusual among popular toolkits because the OAuth app must be installed in the Monday workspace before users initiate individual OAuth connections. An admin can install the app once for the workspace, then users can connect normally. For Composio's managed Monday app, use this Monday installation link: `https://auth.monday.com/oauth2/authorize?client_id=96b038435fc029e045f9ba800e66fefa&response_type=install`.

## Add the Composio redirect URL to the Monday OAuth app

For a custom Monday OAuth app, add the Composio redirect URL/callback URL to the Monday app settings. After the OAuth flow completes, the access token is populated by Composio automatically.

## What format should `MONDAY_UPDATE_ITEM` body use?

`MONDAY_UPDATE_ITEM` expects the body in a format Monday's API accepts. If the user passes JSON-like text or strings containing quotes/special characters, escape those characters and send a suitable string rather than unsupported raw structured content.

## Why can Tool Router prefer `MONDAY_MCP` over `MONDAY`?

If both `MONDAY` and `MONDAY_MCP` are enabled, Tool Router may choose `MONDAY_MCP` for search/execution. If the user specifically needs the regular Monday toolkit, disable `monday_mcp` in the session or narrow toolkit availability so `COMPOSIO_SEARCH_TOOLS` returns the intended tools.

## Where do Monday scopes come from?

For Monday, the scopes configured on the Monday OAuth app are picked up during authorization. In the common flow, no separate Composio scope configuration is required unless the user is intentionally requesting a subset.

## How should Monday trigger management work?

Trigger setup and management should be handled outside the agent runtime, for example through the CLI/API/dashboard flow. The agent should consume trigger payloads, not create or manage trigger instances as part of normal tool execution.
