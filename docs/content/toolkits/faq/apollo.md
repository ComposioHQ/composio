## Why can Apollo search or enrichment tools return HTTP 403?

Apollo API keys can be limited to specific endpoint groups. A tool can return HTTP 403 or `Forbidden` when the underlying Apollo API rejects the key for that operation, even if the same key works for simpler checks.

This can affect gated search, enrichment, usage, and outreach tools such as `APOLLO_PEOPLE_SEARCH`, `APOLLO_ORGANIZATION_SEARCH`, `APOLLO_SEARCH_ACCOUNTS`, `APOLLO_SEARCH_OUTREACH_EMAILS`, `APOLLO_PEOPLE_ENRICHMENT`, `APOLLO_BULK_PEOPLE_ENRICHMENT`, `APOLLO_ORGANIZATION_ENRICHMENT`, `APOLLO_BULK_ORGANIZATION_ENRICHMENT`, and `APOLLO_VIEW_API_USAGE_STATS`.

Check that the connected account was created with the Apollo API key in the `generic_api_key` field. In Apollo, confirm that the key has the relevant endpoint access or has **Set as master key** turned on. Also check the Apollo plan, API access, and credit limits for the operation you are running. `APOLLO_GET_AUTH_STATUS` can succeed even when a gated tool returns 403, so treat it as a credential-validity check, not proof that the key can run every Apollo tool.

## Why can APOLLO_PEOPLE_ENRICHMENT work while APOLLO_BULK_PEOPLE_ENRICHMENT returns no match?

`APOLLO_PEOPLE_ENRICHMENT` is the single-person enrichment tool. It works best with a strong unique identifier such as `id`, `email`, `hashed_email`, or `linkedin_url`. It can also match on `first_name` and `last_name` when you include `organization_name` or `domain`.

`APOLLO_BULK_PEOPLE_ENRICHMENT` is for multiple people at once. Send each person as its own object in the bulk `details` list, and include the strongest identifiers you have for each record. A name-only record, or a record with weak company context, can return a successful response but still produce a missing record or `null` match.

If single enrichment finds a person but bulk enrichment does not, strengthen the bulk input instead of assuming the same minimal fields will match in both tools. Prefer `email` or `linkedin_url` when available; otherwise include `first_name`, `last_name`, and `organization_name` or `domain` for every item in `details`. If `reveal_phone_number` is enabled, include `webhook_url` as required by Apollo.
