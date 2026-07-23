---
type: reference
title: "Google Sheets"
description: "Customer-safe support knowledge for Google Sheets."
category: toolkits/googlesheets
visibility: public
timestamp: 2026-06-24T00:00:00Z
tags:
  - googlesheets
---
# Google Sheets

## Google Sheets 429s are Google's API quota, and shared default OAuth can hit shared limits

Google Sheets read/write operations are subject to Google's own API limits. When customers use Composio's default Google OAuth app, the Google API quota is shared across many users, so high-volume usage can hit rate limits even if the customer's Composio plan has capacity. For production/high-volume workflows, use the customer's own Google OAuth credentials to get dedicated quota and more control over rate limits. Composio may pursue quota increases, but shared quota can still fall short under heavy load.

## Platform Google Sheets connections are isolated from For You Connect MCP

Connections made on the Platform side (`dashboard.composio.dev`) are isolated from the For You / `connect.composio.dev/mcp` flow. A Google Sheets connection created on Platform will not automatically appear in Connect MCP. To use Sheets through Connect MCP, ask the MCP server from the client to connect Google Sheets, complete the surfaced auth link, then retry discovery/execution.

## Old Google Sheets integrations may need a new integration to access newer scoped actions

Scopes cannot always be added to an existing Google Sheets integration if the required permissions belong to a newer Google OAuth client/app. Create a new integration/auth config using the newer OAuth app with the required scopes. Existing users can continue on the old integration; only users who need the new action must connect to the new integration and re-authenticate.

## `This app is blocked` means the requested Google scope is not verified on the OAuth app

Google shows `This app is blocked` when the requested scopes are not verified for the OAuth app being used. With Composio's default Google OAuth app, use the default approved scopes and do not add extra scopes unless they are verified on that app. If the customer needs granular or additional sensitive/restricted scopes, they should use their own Google OAuth credentials where those scopes are configured and verified.

## Google Sheets access cannot be restricted at folder level through Composio

Composio does not add folder-level spreadsheet restrictions, and Google's API access model does not support Sheets access scoped to a Drive folder in that way. Access is managed at the account/spreadsheet level through OAuth scopes and file sharing. Use scopes and spreadsheet/account permissions rather than expecting a folder-level Sheets restriction.

## Fetch more than the default 20 Google Sheets tools with `limit`

`get_raw_composio_tools` returns 20 tools by default. Pass a larger `limit` to fetch the full Google Sheets tool set, for example `.get_raw_composio_tools(toolkits=["GOOGLESHEETS"], limit=1000)`.

## Google Sheets MCP may require the spreadsheet ID instead of searching by name

The Google Sheets MCP flow does not search through spreadsheets by name. Provide the spreadsheet ID directly in the chat/tool call when asking for operations such as getting sheet names.

## Use `GOOGLESHEETS_BATCH_UPDATE` or `GOOGLESHEETS_SHEET_FROM_JSON` to add values

Use `GOOGLESHEETS_BATCH_UPDATE` when updating or adding values to an existing sheet. If the workflow starts from structured JSON and needs to create/populate a sheet, use `GOOGLESHEETS_SHEET_FROM_JSON`.

## Execute Google Sheets tools by passing the exact tool slug

When executing Google Sheets tools, pass the exact slug directly as the tool identifier, for example `composio.tools.execute("GOOGLESHEETS_LIST_TABLES", executePayload)`. If a wrapper parameter like `params.toolIdentifier` is used, verify it resolves to the exact tool slug.

## Google Sheets 403s can be caused by an old placeholder toolkit version

If Google Sheets actions fail with permission errors and logs show an old version such as `00000000_00`, switch to `20260324_00` or the latest Google Sheets toolkit version and check the toolkit versioning documentation.

## Use Google Super when one Google connection should cover Gmail, Sheets, Docs, Drive, and other Google tools

For the canonical guidance on using one connection across Google Workspace services, see [Google Super is a unified Google Workspace toolkit](../googlesuper/public.md#google-super-is-a-unified-google-workspace-toolkit).

## Use full Google scope URLs such as `https://www.googleapis.com/auth/drive`, not shorthand `/drive`

When configuring Google scopes manually, use the full scope URL. For Drive access, use `https://www.googleapis.com/auth/drive` rather than shorthand values like `/drive`.
