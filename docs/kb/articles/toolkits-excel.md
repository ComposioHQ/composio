Use this guide to pass valid Excel workbook inputs, operate on SharePoint-backed files, and keep Microsoft auth and tool schemas current.

## Pass valid inputs to Excel workbook actions

**Send range values as a two-dimensional array.** Pass values as a two-dimensional array, where the outer list represents rows and each inner list contains the cell values for that row. Even a single cell must be wrapped twice, for example {"values": [["92"]]}.

**Use structured workbook data for uploads.** Use the revamped Excel tool shape that accepts structured data through worksheet_names and worksheet_data lists/dicts. The tool generates the .xlsx file before upload, instead of requiring the caller or LLM to provide binary workbook content directly.

**Check the worksheet name and workbook item ID when `EXCEL_GET_RANGE` fails.** If get range appears to fail while the tool itself is working, verify that the workbook actually has the requested worksheet name, such as Sheet1, and that the item_id being passed is the correct file ID for that workbook.

**Use Excel actions for SharePoint-backed workbook operations.** For workbook operations, use the Excel toolkit actions because they are Excel APIs. Support identified EXCEL_CLOSE_SESSION, EXCEL_DELETE_WORKSHEET, EXCEL_UPDATE_WORKSHEET, and EXCEL_UPDATE_RANGE as already supported for the remaining Excel use cases.

## Configure Excel authentication and current tool schemas

**Use the shared Microsoft auth guide.** For Excel auth setup, use the Microsoft auth guide published at https://composio.dev/auth/outlook. The same guide applies to SharePoint, Microsoft Teams, Outlook, and Excel.

**Upgrade schemas that expose dollar-sign parameters.** Upgrade to the latest available release when an older Excel schema exposes dollar-sign parameter names that the model provider rejects. The current schema no longer uses those invalid top-level parameter names.

**Use current versions for column formatting and wrapping.** Generic column wrapping and related sheet operations are available in the current Excel toolkit. If they are missing from the action schema, switch to the latest toolkit version.
