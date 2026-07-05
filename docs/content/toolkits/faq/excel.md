## What format should `EXCEL_UPDATE_RANGE` values use?

Pass values as a two-dimensional array, where the outer list represents rows and each inner list contains the cell values for that row. Even a single cell must be wrapped twice, for example {"values": [["92"]]}.

## Excel upload tools accept structured workbook data

Use the revamped Excel tool shape that accepts structured data through worksheet_names and worksheet_data lists/dicts. The tool generates the .xlsx file before upload, instead of requiring the caller or LLM to provide binary workbook content directly.

## What can cause EXCEL_GET_RANGE failures?

If get range appears to fail while the tool itself is working, verify that the workbook actually has the requested worksheet name, such as Sheet1, and that the item_id being passed is the correct file ID for that workbook.

## When should I use Excel toolkit actions for workbook operations on SharePoint-backed Excel files?

For workbook operations, use the Excel toolkit actions because they are Excel APIs. `EXCEL_CLOSE_SESSION`, `EXCEL_DELETE_WORKSHEET`, `EXCEL_UPDATE_WORKSHEET`, and `EXCEL_UPDATE_RANGE` are already supported for the remaining Excel use cases.

## Shared item listing cannot reliably search for a specific shared file

The shared-items response can change because the underlying Microsoft sharedWithMe API/tool lacks filters for retrieving a specific expected file after sharing, deleting, or stopping sharing items. Use the file ID or drive item metadata when you need to target a specific shared workbook.

## Excel support for OAuth2 client credentials may vary by action

Excel OAuth2 client-credentials behavior can vary by action because some underlying Microsoft APIs require user-delegated tokens. If an Excel action fails with an application-only token, retry with a delegated OAuth connection or verify that Microsoft supports application permissions for that endpoint.

## Which auth guide should I use for Excel?

For Excel auth setup, use the Microsoft auth guide published at https://composio.dev/auth/outlook. The same guide was referenced for SharePoint, Microsoft Teams, Outlook, and Excel.

## Upgrade older on-prem versions if Excel schemas contain dollar-sign parameters

Upgrade to a current release if Excel schemas contain dollar-sign parameters that are incompatible with Anthropic models. Current Excel toolkit versions should expose model-compatible schema fields.

## Generic column formatting and wrapping support was added in the May 13 release

Use the latest Excel toolkit version for generic column formatting, wrapping, and related sheet operations.
