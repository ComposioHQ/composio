## When should I use External Pages or a custom agent when connecting MCP knowledge to Intercom Fin?


Composio does not control how Intercom Fin retrieves knowledge inside Intercom. For this use case, either push MCP-derived content into Fin's Content Library by creating and managing Intercom External Pages, or build a custom AI agent with Composio SDKs that connects to both the MCP server and Intercom for support workflows such as replying to conversations, creating tickets, and managing contacts.

## When should I avoid proxy execute for slow Intercom API calls that can hit Cloudflare 520 timeouts?


If an Intercom API request is slow enough to exceed proxy/edge timeout behavior, prefer the built-in Intercom tool when available, or call the Intercom API directly from a custom tool by fetching the connection access token and injecting it during execution.

## Intercom OAuth tokens cannot be programmatically revoked by Composio


Intercom is one of the providers where Composio cannot programmatically revoke OAuth tokens because the provider does not expose a supported revocation API for this flow. For Intercom connections, ask end users to remove the connection manually from Intercom's app settings and then re-authorize if needed.
