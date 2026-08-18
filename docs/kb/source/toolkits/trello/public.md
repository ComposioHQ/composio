---
type: "reference"
title: "Trello"
description: "Public support knowledge for Trello."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "trello"
---
# Trello


## Trello currently uses OAuth1 authentication

Create a customer-owned Trello OAuth1 auth config and have each user complete
the provider authorization flow. The current catalog does not advertise a
separate bearer-token auth scheme for Trello.

## Route Trello MCP calls by appending user_id or connected_account_id

For multi-user Trello MCP usage, create the Trello auth config and have users complete the auth flow. Then route MCP calls to the right user/connection by appending `user_id=<external-user-id>` or `connected_account_id=<ca_...>` to the MCP server URL, for example `/mcp?user_id=abcd`.

## Connect Trello to Cursor by creating a Trello MCP instance and running the generated command

To use Trello in Cursor, create a Trello MCP instance/server in Composio, select the Trello tools, then run or add the generated MCP command/config in Cursor. Complete the Trello account connection when prompted by the MCP flow.

## Get the authenticated Trello user with TRELLO_GET_MEMBERS_BY_ID_MEMBER and idMember=me

Use `TRELLO_GET_MEMBERS_BY_ID_MEMBER` with `idMember` set to `me` to retrieve the authenticated Trello user/member for the current connection.

## Invalid Trello board ID can break Trello triggers

If Trello triggers fail, verify the board ID first. Use tools such as `TRELLO_GET_ORGANIZATIONS_BOARDS_BY_ID_ORG` or `TRELLO_GET_BOARDS_BY_ID_BOARD` to retrieve/confirm the board ID, then recreate or retry the trigger with the valid board ID.

## Legacy mcp.composio.dev Trello endpoint should be migrated to Tool Router or Connect

If a customer is using `https://mcp.composio.dev/trello` or another legacy Trello MCP endpoint, migrate them to Tool Router or Composio Connect. The legacy endpoint was being deprecated, and Tool Router/Connect is the more reliable supported path.
