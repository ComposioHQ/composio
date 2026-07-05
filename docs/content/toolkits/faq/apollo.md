## Apollo 403s on search/enrichment endpoints can be key-permission or plan-access gated

For Apollo 403 errors on search/enrichment-style endpoints, first confirm whether the user is using an Apollo API key with the relevant endpoint enabled or with **Set as master key** turned on. Apollo documents People API Search as requiring a master API key, and Apollo API keys can be created with either individual endpoint access or master-key access. Apollo also gates advanced API access by plan, so a 403 can be Apollo-side endpoint permission, master-key, credit/API-access, or plan gating even when other Apollo tools work.

## Apollo people enrichment and bulk enrichment can behave differently

Apollo's single people enrichment and bulk people enrichment APIs do not behave identically. `APOLLO_PEOPLE_ENRICHMENT` and `APOLLO_BULK_PEOPLE_ENRICHMENT` call different upstream Apollo endpoints, and the bulk endpoint may require more complete or different unique person details. If single enrichment works but bulk enrichment does not, compare against Apollo's official bulk people enrichment API behavior before treating it as a Composio response transformation issue. Composio does not intentionally modify the upstream Apollo response.

## Apollo search results may mirror Apollo's official API behavior

When Apollo search returns unexpected results, compare the Composio tool call with the equivalent Apollo official API request using the same query parameters and API key. If Apollo's official endpoint returns the same response, the behavior is upstream from Apollo rather than a Composio transformation. Use the direct Apollo API curl as the baseline for troubleshooting search filters and response differences.
