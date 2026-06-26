## What must EXCEL_UPDATE_RANGE values do?

Pass values as a two-dimensional array, where the outer list represents rows and each inner list contains the cell values for that row. Even a single cell must be wrapped twice, for example {"values": [["92"]]}.

## How should I handle excel upload tools accept structured workbook data?

Use the revamped Excel tool shape that accepts structured data through worksheet_names and worksheet_data lists/dicts. The tool generates the .xlsx file before upload, instead of requiring the caller or LLM to provide binary workbook content directly.

## What can cause EXCEL_GET_RANGE failures?

If get range appears to fail while the tool itself is working, verify that the workbook actually has the requested worksheet name, such as Sheet1, and that the item_id being passed is the correct file ID for that workbook.

## When should I use Excel toolkit actions for workbook operations on SharePoint-backed Excel files?

For workbook operations, use the Excel toolkit actions because they are Excel APIs. EXCEL_CLOSE_SESSION, EXCEL_DELETE_WORKSHEET, EXCEL_UPDATE_WORKSHEET, and EXCEL_UPDATE_RANGE as already supported for the remaining Excel use cases.

## How should I handle shared item listing cannot reliably search for a specific shared file?

The shared-items response can change because the underlying sharedWithMe API/tool lacks filters for retrieving a specific expected file after sharing, deleting, or stopping sharing items. Support also could not find an API for a dedicated shared-item search action.

## How should I handle excel support for OAuth2 client credentials may vary by action?

Excel was included in OAuth2 client credentials work for O365 toolkits, but action-level support needs validation because some actions only work with user-delegated tokens in the underlying Microsoft API, while others require compatibility fixes for application-only tokens.

## How should I handle excel uses the Microsoft auth guide at composio.dev/auth/outlook?

For Excel auth setup, use the Microsoft auth guide published at https://composio.dev/auth/outlook. The same guide was referenced for SharePoint, Microsoft Teams, Outlook, and Excel.

## How should I handle upgrade older on-prem versions if Excel schemas contain dollar-sign parameters?

Upgrade to a newer release after the March fixes. the invalid schema keywords were fixed in later versions, CI coverage was added, and upgrading to the latest version should resolve Excel schema parameters that are incompatible with Anthropic models.

## How should I handle generic column formatting and wrapping support was added in the May 13 release?

Support committed to adding wrapping and other sheet operations for the next release on May 13, then confirmed the requested tools were added and available in the latest release.
