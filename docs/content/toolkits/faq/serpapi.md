## When should I use toolkit details to inspect SerpAPI required auth fields?

Use `.toolkits.get("serpapi")` to fetch the toolkit details, including required and optional auth fields. For SerpAPI, the connection initiation payload should include a required `generic_api_key` field displayed as `API Key`.

## How should I handle serpAPI API key validation was not available in the connection flow?

At the time of the response, Composio did not validate the SerpAPI API key during the connection flow. If a key is accepted by the UI or payload but tool calls still fail, troubleshoot the actual key value and provider-side validity rather than assuming the connection flow confirmed the key.

## When should I avoid SERPAPI_EBAY_SEARCH when its schema causes field errors?

If loading all SerpAPI tools fails because of a schema field error, check whether the failing action is `SERPAPI_EBAY_SEARCH`. Other SerpAPI tools may still work. As a workaround, request a specific working action, for example `toolset.get_tools(actions=["SERPAPI_GOOGLE_JOBS_SEARCH"])`, instead of loading the entire SerpAPI app.

## How should I handle search and scraping use cases can use SerpAPI alongside Firecrawl, Exa, Tavily, or Composio Search?

For search and scraping use cases, Composio has multiple relevant toolkits. SerpAPI is one option, and alternatives mentioned  include Firecrawl, Exa, Tavily, and Composio Search. Composio Search was specifically suggested as an option that provides search providers such as Exa and Tavily without separate auth.
