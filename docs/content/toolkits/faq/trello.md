## Does Trello support OAuth1 and bearer_token authentication?

Trello supports `OAuth1` and `Bearer_token` auth modes in Composio. For user-facing Trello MCP flows, OAuth1 is generally the recommended authentication method because the user can complete the provider auth flow and Composio can store the resulting connection.

## Connect Trello to Cursor by creating a Trello MCP instance and running the generated command

To use Trello in Cursor, create a Trello MCP instance/server in Composio, select the Trello tools, then run or add the generated MCP command/config in Cursor. Complete the Trello account connection when prompted by the MCP flow.

## Invalid Trello board ID can break Trello triggers

If Trello triggers fail, verify the board ID first. Use tools such as `TRELLO_GET_ORGANIZATIONS_BOARDS_BY_ID_ORG` or `TRELLO_GET_BOARDS_BY_ID_BOARD` to retrieve/confirm the board ID, then recreate or retry the trigger with the valid board ID.

## Why can Old Trello auth configs fail after OAuth app changes; create a new auth config?

If Trello tools fail on an older auth config with OAuth/key-related errors, create a new Trello auth config and reconnect the Trello account. Trello OAuth app configuration had changed, old auth config connections returned `401 invalid key`, and new auth configs worked.

## Legacy mcp.composio.dev Trello endpoint should be migrated to Tool Router or Connect

If a user is using `https://mcp.composio.dev/trello` or another legacy Trello MCP endpoint, migrate them to Tool Router or Composio Connect. The legacy endpoint was being deprecated, and Tool Router/Connect is the more reliable supported path.
