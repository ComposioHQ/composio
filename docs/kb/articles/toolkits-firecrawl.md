Use this guide to connect Firecrawl with an API key, discover and run its tools, configure scrape endpoints and timeouts, and use it through Connect MCP.

## Connect Firecrawl with an API key

**Use API-key auth instead of OAuth.** Firecrawl does not use a Composio-managed OAuth/test connector flow. It is an API-key toolkit, so you need a Firecrawl API key and, in many cases, your own Firecrawl subscription/account. If an MCP client does not prompt for the key, provide it through the connection flow or explicitly tell the agent/client to use the Firecrawl API key for authentication.

**Create the connected account with `generic_api_key`.** For Firecrawl API-key auth, create the connected account with `authScheme: "API_KEY"` and a value object containing `status: "ACTIVE"` and `generic_api_key: "fc-..."`. The exact required key names can be checked from the toolkit metadata/connection initiation fields.

## Discover and run Firecrawl tools

**Increase the tool-list limit when actions are missing.** If `FIRECRAWL_SEARCH` or other Firecrawl tools are missing from a tools list, increase the list limit or paginate. The default list can return only the first 20 tools, so request a higher limit such as `limit=1000` when fetching Firecrawl tools.

**Choose the retrieval tool that matches the task.** For website content retrieval with Firecrawl, use `FIRECRAWL_SCRAPE` to scrape page content or `FIRECRAWL_EXTRACT` for extraction-style workflows. For broader web search, Composio Search may be a better fit depending on the use case.

## Configure endpoints and scrape timeouts

**Batch fewer URLs or raise the timeout for long scrape jobs.** For Firecrawl scrape timeouts, reduce the number of links per request, such as batching 1-2 links at a time for complex pages, or increase the scrape timeout if the tool call supports it. A useful starting value is `timeout: 120000` for roughly a 2-minute timeout.

**Use the Firecrawl v1 API base URL.** The Firecrawl API base URL is `https://api.firecrawl.dev/v1`. If you must manually enter a base URL to unblock a connection or custom call, use that value. If the toolkit should have supplied it automatically, contact Composio support with the connection details.

## Use Firecrawl with Connect MCP

**Connect Firecrawl separately for each consumer account.** For Connect MCP on the For You side, each user's MCP session is tied to their own Composio consumer account, not the shared workspace context. A Firecrawl connection created under one user's account/workspace will not automatically appear for colleagues in Claude. Each colleague should create/connect their own Firecrawl account connection for their individual Connect MCP session.
