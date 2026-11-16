## How do I connect Instantly with an API key?

Instantly doesn't support OAuth, so you connect with an Instantly API key. You don't need a client ID, client secret, redirect URL, or OAuth scopes.

### Create the API key in Instantly

1. Sign in to Instantly and go to **Settings** > **Integrations** > **API Keys**.

   ![Instantly Settings, Integrations, API Keys page with the Create API Key button](/images/toolkits/instantly/api-keys-page.webp)
2. Create a new API key and select its scopes (see Scopes below). Use a v2 key; v1 keys no longer work.

   ![Instantly Create API Key form with a name and scopes](/images/toolkits/instantly/create-api-key.webp)
3. Copy the key and store it in a secret manager.

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **Instantly**.

   ![Composio Auth Configs page with the Create Auth Config button](/images/toolkits/shared/wIAvY0hheAM7HQEF4kG2KTYATY.webp)

   ![Create Auth Config search results showing Instantly with API_KEY](/images/toolkits/instantly/composio-search-instantly.webp)
2. Keep the authentication type as **API Key** and create the auth config.

   ![Instantly auth config form with API KEY as the authentication method](/images/toolkits/instantly/api-key-auth-config.webp)
3. Click **Connect Account**, paste your Instantly API key, and confirm the account shows as **Active**.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow. Composio sends the key as a bearer token to `https://api.instantly.ai`.

### Scopes

Instantly API keys are scoped when you create them, and you can't change a key's scopes afterward. To change permissions, create a new key and reconnect the account with it.

Scopes follow a `resource:action` pattern, such as `campaigns:read`, `leads:create`, or `analytics:read`. Resources include `campaigns`, `leads`, `lead_lists`, `accounts`, `ai_agents`, `inbox_tests`, `webhooks`, and `api_keys`. `all:all` grants full read, create, update, and delete access to every endpoint. Prefer resource-level scopes, and use `all:all` only if your integration needs everything.
