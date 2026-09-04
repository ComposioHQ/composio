---
type: "reference"
title: "Microsoft Teams"
description: "Public support knowledge for Microsoft Teams."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "microsoft_teams"
---
# Microsoft Teams


## Microsoft Teams delegated permissions should be checked with `get_scopes_required` and `toolkit_versions[microsoft_teams]=latest`

For Microsoft Teams scope checks, call `/api/v3/tools/get_scopes_required` with the exact tool slug and include `toolkit_versions[microsoft_teams]=latest` when needed. Without the explicit toolkit version, the API may return data from the old `00000000_00` version.

## Invalid OAuth scope: `ChannelMessage.Read.Group`

If Microsoft Teams OAuth fails before consent with:

```text
AADSTS650053: The application asked for scope 'ChannelMessage.Read.Group' that doesn't exist on the resource Microsoft Graph.
```

treat `ChannelMessage.Read.Group` as the wrong auth layer for the Composio delegated OAuth flow. It is a Microsoft Teams resource-specific consent (RSC) permission, not a normal Microsoft Graph OAuth scope to include in an OAuth `/authorize` URL.

Debug steps:

- Check whether the customer is using v3 base/default tool metadata or old Teams slugs.

- `MICROSOFT_TEAMS_TEAMS_GET_MESSAGE` on v3 base can return `ChannelMessage.Read.Group`; the latest/v3.1 replacement is `MICROSOFT_TEAMS_GET_CHANNEL_MESSAGE`.

- Ask the customer to use v3.1 or pass `toolkit_versions[microsoft_teams]=latest` when fetching tools/scopes.

- Remove `ChannelMessage.Read.Group` from the OAuth auth config scopes and use `ChannelMessage.Read.All`, `Group.Read.All`, or `Group.ReadWrite.All` according to the latest tool scope response.

- If an existing auth config already includes the invalid scope, update or recreate it and reconnect. Existing connected accounts may need refresh/reconnect depending on how the customer propagates scope changes.

Minimal stale-path repro:

```bash
curl --globoff 'https://backend.composio.dev/api/v3/tools/MICROSOFT_TEAMS_TEAMS_GET_MESSAGE' \
  -H 'x-api-key: <key>'
```

Expected stale response includes `version: "00000000_00"` and `scopes: ["ChannelMessage.Read.Group"]`.

Clean path:

```bash
curl --globoff 'https://backend.composio.dev/api/v3.1/tools/MICROSOFT_TEAMS_GET_CHANNEL_MESSAGE' \
  -H 'x-api-key: <key>'
```

Expected clean response includes `ChannelMessage.Read.All`, not `ChannelMessage.Read.Group`.

## `MICROSOFT_TEAMS_CHATS_GET_ALL_CHATS` and `MICROSOFT_TEAMS_CREATE_MEETING` can work with delegated user scopes

`MICROSOFT_TEAMS_CHATS_GET_ALL_CHATS` can use `Chat.ReadBasic`, `Chat.Read`, or `Chat.ReadWrite`. `MICROSOFT_TEAMS_CREATE_MEETING` requires `OnlineMeetings.ReadWrite`. Confirm exact required scopes with the latest versioned scope endpoint before changing auth config scopes.

## Microsoft Teams often needs customer-owned Azure OAuth credentials and tenant admin consent

For Microsoft Teams, recommend using the customer's own Azure/Microsoft developer app credentials when custom scopes are needed. Additional scopes should be added in the Microsoft app, and admin consent may need to be granted in Azure before the connection has usable permissions.

## Microsoft Teams one-on-one chat creation needs two users and correct OData bind format

For Microsoft Teams one-on-one chat creation, pass two users, not one. Also make sure the OData bind payload uses the correct role and bind-data format expected by Microsoft Graph.

## Microsoft Teams MCP access is tied to the connected account `user_id` used in the MCP URL

For Microsoft Teams MCP, the user ID in the MCP server URL/query params must match the user ID attached to the connected account. If the connection is bound to an email/GUID, use that value in the MCP URL or create a new server/connection with the desired user ID.

## Teams chat tools return 400/403/404 when user IDs or chat membership do not match Microsoft Graph expectations

For `MICROSOFT_TEAMS_LIST_USER_CHAT_MESSAGES`, a 400 commonly means `user_id` was not passed as a GUID or UPN. For chat members tools, 403/404 often means the connected user is not part of the meeting chat or the chat ID is not in that user's scope. Use `MICROSOFT_TEAMS_LIST_USERS` to find valid user IDs and verify the connected user is a participant in the target chat.

## Microsoft Teams tool listing may return only 20 tools unless `limit` is increased

When fetching Microsoft Teams tools by toolkit, the default list may return only 20 tools. Increase the `limit` parameter or search for exact tool slugs to retrieve the full set.

## Some Microsoft Teams slugs were restored as deprecated aliases with replacement descriptions

Some old Microsoft Teams slugs were deleted during cleanup and then restored with a deprecated flag and descriptions pointing to the correct replacement slugs. If a Teams slug suddenly disappears or changes, check the latest toolkit version/changelog and prefer the replacement slug.

## Tool Router memory for Microsoft Teams should be a list under the toolkit key

When passing Tool Router memory for Microsoft Teams, use a real list under the `microsoft_teams` key, for example `"memory": { "microsoft_teams": ["Session id..."] }`. Do not pass escaped square brackets as a string.
