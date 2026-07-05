## Old Google Analytics MCP could show 0 actions because it was auth-only before actions were added

If an older Google Analytics MCP/config shows zero actions, check whether it is using an old toolkit state/version from when Google Analytics was auth-only. Recreate or update the MCP/toolkit version after Google Analytics actions are available, and use latest toolkit versioning when listing tools.

## Why can Google Analytics report tools return no data?

If Google Analytics report tools return no data or unexpected data, first check the property ID, date range, metrics, dimensions, filters, and whether the connected Google account has access to the selected property. Empty reports can happen when the property has no matching data for the requested date range or when the filters are too narrow.

Start with a broader date range and a simple metric/dimension set, then narrow the query once data appears. If the Google Analytics dashboard shows data for the same property and date range but the Composio tool still returns an empty or inconsistent response, contact Composio with the tool slug, property ID, date range, requested metrics/dimensions, and recent tool execution log ID.
