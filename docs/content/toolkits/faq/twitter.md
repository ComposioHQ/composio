## Why are Composio managed credentials no longer available for Twitter?

As of February 2026, Composio managed credentials for the Twitter toolkit have been removed. You must now bring your own Twitter API credentials. To migrate:

1. Create a Twitter Developer account and obtain API credentials from the [Twitter Developer Portal](https://developer.x.com/en/portal/dashboard).
2. Set up a custom auth configuration with your credentials in Composio.

If you were relying on managed credentials, your Twitter integrations will stop working until you configure your own. See the [changelog entry](/docs/changelog/2026/02/12) for full details.

## Why am I getting rate limit or "UsageCapExceeded" errors on Twitter?

Twitter enforces strict rate limits per app. Use your own OAuth app with appropriate rate limit allocations for production workloads.

## Why can't I access certain Twitter API endpoints?

Twitter enforces plan-based access tiers. Check your project's product and plan for the required permissions at the [Twitter Developer Portal](https://developer.x.com/en/portal/products).

## Why am I getting 403 errors on Twitter API calls?

Your developer account or project may not have the required access level for the endpoint. Check your enrollment and access tier in the Twitter Developer Portal.

---
