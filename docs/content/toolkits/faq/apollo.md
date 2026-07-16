## Why can Apollo search or enrichment tools return HTTP 403?

Apollo API keys can be limited to specific endpoint groups. A tool can return HTTP 403 or `Forbidden` when the underlying Apollo API rejects the key for that operation, even if the same key works for other Apollo tools.

This can affect gated search, enrichment, usage, and outreach tools such as `APOLLO_PEOPLE_SEARCH`, `APOLLO_ORGANIZATION_SEARCH`, `APOLLO_SEARCH_ACCOUNTS`, `APOLLO_SEARCH_OUTREACH_EMAILS`, `APOLLO_PEOPLE_ENRICHMENT`, `APOLLO_BULK_PEOPLE_ENRICHMENT`, `APOLLO_ORGANIZATION_ENRICHMENT`, `APOLLO_BULK_ORGANIZATION_ENRICHMENT`, and `APOLLO_VIEW_API_USAGE_STATS`.

In Apollo, make sure the API key has access to the relevant endpoint group or has **Set as master key** turned on. If the Apollo plan does not include the requested API feature, the tool can still return 403 until that access is enabled in Apollo.
