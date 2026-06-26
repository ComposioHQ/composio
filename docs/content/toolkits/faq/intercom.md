## When should I use External Pages or a custom agent when connecting MCP knowledge to Intercom Fin?

Composio does not control how Intercom Fin retrieves knowledge inside Intercom. For this use case, either push MCP-derived content into Fin's Content Library by creating and managing Intercom External Pages, or build a custom AI agent with Composio SDKs that connects to both the MCP server and Intercom for support workflows such as replying to conversations, creating tickets, and managing contacts.

## When should I use a custom Intercom developer app if Composio's hosted OAuth app is awaiting Intercom approval?

When Composio's hosted Intercom OAuth app is waiting on Intercom approval for new scopes, users can unblock themselves by creating the integration with their own Intercom developer account/app. Once the hosted app is approved, existing Composio integrations can use the standard connection flow again.

## What does INTERCOM_LIST_ALL_COMPANIES per_page limit mean?

For Intercom company listing through Composio, keep `per_page` at 60 or lower. The generic Intercom pagination page can be misleading for this endpoint; Composio verified the list companies endpoint limit as 60 and updated the field description accordingly.

## How should I handle update Python SDK packages when Intercom tool schemas fail on reserved parameter names?

This reserved-keyword schema issue was reproduced and fixed in the SDK. The user should update both `composio` and `composio-langchain` to the latest available versions; the source thread specifically asked the user to retry with SDK version `0.11.4` after the fix.

## When should I avoid proxy execute for slow Intercom API calls that can hit Cloudflare 520 timeouts?

If an Intercom API request is slow enough to exceed proxy/edge timeout behavior, prefer the built-in Intercom tool when available, or call the Intercom API directly from a custom tool by fetching the connection access token and injecting it during execution. Composio reproduced slow Intercom search behavior and recommended direct API/custom-tool execution while the proxy issue was being fixed.

## How should I handle intercom OAuth tokens cannot be programmatically revoked by Composio?

Intercom is one of the providers where Composio cannot programmatically revoke OAuth tokens because the provider does not expose a supported revocation API for this flow. For Intercom connections, ask end users to remove the connection manually from Intercom's app settings and then re-authorize if needed.
