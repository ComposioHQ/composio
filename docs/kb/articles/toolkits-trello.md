Use this guide to connect Trello with OAuth1, route users through current MCP flows, and resolve Trello identities for tools and triggers.

## Connect Trello with OAuth1

Create a customer-owned Trello OAuth1 auth config and have each user complete the provider authorization flow. The current catalog does not advertise a separate bearer-token auth scheme for Trello.

## Route Trello through current MCP and Connect flows

**Route each call to the correct user or account.** For multi-user Trello MCP usage, create the Trello auth config and have users complete the auth flow. Then route MCP calls to the right user/connection by appending `user_id=<external-user-id>` or `connected_account_id=<ca_...>` to the MCP server URL, for example `/mcp?user_id=abcd`.

**Use the generated MCP configuration in Cursor.** To use Trello in Cursor, create a Trello MCP instance/server in Composio, select the Trello tools, then run or add the generated MCP command/config in Cursor. Complete the Trello account connection when prompted by the MCP flow.

**Migrate legacy MCP endpoints.** If you are using `https://mcp.composio.dev/trello` or another legacy Trello MCP endpoint, migrate to Tool Router or Composio Connect. Tool Router and Connect are the supported path for current integrations.

## Resolve Trello users and trigger board IDs

**Get the authenticated Trello user.** Use `TRELLO_GET_MEMBERS_BY_ID_MEMBER` with `idMember` set to `me` to retrieve the authenticated Trello user/member for the current connection.

**Validate board IDs before creating triggers.** If Trello triggers fail, verify the board ID first. Use tools such as `TRELLO_GET_ORGANIZATIONS_BOARDS_BY_ID_ORG` or `TRELLO_GET_BOARDS_BY_ID_BOARD` to retrieve/confirm the board ID, then recreate or retry the trigger with the valid board ID.
