## How do I connect Apollo with an API key?

Apollo uses API key authentication. There's no OAuth flow and no scopes; Apollo enforces access based on your plan and the key's settings.

### Create the Apollo API key

1. Sign in to [Apollo](https://app.apollo.io/) with an account that has admin access.
2. Go to **Admin Settings** > **Integrations**, then open **API** > **API Keys**.

   ![Apollo Admin Settings menu with Integrations](/images/toolkits/apollo/admin-settings-menu.webp)

   ![Apollo Integrations settings with the API integration](/images/toolkits/apollo/integrations-api.webp)
3. Click **Create a new key** and give it a name.
4. Turn on **Set as master key** so the key can reach every endpoint Composio's tools call.
5. Copy the key and store it somewhere safe. You may not be able to view it again.

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **Apollo**.

   ![Composio Auth Configs page with the Create Auth Config button](/images/toolkits/shared/wIAvY0hheAM7HQEF4kG2KTYATY.webp)

   ![Create Auth Config drawer searching for Apollo](/images/toolkits/apollo/select-apollo.webp)
2. Make sure the authentication type is **API Key**, then create the auth config.

   ![Apollo auth config form with API Key as the authentication method](/images/toolkits/apollo/auth-config-api-key.webp)
3. Click **Connect Account**, paste your Apollo API key, and click **Connect Account**.

   ![Composio connection form asking for the Apollo API key](/images/toolkits/apollo/paste-api-key.webp)
4. Confirm the account shows as **Active**. To test it, run a search tool such as `APOLLO_ORGANIZATION_SEARCH` from the playground.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

## Why can Apollo search or enrichment tools return HTTP 403?

Apollo API keys can be limited to specific endpoint groups. A tool can return HTTP 403 or `Forbidden` when the underlying Apollo API rejects the key for that operation, even if the same key works for other Apollo tools.

This can affect gated search, enrichment, usage, and outreach tools such as `APOLLO_PEOPLE_SEARCH`, `APOLLO_ORGANIZATION_SEARCH`, `APOLLO_SEARCH_ACCOUNTS`, `APOLLO_SEARCH_OUTREACH_EMAILS`, `APOLLO_PEOPLE_ENRICHMENT`, `APOLLO_BULK_PEOPLE_ENRICHMENT`, `APOLLO_ORGANIZATION_ENRICHMENT`, `APOLLO_BULK_ORGANIZATION_ENRICHMENT`, and `APOLLO_VIEW_API_USAGE_STATS`.

In Apollo, make sure the API key has access to the relevant endpoint group or has **Set as master key** turned on. If the Apollo plan does not include the requested API feature, the tool can still return 403 until that access is enabled in Apollo.
