## How should I handle firecrawl uses API-key auth, not OAuth; provide a Firecrawl API key?

Firecrawl does not use a Composio-managed OAuth/test connector flow. It is an API-key toolkit, so the user needs a Firecrawl API key, and in many cases their own Firecrawl subscription/account. If an MCP client does not prompt for the key, provide it through the connection flow or explicitly tell the agent/client to use the Firecrawl API key for authentication.

## How do I create a Firecrawl API-key connected account with generic_api_key?

For Firecrawl API-key auth, create the connected account with `authScheme: "API_KEY"` and a value object containing `status: "ACTIVE"` and `generic_api_key: "fc-..."`. The exact required key names can be checked from the toolkit metadata/connection initiation fields.

## How should I handle FIRECRAWL_SEARCH may be hidden by default tool list limits?

If `FIRECRAWL_SEARCH` or other Firecrawl tools are missing from a tools list, increase the list limit or paginate. The default list can return only the first 20 tools, so request a higher limit such as `limit=1000` when fetching Firecrawl tools.

## How should I handle batch fewer URLs or raise timeout for long Firecrawl scrape jobs?

For Firecrawl scrape timeouts, reduce the number of links per request, such as batching 1-2 links at a time for complex pages, or increase the scrape timeout if the tool call supports it. A useful starting timeout is `120000` milliseconds for roughly a 2-minute timeout.

## What is the Firecrawl API base URL?

The Firecrawl API base URL is `https://api.firecrawl.dev/v1`. If a user must manually enter a base URL for a connection or custom call, use that value.

## When should I use FIRECRAWL_SCRAPE or FIRECRAWL_EXTRACT for web-content retrieval?

For website content retrieval with Firecrawl, use `FIRECRAWL_SCRAPE` to scrape page content or `FIRECRAWL_EXTRACT` for extraction-style workflows. For broader web search, Composio Search may be a better fit depending on the use case.

## What should I know about Connect MCP sessions?

For Connect MCP on the For You side, each user's MCP session is tied to their own Composio consumer account, not the shared workspace context. A Firecrawl connection created under one user's account/workspace will not automatically appear for colleagues in Claude. Each colleague should create/connect their own Firecrawl account connection for their individual Connect MCP session.
