## Does Trello support OAuth1 and bearer_token authentication?

Trello supports `OAuth1` and `Bearer_token` auth modes in Composio. For user-facing Trello MCP flows, OAuth1 is generally the recommended authentication method because the user can complete the provider auth flow and Composio can store the resulting connection.

## Route Trello MCP calls by appending user_id or connected_account_id

For multi-user Trello MCP usage, create the Trello auth config and have users complete the auth flow. Then route MCP calls to the right user/connection by appending `user_id=<external-user-id>` or `connected_account_id=<ca_...>` to the MCP server URL, for example `/mcp?user_id=abcd`.

## Connect Trello to Cursor by creating a Trello MCP instance and running the generated command

To use Trello in Cursor, create a Trello MCP instance/server in Composio, select the Trello tools, then run or add the generated MCP command/config in Cursor. Complete the Trello account connection when prompted by the MCP flow.

## Get the authenticated Trello user with TRELLO_GET_MEMBERS_BY_ID_MEMBER and idMember=me

Use `TRELLO_GET_MEMBERS_BY_ID_MEMBER` with `idMember` set to `me` to retrieve the authenticated Trello user/member for the current connection.

## Invalid Trello board ID can break Trello triggers

If Trello triggers fail, verify the board ID first. Use tools such as `TRELLO_GET_ORGANIZATIONS_BOARDS_BY_ID_ORG` or `TRELLO_GET_BOARDS_BY_ID_BOARD` to retrieve/confirm the board ID, then recreate or retry the trigger with the valid board ID.

## Why can Old Trello auth configs fail after OAuth app changes; create a new auth config?

If Trello tools fail on an older auth config with OAuth/key-related errors, create a new Trello auth config and reconnect the Trello account. Trello OAuth app configuration had changed, old auth config connections returned `401 invalid key`, and new auth configs worked.

## Legacy mcp.composio.dev Trello endpoint should be migrated to Tool Router or Connect

If a user is using `https://mcp.composio.dev/trello` or another legacy Trello MCP endpoint, migrate them to Tool Router or Composio Connect. The legacy endpoint was being deprecated, and Tool Router/Connect is the more reliable supported path.
