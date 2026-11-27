## How do I connect Gorgias with Composio-managed OAuth?

With managed OAuth you don't need your own Gorgias app or client credentials. The flow starts in Gorgias and finishes in Composio.

1. In Gorgias, go to **Settings** > **App Store** > **All Apps**, search for **Composio**, open it, and click **Authorize**.

   ![Gorgias All apps search results showing Composio](/images/toolkits/gorgias/app-store-search.webp)

   ![Composio app page in the Gorgias App Store with the Authorize button](/images/toolkits/gorgias/composio-app-authorize.webp)
2. In the Composio dashboard, open your project's **Toolkits** page, search for **Gorgias**, and click **Add to Project**.

   ![Composio Toolkits page with the Gorgias panel and Add to Project button](/images/toolkits/gorgias/add-to-project.webp)
3. Name the auth config, click **Next**, choose **OAuth 2.0** > **Composio Managed**, and click **Create Gorgias Auth Config**.

   ![Gorgias auth config Config Name field with the Next button](/images/toolkits/gorgias/config-name.webp)

   ![Gorgias auth config with OAuth 2.0 and Composio Managed selected](/images/toolkits/gorgias/managed-oauth.webp)
4. Open the auth config and click **Connect Account**. Enter your Gorgias subdomain: for `acme.gorgias.com`, enter `acme`.

   ![Composio connect screen asking for the Gorgias subdomain](/images/toolkits/gorgias/enter-subdomain.webp)
5. Review the Gorgias permission screen, click **Authorize**, and confirm the account shows as **Active** in Composio.

## How do I set up custom OAuth credentials for Gorgias?

Use your own Gorgias OAuth app only if your organization must use its own client credentials. This requires a [Gorgias Partner Portal](https://partners.gorgias.com/login) account, which is separate from your Gorgias helpdesk login.

### Create the Gorgias app

1. In the Partner Portal, click **Create New App**.

   ![Gorgias Partner Portal My Apps page with the Create New App button](/images/toolkits/gorgias/partner-portal-my-apps.webp)
2. Enter an app name (such as `Composio Integration`), an app tagline, an app icon (required), and your app URL.
3. In **Redirect URLs**, paste `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the `oauth_redirect_uri` field in your Composio auth config.

   ![Gorgias Create New App form with the Composio redirect URL](/images/toolkits/gorgias/create-app-redirect-url.webp)
4. Select the OAuth scopes your integration needs, then click **Create**.
5. Open the app in the Partner Portal and copy the **Client ID** and **Client Secret**.

   ![Gorgias app OAuth2 section with redacted Client ID and Client Secret](/images/toolkits/gorgias/oauth-credentials.webp)

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **Gorgias**.
2. Set the authentication type to **OAuth2** and choose **Use your own developer authentication**.
3. Paste the **Client ID** and **Client Secret**, enter the same scopes you selected in the Gorgias app, then click **Create Gorgias Auth Config**.
4. Click **Connect Account**, enter your Gorgias subdomain (`acme` for `acme.gorgias.com`), authorize, and confirm the account shows as **Active**.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The default auth config requests read and write scopes for account, users, customers, tickets, custom fields, events, integrations, jobs, macros, rules, satisfaction surveys, tags, and apps, plus `statistics:read`, `openid`, `email`, `profile`, and `offline`. Keep the scopes in the Gorgias app and the auth config the same, and request only what your integration uses.

### API base URL

Composio sends Gorgias API calls to `https://{subdomain}.gorgias.com/api/`, using the subdomain you enter when you connect.
