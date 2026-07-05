## How should I handle databricks toolkit does not yet support OAuth M2M?

The Databricks toolkit currently supports OAuth2 and API key authentication, but not OAuth M2M/client-credentials/service-principal flow. Treat M2M support as a roadmap/feature-request item. For non-interactive access today, use the API key auth path with a Databricks token where that fits the user's setup.

## How should I handle databricks OAuth client and secret setup reference?

For Databricks OAuth client and secret setup, the ThoughtSpot Databricks OAuth guide can be a useful provider-side reference: https://docs.thoughtspot.com/cloud/10.15.0.cl/connections-databricks-oauth#step-1. Use it when users need help locating Databricks OAuth app/client credentials.

## How should I handle enter Databricks API key credentials during connected account linking?

The Databricks API key credentials are entered during the connection flow. In code, point users to `composio.connected_accounts.link()` for creating the connected account and entering the API key details.

## What does Databricks require for production OAuth setup?

If a toolkit does not offer Composio managed auth, the user should use their own developer credentials/BYOC setup. For production OAuth configurations, BYOC is preferred because it gives control over scopes, OAuth configuration, white-labelling, and avoids shared managed-credential limits.
