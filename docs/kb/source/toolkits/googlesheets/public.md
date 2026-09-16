---
type: "reference"
title: "Google Sheets"
description: "Public support knowledge for Google Sheets."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "googlesheets"
---
# Google Sheets

## Platform Google Sheets connections are isolated from For You Connect MCP

Connections made on the Platform side (`dashboard.composio.dev`) are isolated from the For You / `connect.composio.dev/mcp` flow. A Google Sheets connection created on Platform will not automatically appear in Connect MCP. To use Sheets through Connect MCP, ask the MCP server from the client to connect Google Sheets, complete the surfaced auth link, then retry discovery/execution.

## Fetch more than the default 20 Google Sheets tools with `limit`

`get_raw_composio_tools` returns 20 tools by default. Pass a larger `limit` to fetch the full Google Sheets tool set, for example `.get_raw_composio_tools(toolkits=["GOOGLESHEETS"], limit=1000)`.

## Google Sheets MCP may require the spreadsheet ID instead of searching by name

The Google Sheets MCP flow does not search through spreadsheets by name. Provide the spreadsheet ID directly in the chat/tool call when asking for operations such as getting sheet names.

## Use the current values tools to update, append, or create a populated sheet

Use `GOOGLESHEETS_VALUES_UPDATE` for one range, `GOOGLESHEETS_UPDATE_VALUES_BATCH` for multiple ranges, or `GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND` to append rows. To create and populate a new spreadsheet, call `GOOGLESHEETS_CREATE_GOOGLE_SHEET1` and then one of the current values-update actions. `GOOGLESHEETS_BATCH_UPDATE` and `GOOGLESHEETS_SHEET_FROM_JSON` are deprecated.

## Execute Google Sheets tools by passing the exact tool slug

When executing Google Sheets tools, pass the exact current slug directly as the tool identifier, for example `composio.tools.execute("GOOGLESHEETS_GET_SHEET_NAMES", executePayload)`. If a wrapper parameter like `params.toolIdentifier` is used, verify it resolves to the exact tool slug. The older `GOOGLESHEETS_LIST_TABLES` action is deprecated.

## Google Sheets 403s can be caused by an old placeholder toolkit version

If Google Sheets actions fail with permission errors and logs show the base version `00000000_00`, switch to the latest Google Sheets toolkit version and check the toolkit versioning documentation.

## Use Google Super when one Google connection should cover Gmail, Sheets, Docs, Drive, and other Google tools

For the canonical guidance on using one connection across Google Workspace services, see [Google Super is a unified Google Workspace toolkit](../googlesuper/public.md#google-super-is-a-unified-google-workspace-toolkit).

## Use full Google scope URLs such as `https://www.googleapis.com/auth/drive`, not shorthand `/drive`

When configuring Google scopes manually, use the full scope URL. For Drive access, use `https://www.googleapis.com/auth/drive` rather than shorthand values like `/drive`.

## Google Sheets provider quotas are separate from Composio plan limits

A Google Sheets 429 can come from Google's API quotas even when the Composio
account has remaining tool calls. Google currently documents 300 read requests
and 300 write requests per minute per project, plus 60 reads and 60 writes per
minute per user per project. Apply exponential backoff and check
[Google's current Sheets API limits](https://developers.google.com/workspace/sheets/api/limits)
before relying on those numbers.
