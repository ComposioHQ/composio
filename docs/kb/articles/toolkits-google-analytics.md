## Use latest toolkit version when Google Analytics tools return ToolNotFound or only a few tools

If Google Analytics tools return `ToolNotFound` or the tools API only returns a small subset of Google Analytics tools, pass the latest toolkit version. For tools listing, use query params like `toolkit_versions=latest&toolkit_slug=google_analytics&limit=1000`. Older pinned/default versions can expose far fewer tools than the latest version.

## Add Google Analytics to an MCP config as a selected tool/toolkit

To use Google Analytics through MCP, create an MCP config with Google Analytics selected, or edit an existing MCP config and add Google Analytics as a tool/toolkit. Then follow the MCP quickstart to connect and use the generated MCP configuration.

## Empty Google Analytics reports may be provider data availability rather than Composio failure

If Google Analytics report tools return no data or unexpected data, compare the same property, date range, dimensions, and metrics through Google Analytics itself or a Proxy Execute request. If the provider returns the same empty result, it is likely a data-availability or query issue. If the equivalent provider request works but the Composio tool does not, contact Composio support with the log ID and a redacted comparison. Never extract or share a token from connected-account data.
