---
type: "reference"
title: "Excel"
description: "Public support knowledge for Excel."
category: "authentication"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "excel"
---
# Excel


## EXCEL_UPDATE_RANGE values must be a 2D array

Pass values as a two-dimensional array, where the outer list represents rows and each inner list contains the cell values for that row. Even a single cell must be wrapped twice, for example {"values": [["92"]]}.

## Excel upload tools accept structured workbook data

Use the revamped Excel tool shape that accepts structured data through worksheet_names and worksheet_data lists/dicts. The tool generates the .xlsx file before upload, instead of requiring the caller or LLM to provide binary workbook content directly.

## EXCEL_GET_RANGE failures can come from sheet name or item_id mismatches

If get range appears to fail while the tool itself is working, verify that the workbook actually has the requested worksheet name, such as Sheet1, and that the item_id being passed is the correct file ID for that workbook.

## Use Excel toolkit actions for workbook operations on SharePoint-backed Excel files

For workbook operations, use the Excel toolkit actions because they are Excel APIs. Support identified EXCEL_CLOSE_SESSION, EXCEL_DELETE_WORKSHEET, EXCEL_UPDATE_WORKSHEET, and EXCEL_UPDATE_RANGE as already supported for the remaining Excel use cases.

## Excel uses the Microsoft auth guide at composio.dev/auth/outlook

For Excel auth setup, use the Microsoft auth guide published at https://composio.dev/auth/outlook. The same guide applies to SharePoint, Microsoft Teams, Outlook, and Excel.

## Upgrade if Excel schemas contain dollar-sign parameters

Upgrade to the latest available release when an older Excel schema exposes
dollar-sign parameter names that the model provider rejects. The current schema
no longer uses those invalid top-level parameter names.

## Generic column formatting and wrapping are available in current versions

Generic column wrapping and related sheet operations are available in the current Excel toolkit. If they are missing from the action schema, switch to the latest toolkit version.
