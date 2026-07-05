## Microsoft Teams delegated permissions should be checked with `get_scopes_required` and `toolkit_versions[microsoft_teams]=latest`


For Microsoft Teams scope checks, call `/api/v3/tools/get_scopes_required` with the exact tool slug and include `toolkit_versions[microsoft_teams]=latest` when needed. Without the explicit toolkit version, the API may return data from the old `00000000_00` version.

## Invalid OAuth scope: `ChannelMessage.Read.Group`


If Microsoft Teams OAuth fails before consent with:

AADSTS650053: The application asked for scope 'ChannelMessage.Read.Group' that doesn't exist on the resource Microsoft Graph.

treat `ChannelMessage.Read.Group` as the wrong auth layer for the Composio delegated OAuth flow. It is a Microsoft Teams resource-specific consent (RSC) permission, not a normal Microsoft Graph OAuth scope to include in an OAuth `/authorize` URL.

Use v3.1 or pass `toolkit_versions[microsoft_teams]=latest` when fetching tools/scopes. `MICROSOFT_TEAMS_TEAMS_GET_MESSAGE` on older metadata can return `ChannelMessage.Read.Group`; the latest/v3.1 replacement is `MICROSOFT_TEAMS_GET_CHANNEL_MESSAGE`.

To fix the OAuth config:

- Remove `ChannelMessage.Read.Group` from the OAuth auth config scopes and use `ChannelMessage.Read.All`, `Group.Read.All`, or `Group.ReadWrite.All` according to the latest tool scope response.
- If an existing auth config already includes the bad scope, update/recreate it and reconnect. Existing connected accounts may need refresh/reconnect depending on how the user propagates scope changes.

## `MICROSOFT_TEAMS_CHATS_GET_ALL_CHATS` and `MICROSOFT_TEAMS_CREATE_MEETING` can work with delegated user scopes


`MICROSOFT_TEAMS_CHATS_GET_ALL_CHATS` can use `Chat.ReadBasic`, `Chat.Read`, or `Chat.ReadWrite`. `MICROSOFT_TEAMS_CREATE_MEETING` requires `OnlineMeetings.ReadWrite`. Confirm exact required scopes with the latest versioned scope endpoint before changing auth config scopes.

## When should I use my own Microsoft Teams Azure app?


For Microsoft Teams, recommend using the user's own Azure/Microsoft developer app credentials when custom scopes are needed. Additional scopes should be added in the Microsoft app, and admin consent may need to be granted in Azure before the connection has usable permissions.

## How should I configure Microsoft Teams MCP access?


For Microsoft Teams MCP, the user ID in the MCP server URL/query params must match the user ID attached to the connected account. If the connection is bound to an email/GUID, use that value in the MCP URL or create a new server/connection with the desired user ID.

## Teams chat tools return 400/403/404 when user IDs or chat membership do not match Microsoft Graph expectations


For `MICROSOFT_TEAMS_LIST_USER_CHAT_MESSAGES`, a 400 commonly means `user_id` was not passed as a GUID or UPN. For chat members tools, 403/404 often means the connected user is not part of the meeting chat or the chat ID is not in that user's scope. Use `MICROSOFT_TEAMS_LIST_USERS` to find valid user IDs and verify the connected user is a participant in the target chat.
