## When should I use latest toolkit version when Google Analytics tools return ToolNotFound or only a few tools?

If Google Analytics tools return `ToolNotFound` or the tools API only returns a small subset of Google Analytics tools, pass the latest toolkit version. For tools listing, use query params like `toolkit_versions=latest&toolkit_slug=google_analytics&limit=1000`. Older pinned/default versions can expose far fewer tools than the latest version.

## Old Google Analytics MCP could show 0 actions because it was auth-only before actions were added

If an older Google Analytics MCP/config shows zero actions, check whether it is using an old toolkit state/version from when Google Analytics was auth-only. Recreate or update the MCP/toolkit version after Google Analytics actions are available, and use latest toolkit versioning when listing tools.

## Add Google Analytics to an MCP config as a selected tool/toolkit

To use Google Analytics through MCP, create an MCP config with Google Analytics selected, or edit an existing MCP config and add Google Analytics as a tool/toolkit. Then follow the MCP quickstart to connect and use the generated MCP configuration.

## Empty Google Analytics reports may be provider data availability rather than Composio failure

If Google Analytics report tools return no data or unexpected data, verify the same query directly against the Google Analytics Data API, such as `properties:runReport`, with the same access token/property/date range. If the direct API call also has no data, it is likely a Google Analytics data availability/property/date-range issue. If the direct API works but the Composio tool does not, contact Composio with the log ID and direct API comparison.
