## Search the web with Tavily

Use `TAVILY_SEARCH` from the `tavily` toolkit. Pass your search text in `query`. Check the [Tavily toolkit catalog](/toolkits/tavily) for available options.

## Initiate Tavily API-key connections in the legacy JS SDK with generic_api_key

For Tavily API-key auth in the legacy JS SDK, list the Tavily integration with `toolset.integrations.list({ appName: "tavily" })`, then initiate the connected account with `appName: "tavily"`, `authMode: "API_KEY"`, the integration ID, and `authConfig: { generic_api_key: "<tavily-api-key>" }`. This was provided as a workaround for a JS SDK issue, so prefer the current SDK flow when available.

## Use Instant without a Tavily API key

Enable [Instant Tools](/docs/instant-tools) in your project to run `TAVILY_SEARCH` without a Tavily API key. Instant uses your organization's Composio balance. If your workflow uses the retired `composio_search` toolkit, update its toolkit filter, tool slug, and arguments. Follow the [migration guide](/docs/migration-guide/no-auth-to-instant) for Sessions and direct execution.
