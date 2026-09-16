## Use COMPOSIO_SEARCH_TAVILY for Tavily search

Use the updated Tavily search tool slug `COMPOSIO_SEARCH_TAVILY` when invoking Tavily search through Composio. If an older Tavily search slug returns schema-related gateway errors, switch to this slug before deeper debugging.

## Initiate Tavily API-key connections in the legacy JS SDK with generic_api_key

For Tavily API-key auth in the legacy JS SDK, list the Tavily integration with `toolset.integrations.list({ appName: "tavily" })`, then initiate the connected account with `appName: "tavily"`, `authMode: "API_KEY"`, the integration ID, and `authConfig: { generic_api_key: "<tavily-api-key>" }`. This was provided as a workaround for a JS SDK issue, so prefer the current SDK flow when available.

## Use composio_search for auth-free Exa/Tavily-style search

For auth-free web search through Composio, use the `composio_search` toolkit, which provides Exa/Tavily and other search capabilities without separate authentication. Use the standalone Tavily toolkit when a workflow specifically needs Tavily as its own provider-backed integration.
