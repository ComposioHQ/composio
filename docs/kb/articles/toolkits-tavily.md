## Use TAVILY_SEARCH for Tavily search

Use `TAVILY_SEARCH` from the [Tavily toolkit](/toolkits/tavily) to search the web. If your application uses the retired `composio_search` toolkit, follow [Migrate from No Auth to Instant](/docs/migration-guide/no-auth-to-instant) and update the tool name, arguments, and response handling.

## Initiate Tavily API-key connections in the legacy JS SDK with generic_api_key

For Tavily API-key auth in the legacy JS SDK, list the Tavily integration with `toolset.integrations.list({ appName: "tavily" })`, then initiate the connected account with `appName: "tavily"`, `authMode: "API_KEY"`, the integration ID, and `authConfig: { generic_api_key: "<tavily-api-key>" }`. This was provided as a workaround for a JS SDK issue, so prefer the current SDK flow when available.

## Use Instant for search without a provider account

To use supported Tavily search tools without connecting a separate provider account, [enable Instant](/docs/instant-tools#enable-instant). Instant uses Composio's provider accounts and charges your organization's Composio balance. [Check tool support and rates](/docs/instant-tools#find-supported-tools-and-rates) before execution. You can also connect your own Tavily account with an API key.
