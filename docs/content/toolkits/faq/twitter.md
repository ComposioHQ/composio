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

## What should I do now that Twitter/X managed OAuth is no longer supported?

Composio removed support for the managed/default Twitter OAuth app after X/Twitter suspended the app and moved to its newer pay-per-use API model. For Twitter/X, users should create their own Twitter developer app and configure a custom authConfig with their own credentials. The Twitter setup guide should be used to verify app settings, callback/redirect URLs, scopes, and project linkage before retrying the connection.

## What does Twitter/X cannot be used through Connect when it require?

Connect does not support custom OAuth credentials. Since Twitter/X requires your own developer credentials after managed OAuth support was removed, Twitter integrations that need those credentials must be set up from the main Composio Platform with a custom authConfig. The consumer Connect flow is not the right surface for Twitter when BYOC/custom OAuth is required.

## When should I use Composio's v1 auth-app redirect URI for Twitter OAuth callback mismatch errors?

For Twitter OAuth callback mismatch errors, try configuring `https://backend.composio.dev/api/v1/auth-apps/add` as the redirect URI in the Twitter/X developer app. Composio's v1 URI can be used by default in this flow, so the provider-side callback URL must match it exactly.

## What must Twitter/X posts do?

Twitter/X enforces strict post length limits. For normal posts, keep the content under 280 characters and follow X's official character-counting behavior, since URLs, Unicode, and special characters may be counted by provider-specific rules.

## How should I handle `client-not-enrolled` and `App not linked to project` usually point to Twitter developer app/project setup issues?

These errors usually mean the Twitter/X developer app is not correctly connected to a Twitter developer project, or the OAuth app configuration is stale after X's API model changes. Verify the app is linked to a project, configured according to the Twitter setup guide, and aligned with the current X API requirements. If the connected account is already `EXPIRED`, recreate the connection after fixing the app configuration.

## How should I handle twitter token invalidation incidents can appear as expired connected accounts after skipped refresh attempts?

In the referenced incident, the behavior was specific to Twitter. A small subset of Twitter connected accounts skipped refresh attempts, causing affected connected accounts to appear expired or fail during tool calls. Once the refresh issue is resolved, ask users to retry tool calls and check for remaining execution errors.
