## When should I use toolkit details to inspect SerpAPI required auth fields?

Use `.toolkits.get("serpapi")` to fetch the toolkit details, including required and optional auth fields. For SerpAPI, the connection initiation payload should include a required `generic_api_key` field displayed as `API Key`.

## How should I verify a SerpAPI API key after connecting?

If a key is accepted by the UI or payload but tool calls still fail, troubleshoot the actual key value and provider-side validity rather than assuming the connection flow confirmed the key.

## When should I avoid SERPAPI_EBAY_SEARCH when its schema causes field errors?

If loading all SerpAPI tools fails because of a schema field error, check whether the failing action is `SERPAPI_EBAY_SEARCH`. Other SerpAPI tools may still work. As a workaround, request a specific working action, for example `toolset.get_tools(actions=["SERPAPI_GOOGLE_JOBS_SEARCH"])`, instead of loading the entire SerpAPI app.

## Which search and scraping toolkits can I use alongside SerpAPI?

For search and scraping use cases, Composio has multiple relevant toolkits. SerpAPI is one option, and alternatives include Firecrawl, Exa, Tavily, and Composio Search. Composio Search provides search providers such as Exa and Tavily without separate auth.
